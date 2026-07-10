/**
 * @fileoverview Trigger lifecycle, LockService wrapper, and checkpoint
 * persistence to a Drive JSON file (we can't use ScriptProperties for
 * checkpoints because its 500 KB ceiling is too tight for large trees).
 *
 * Trigger handler names (must match function names at call time):
 *   - scheduledArchiveRun  → main recurring archive (Main.gs, Phase 7)
 *   - resumeArchiveRun     → one-off continuation after checkpoint
 *   - sendDailyReportTrigger  / sendWeeklyReportTrigger  (Notifier.gs)
 */

/** @const {string} */
const HANDLER_SCHEDULED = 'scheduledArchiveRun';
/** @const {string} */
const HANDLER_RESUME    = 'resumeArchiveRun';
/** @const {string} */
const HANDLER_DAILY     = 'sendDailyReportTrigger';
/** @const {string} */
const HANDLER_WEEKLY    = 'sendWeeklyReportTrigger';

/** @const {string} */
const CHECKPOINT_FILE_NAME = '.archiver_checkpoint.json';

// ============================================================
// 1) إدارة المُشغّلات (Triggers)
// ============================================================

/**
 * (Re)install the main recurring archive trigger based on the current
 * SCHEDULE_FREQUENCY + SCHEDULE_TIME config. Any existing triggers for
 * the same handler are removed first to prevent duplicates.
 * @return {string} The created trigger ID.
 */
function installSchedule() {
  removeTriggersByHandler_(HANDLER_SCHEDULED);

  const freq = getConfig(PROP_KEYS.SCHEDULE_FREQUENCY)
      || SCHEDULE_FREQ.DAILY;
  const timeStr = getConfig(PROP_KEYS.SCHEDULE_TIME) || '02:00';
  const parts = String(timeStr).split(':');
  const hour   = Math.max(0, Math.min(23, parseInt(parts[0], 10) || 2));
  const minute = Math.max(0, Math.min(59, parseInt(parts[1], 10) || 0));

  const builder = ScriptApp.newTrigger(HANDLER_SCHEDULED).timeBased();
  switch (freq) {
    case SCHEDULE_FREQ.HOURLY:
      builder.everyHours(1);
      break;
    case SCHEDULE_FREQ.WEEKLY:
      builder.everyWeeks(1)
             .onWeekDay(ScriptApp.WeekDay.SUNDAY)
             .atHour(hour).nearMinute(minute);
      break;
    case SCHEDULE_FREQ.CUSTOM:
      // Apps Script لا يدعم Cron الحر — نعود إلى كل ساعة كبديل آمن
      builder.everyHours(1);
      break;
    case SCHEDULE_FREQ.DAILY:
    default:
      builder.everyDays(1).atHour(hour).nearMinute(minute);
  }
  const t = builder.create();
  return t.getUniqueId();
}

/**
 * Install the daily + weekly report triggers based on current config.
 * Safe to call repeatedly (idempotent).
 */
function installNotificationTriggers() {
  removeTriggersByHandler_(HANDLER_DAILY);
  removeTriggersByHandler_(HANDLER_WEEKLY);

  if (getConfig(PROP_KEYS.DAILY_REPORT_ENABLED) === 'true') {
    ScriptApp.newTrigger(HANDLER_DAILY).timeBased()
             .everyDays(1).atHour(7).create();
  }
  // التقرير الأسبوعي صباح الأحد الساعة 7 (مقترح افتراضي)
  ScriptApp.newTrigger(HANDLER_WEEKLY).timeBased()
           .everyWeeks(1).onWeekDay(ScriptApp.WeekDay.SUNDAY)
           .atHour(7).create();
}

/** Delete every trigger owned by this script. */
function removeAllTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
}

/**
 * Schedule a one-off trigger ~1 minute in the future to resume archiving
 * after a checkpoint boundary. If an identical resume trigger already
 * exists, it's cleared first so we don't stack them.
 */
function scheduleImmediateResume() {
  removeTriggersByHandler_(HANDLER_RESUME);
  ScriptApp.newTrigger(HANDLER_RESUME).timeBased()
           .after(60 * 1000).create();
}

/** Remove any pending resume triggers (on clean completion). */
function clearResumeTriggers() {
  removeTriggersByHandler_(HANDLER_RESUME);
}

/**
 * List all installed triggers in a UI-friendly shape.
 * @return {!Array<{handler: string, eventType: string, id: string}>}
 */
function listTriggers() {
  return ScriptApp.getProjectTriggers().map(function(t) {
    return {
      handler:   t.getHandlerFunction(),
      eventType: String(t.getEventType()),
      id:        t.getUniqueId(),
    };
  });
}

/** @private */
function removeTriggersByHandler_(handler) {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

// ============================================================
// 2) قفل الجلسة (LockService)
// ============================================================

/**
 * Try to acquire an exclusive script lock for the current execution.
 * @param {number} [timeoutMs=2000] How long to wait before giving up.
 * @return {?GoogleAppsScript.Lock.Lock} null if not acquired.
 */
function acquireLock(timeoutMs) {
  const lock = LockService.getScriptLock();
  try {
    return lock.tryLock(timeoutMs || 2000) ? lock : null;
  } catch (e) {
    console.warn('[Scheduler] lock error: ' + e);
    return null;
  }
}

/**
 * Release a lock previously acquired via acquireLock(). Safe to call with
 * null or on an already-released lock.
 * @param {?GoogleAppsScript.Lock.Lock} lock
 */
function releaseLock(lock) {
  if (!lock) return;
  try { lock.releaseLock(); }
  catch (e) { /* already released */ }
}

// ============================================================
// 3) نقاط التوقف (Checkpoints)
// ============================================================

/**
 * Persist a session checkpoint as a JSON file in Drive. On first call the
 * file is created under ROOT_DRIVE_FOLDER_ID (or the user's Drive root if
 * none configured) and its ID is cached in ScriptProperties.
 * @param {!Object} state Arbitrary JSON-serialisable state.
 * @return {string} The checkpoint file ID.
 */
function saveCheckpoint(state) {
  const payload = JSON.stringify(Object.assign({
    savedAt: new Date().toISOString(),
  }, state), null, 2);

  const existingId = getConfig(PROP_KEYS.CHECKPOINT_FILE_ID);
  if (existingId) {
    try {
      DriveApp.getFileById(existingId).setContent(payload);
      return existingId;
    } catch (e) {
      console.warn('[Scheduler] checkpoint file unreachable, recreating');
    }
  }

  const rootId = getConfig(PROP_KEYS.ROOT_DRIVE_FOLDER_ID);
  const parent = rootId
      ? DriveApp.getFolderById(rootId)
      : DriveApp.getRootFolder();
  const file = parent.createFile(
      CHECKPOINT_FILE_NAME, payload, 'application/json');
  setConfig(PROP_KEYS.CHECKPOINT_FILE_ID, file.getId());
  return file.getId();
}

/**
 * Read the last saved checkpoint, or null if none exists.
 * @return {?Object}
 */
function loadCheckpoint() {
  const id = getConfig(PROP_KEYS.CHECKPOINT_FILE_ID);
  if (!id) return null;
  try {
    const text = DriveApp.getFileById(id).getBlob().getDataAsString();
    return safeJsonParse(text, null);
  } catch (e) {
    console.warn('[Scheduler] failed to load checkpoint: ' + e);
    return null;
  }
}

/**
 * Remove the checkpoint file and its stored ID. Called on clean session
 * completion so the next run starts fresh.
 */
function clearCheckpoint() {
  const id = getConfig(PROP_KEYS.CHECKPOINT_FILE_ID);
  if (id) {
    try { DriveApp.getFileById(id).setTrashed(true); }
    catch (e) { /* already gone */ }
  }
  deleteConfig(PROP_KEYS.CHECKPOINT_FILE_ID);
}
