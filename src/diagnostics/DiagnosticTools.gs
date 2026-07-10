/**
 * @fileoverview Diagnostic and destructive-reset utilities isolated from
 * production code paths. Relocated in Phase 1 from ArchiveOrchestrator.gs
 * so that the archive pipeline no longer ships alongside functions that
 * write to Drive (`testDriveWrite`, `diagFirstFile`) or wipe session
 * state (`forceReset`).
 *
 * These functions are only intended for on-call debugging by the
 * deploying maintainer via the Apps Script editor or `clasp run` —
 * none of them is wired to a `ui*` handler in Main.gs. See README.md
 * next to this file for usage notes.
 *
 * ⚠️ forceReset() is destructive. It refuses to run without the exact
 * confirmation token FORCE_RESET_CONFIRMATION, always writes an audit
 * row to the activity log first, and best-effort emails the
 * notification recipient. Read the README before invoking.
 */

// ============================================================
// 1) Drive API smoke tests
// ============================================================

/**
 * Deep probe of the configured root Drive folder: fetches metadata,
 * lists a few children, then creates one throwaway test folder to prove
 * write permission. Output goes to the execution log.
 *
 * Side effect: leaves one empty folder named `_archiver_test_<epoch>`
 * under the archive root. Safe to delete afterwards.
 */
function diagFirstFile() {
  const rootId = getConfig(PROP_KEYS.ROOT_DRIVE_FOLDER_ID);
  const token = ScriptApp.getOAuthToken();
  console.log('ROOT_DRIVE_FOLDER_ID = [' + rootId + ']');
  console.log('الطول: ' + (rootId ? rootId.length : 0));

  // --- الخطوة 1: جلب المجلد الجذر ---
  console.log('\n━━━ Step 1: GET root folder ━━━');
  const r1 = UrlFetchApp.fetch(
    'https://www.googleapis.com/drive/v3/files/' + rootId +
    '?fields=id,name,mimeType,trashed,driveId',
    { headers: {Authorization: 'Bearer ' + token},
      muteHttpExceptions: true });
  console.log('HTTP ' + r1.getResponseCode());
  console.log(r1.getContentText().substring(0, 500));

  // --- الخطوة 2: سرد محتوياته ---
  console.log('\n━━━ Step 2: list children ━━━');
  const q = "'" + rootId + "' in parents and trashed = false";
  const r2 = UrlFetchApp.fetch(
    'https://www.googleapis.com/drive/v3/files?q=' +
    encodeURIComponent(q) + '&fields=files(id,name)&pageSize=3',
    { headers: {Authorization: 'Bearer ' + token},
      muteHttpExceptions: true });
  console.log('HTTP ' + r2.getResponseCode());
  console.log(r2.getContentText().substring(0, 500));

  // --- الخطوة 3: محاولة إنشاء مجلد اختباري ---
  console.log('\n━━━ Step 3: create test folder ━━━');
  const r3 = UrlFetchApp.fetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,name',
    { method: 'post', contentType: 'application/json',
      headers: {Authorization: 'Bearer ' + token},
      payload: JSON.stringify({
        name: '_archiver_test_' + Date.now(),
        mimeType: 'application/vnd.google-apps.folder',
        parents: [rootId],
      }),
      muteHttpExceptions: true });
  console.log('HTTP ' + r3.getResponseCode());
  console.log(r3.getContentText().substring(0, 500));
}

/**
 * Read-only probe of the configured root folder — reports metadata,
 * owners, and permissions. Useful when Drive returns unhelpful 403s.
 */
function testDriveRoot() {
  const rootId = getConfig(PROP_KEYS.ROOT_DRIVE_FOLDER_ID);
  console.log('Root ID المحفوظ: ' + rootId);
  if (!rootId) { console.error('فارغ!'); return; }
  const url = 'https://www.googleapis.com/drive/v3/files/' +
      rootId + '?fields=id,name,mimeType,owners,permissions,trashed';
  const res = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  console.log('HTTP ' + res.getResponseCode());
  console.log(res.getContentText());
}

/**
 * Write-permission probe: creates one throwaway folder in the archive
 * root and logs the API response. Leaves the folder behind — delete
 * manually after inspection.
 */
function testDriveWrite() {
  const rootId = getConfig(PROP_KEYS.ROOT_DRIVE_FOLDER_ID);
  console.log('ROOT_DRIVE_FOLDER_ID: ' + rootId);
  if (!rootId) { console.error('لم يُحدَّد مجلد الـ Drive!'); return; }
  const url = 'https://www.googleapis.com/drive/v3/files?fields=id,name';
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({
      name: '_test_write_' + Date.now(),
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootId],
    }),
    muteHttpExceptions: true,
  });
  console.log('HTTP ' + res.getResponseCode());
  console.log(res.getContentText());
}

/**
 * Minimal Drive-API reachability probe — hits `/about` and prints the
 * calling user. Fast smoke test for OAuth scope regressions.
 */
function testDriveApi() {
  const url = 'https://www.googleapis.com/drive/v3/about?fields=user';
  const res = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  console.log('HTTP ' + res.getResponseCode());
  console.log(res.getContentText());
}

// ============================================================
// 2) Destructive reset — guarded
// ============================================================

/**
 * Exact confirmation token required by forceReset(). Kept as a
 * top-level constant so callers see it in the completion suggestions
 * of the Apps Script editor, but the string itself must be typed
 * deliberately — copy-paste from README rather than autocomplete.
 * @const {string}
 */
const FORCE_RESET_CONFIRMATION = 'YES_I_UNDERSTAND_THIS_WIPES_EVERYTHING';

/**
 * DESTRUCTIVE. Clears every trigger owned by this script, resets the
 * archive status to IDLE, deletes any active checkpoint, and drops the
 * pending-retry queue. Intended only for irrecoverable stuck states —
 * a normal "run again" should never need this.
 *
 * Guard rails:
 *   1. Refuses to run without the exact FORCE_RESET_CONFIRMATION token.
 *   2. Writes an audit row to the activity log BEFORE wiping anything.
 *   3. Best-effort email alert to the notification recipient.
 *   4. Emits console.error so the invocation is visible in Stackdriver.
 *
 * The Dedup Index sheet and Activity Log sheet are NOT touched by this
 * function — 7,880 archived files remain safe. Only session/trigger
 * state is cleared.
 *
 * @param {string} confirmation Must equal FORCE_RESET_CONFIRMATION.
 * @throws {Error} If the confirmation token does not match.
 */
function forceReset(confirmation) {
  if (confirmation !== FORCE_RESET_CONFIRMATION) {
    const msg = 'forceReset() refused: missing or wrong confirmation. ' +
        'Pass "' + FORCE_RESET_CONFIRMATION + '" as the sole argument.';
    console.error('[Diagnostics] ' + msg);
    throw new Error(msg);
  }

  const actor = _diagResolveActor_();
  const ts = new Date().toISOString();

  // 1) Audit trail FIRST — if the reset itself corrupts state, we still
  //    have a record of who invoked it.
  try {
    getLogger().log({
      fileName:     '(diagnostics)',
      sourcePath:   'forceReset',
      status:       FILE_STATUS.FAILED,
      actionTaken:  'DESTRUCTIVE_RESET invoked by ' + actor,
      errorMessage: 'triggers + checkpoint + retry queue wiped at ' + ts,
    });
  } catch (e) {
    console.error('[Diagnostics] audit log failed: ' + e);
  }

  // 2) Best-effort alert email. Never blocks the reset.
  try {
    new Notifier().sendFailureAlert({
      title:  '🚨 forceReset invoked',
      detail: 'A destructive reset was executed by ' + actor +
          ' at ' + ts + '. All triggers, checkpoints and the pending ' +
          'retry queue have been cleared. If this was not intentional, ' +
          'restore from backups immediately and investigate.',
    });
  } catch (e) {
    console.error('[Diagnostics] alert send failed: ' + e);
  }

  // 3) The actual reset.
  removeAllTriggers();
  setConfig(PROP_KEYS.ARCHIVE_STATUS, ARCHIVE_STATUS.IDLE);
  clearCheckpoint();
  deleteConfig(PROP_KEYS.PENDING_RETRY_PATHS);
  console.log('✅ forceReset complete (actor=' + actor + ', ts=' + ts + ')');
}

/**
 * Resolve the invoking user's email, or a stable placeholder if the
 * session context is unavailable (e.g. installable trigger).
 * @return {string}
 * @private
 */
function _diagResolveActor_() {
  try {
    return Session.getEffectiveUser().getEmail() || 'unknown-user';
  } catch (e) {
    return 'unknown-user';
  }
}
