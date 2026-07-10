/**
 * @fileoverview Web App entry point and the ui* API surface consumed by
 * the client (via google.script.run in Scripts.html).
 *
 * Security note: the Web App is deployed with
 *   "executeAs": "USER_DEPLOYING"  +  "access": "MYSELF"
 * in appsscript.json — only the deploying user can reach doGet at all,
 * and all code runs as that user. assertAuthorized_() is an in-function
 * defence-in-depth check; Apps Script itself enforces the access rule.
 */

// ============================================================
// 1) Web App lifecycle
// ============================================================

/**
 * Serve the main SPA page.
 * @param {!GoogleAppsScript.Events.DoGet} e
 * @return {!GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
  initializeDefaults();
  const tpl = HtmlService.createTemplateFromFile('ui/Index');
  // Mint a CSRF token bound to the current user and inject it into the
  // template. The SPA echoes it back on every state-changing call so
  // the server can bind requests to this specific page load.
  tpl.csrfToken = generateCsrfToken();
  return tpl.evaluate()
      .setTitle('cPanel Drive Archiver')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Include a named HTML file (for <?!= include('X') ?> templating).
 * Propagates any template variables set on the parent template.
 * @param {string} filename Bare name, no extension.
 * @return {string} Rendered HTML content.
 */
function include(filename) {
  return HtmlService.createTemplateFromFile(filename)
      .evaluate().getContent();
}

/**
 * Defence-in-depth authorisation check. The webapp's access=MYSELF
 * deployment already blocks other users at the HTTP layer; this catches
 * the unlikely case of an unauthenticated invocation path.
 * @private
 */
function assertAuthorized_() {
  const email = Session.getEffectiveUser().getEmail();
  if (!email) throw new Error('Unauthorized: no effective user');
}

/**
 * Verify a CSRF token supplied by the SPA. Wraps verifyCsrfToken() to
 * surface a stable client-facing message instead of leaking the
 * specific reason (expired vs. malformed vs. signature mismatch). Any
 * ui* handler that mutates state calls this immediately after
 * assertAuthorized_().
 * @param {string} token
 * @private
 */
function _requireCsrf_(token) {
  try {
    verifyCsrfToken(token);
  } catch (e) {
    console.warn('[Main] CSRF check failed: ' + e.message);
    throw new Error('CSRF verification failed');
  }
}

// ============================================================
// 2) UI API — configuration
// ============================================================

/**
 * Read current config for the settings form. Secret fields are masked.
 * @return {!Object<string, string>}
 */
function uiGetConfig() {
  assertAuthorized_();
  return getAllConfig(true);
}

/**
 * Save a batch of configuration updates and return the validation result.
 * Normalises certain fields (e.g. extracts Drive folder ID from a URL).
 * @param {string} token CSRF token from the SPA meta tag.
 * @param {!Object<string, string>} updates
 * @return {{ok: boolean, missing: !Array<string>}}
 */
function uiSaveConfig(token, updates) {
  assertAuthorized_();
  _requireCsrf_(token);
  const clean = normalizeConfigUpdates_(updates || {});
  updateConfig(clean);
  return validateConfig();
}

/**
 * Extract clean IDs from values users commonly paste as full URLs.
 * @param {!Object<string, string>} updates
 * @return {!Object<string, string>}
 * @private
 */
function normalizeConfigUpdates_(updates) {
  const out = {};
  for (const k in updates) {
    let v = String(updates[k] == null ? '' : updates[k]).trim();
    if (k === PROP_KEYS.ROOT_DRIVE_FOLDER_ID) {
      // يقبل: URL كامل "drive.google.com/drive/folders/ID" أو ID مباشرة
      const m = v.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
      if (m) v = m[1];
      // يقبل أيضاً ?id=ID
      const m2 = !m && v.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
      if (m2) v = m2[1];
    }
    out[k] = v;
  }
  return out;
}

// ============================================================
// 3) UI API — connection / mail tests
// ============================================================

/**
 * Ping the PHP bridge to verify URL + secret + allowed root.
 * @param {string} token CSRF token from the SPA meta tag.
 * @return {!Object}
 */
function uiTestConnection(token) {
  assertAuthorized_();
  _requireCsrf_(token);
  return testCpanelConnection();
}

/**
 * Send a one-shot test email to NOTIFICATION_EMAIL.
 * @param {string} token CSRF token from the SPA meta tag.
 * @return {!Object}
 */
function uiTestEmail(token) {
  assertAuthorized_();
  _requireCsrf_(token);
  return new Notifier().sendTestEmail();
}

// ============================================================
// 4) UI API — triggers
// ============================================================

/**
 * Install (or reinstall) the main archive trigger + notification triggers
 * according to the current schedule config.
 * @param {string} token CSRF token from the SPA meta tag.
 * @return {{ok: boolean}}
 */
function uiInstallSchedule(token) {
  assertAuthorized_();
  _requireCsrf_(token);
  installSchedule();
  installNotificationTriggers();
  return { ok: true };
}

/**
 * Delete all installed triggers.
 * @param {string} token CSRF token from the SPA meta tag.
 * @return {{ok: boolean}}
 */
function uiRemoveAllTriggers(token) {
  assertAuthorized_();
  _requireCsrf_(token);
  removeAllTriggers();
  return { ok: true };
}

/** @return {!Array<!Object>} */
function uiListTriggers() {
  assertAuthorized_();
  return listTriggers();
}

// ============================================================
// 5) UI API — dashboard
// ============================================================

/**
 * Shape:
 *   { status, lastRun, nextRun,
 *     stats: { success, versioned, skipped, failed, pendingManual,
 *              totalBytes },
 *     logSheetUrl, dedupSheetUrl, driveFolderUrl }
 * @return {!Object}
 */
function uiGetDashboardStats() {
  assertAuthorized_();
  const logger = getLogger();
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const stats = logger.getStatsBetween(from, now);

  const status = getConfig(PROP_KEYS.ARCHIVE_STATUS)
      || ARCHIVE_STATUS.IDLE;
  const lastRun = getConfig(PROP_KEYS.LAST_RUN_TIMESTAMP) || '';
  const rootFolder = getConfig(PROP_KEYS.ROOT_DRIVE_FOLDER_ID);
  const dedupId = getConfig(PROP_KEYS.DEDUP_SHEET_ID);
  const logId   = getConfig(PROP_KEYS.LOG_SHEET_ID);

  return {
    status:  status,
    lastRun: lastRun,
    nextRun: null, // Apps Script API لا يعرض وقت التشغيل القادم
    stats: {
      success:       stats.success,
      versioned:     stats.versioned,
      skipped:       stats.skipped,
      failed:        stats.failed,
      pendingManual: stats.pendingManual,
      totalBytes:    stats.totalBytes,
    },
    logSheetUrl: logId
        ? 'https://docs.google.com/spreadsheets/d/' + logId : '',
    dedupSheetUrl: dedupId
        ? 'https://docs.google.com/spreadsheets/d/' + dedupId : '',
    driveFolderUrl: rootFolder
        ? 'https://drive.google.com/drive/folders/' + rootFolder : '',
  };
}

// ============================================================
// 6) UI API — manual queue
// ============================================================

/** @return {!Array<!Object>} */
function uiGetPendingManual() {
  assertAuthorized_();
  return getLogger().getPendingManual();
}

/**
 * Queue the provided paths (or ALL pending-manual entries if empty) for
 * retry in the next archive session. Kick off a one-shot trigger to run
 * that session immediately.
 * @param {string} token CSRF token from the SPA meta tag.
 * @param {!Array<string>} paths
 * @return {{queued: number}}
 */
function uiRetryPending(token, paths) {
  assertAuthorized_();
  _requireCsrf_(token);
  const targets = (paths && paths.length > 0)
      ? paths
      : getLogger().getPendingManual().map(function(p) {
          return p.sourcePath;
        });
  if (targets.length === 0) return { queued: 0 };
  PropertiesService.getScriptProperties().setProperty(
      PROP_KEYS.PENDING_RETRY_PATHS, JSON.stringify(targets));
  scheduleImmediateResume();
  return { queued: targets.length };
}

// ============================================================
// 7) UI API — manual run
// ============================================================

/**
 * Kick off an archive session via a one-shot 60 s trigger so the call
 * returns immediately (UI timeout is short).
 * @param {string} token CSRF token from the SPA meta tag.
 * @return {{started: boolean, reason: (string|undefined)}}
 */
function uiRunNow(token) {
  assertAuthorized_();
  _requireCsrf_(token);
  const status = getConfig(PROP_KEYS.ARCHIVE_STATUS);
  if (status === ARCHIVE_STATUS.ACTIVE) {
    return { started: false, reason: 'session already active' };
  }
  scheduleImmediateResume();
  return { started: true };
}
