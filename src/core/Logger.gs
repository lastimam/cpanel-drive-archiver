/**
 * @fileoverview Activity log backed by a Google Sheet + lightweight console
 * wrappers. Each archived / failed / skipped file contributes one row; the
 * sheet is also the source of truth for the pending-manual queue and the
 * daily / weekly reports rendered by Notifier.gs.
 *
 * Columns (1-indexed): see LOG_COLUMNS below.
 */

/** @const {string} */
const LOG_SHEET_NAME = 'cPanel Archiver — Activity Log';
/** @const {string} */
const LOG_TAB_NAME   = 'log';

/** @const {!Array<string>} */
const LOG_COLUMNS = [
  'Timestamp', 'FileName', 'SourcePath', 'DrivePath',
  'SizeBytes', 'SHA256', 'Status', 'DurationMs',
  'ErrorMessage', 'RetryCount', 'ActionTaken', 'SessionId',
];

// ============================================================
// ArchiveLogger
// ============================================================

/**
 * Thin wrapper around a Google Sheet used as an append-only activity log.
 * Prefer `logBatch()` when emitting more than a few rows in sequence —
 * `appendRow()` is an expensive single round-trip per call.
 */
class ArchiveLogger {
  constructor() {
    /** @private {string} */ this.sheetId_ = this.ensureLogSheet_();
    /** @private {?Sheet} */ this.cachedSheet_ = null;
  }

  // ---------- Writers ----------

  /**
   * Append a single row. Missing fields default to '' or 0.
   * @param {{
   *   fileName?: string, sourcePath?: string, drivePath?: string,
   *   sizeBytes?: number, sha256?: string, status?: string,
   *   durationMs?: number, errorMessage?: string,
   *   retryCount?: number, actionTaken?: string, sessionId?: string
   * }} e
   */
  log(e) {
    this.getSheet_().appendRow(this.toRow_(e));
  }

  /**
   * Append several rows in a single range write (much faster than
   * multiple appendRow calls).
   * @param {!Array<!Object>} entries
   */
  logBatch(entries) {
    if (!entries || entries.length === 0) return;
    const rows = entries.map((e) => this.toRow_(e));
    const sheet = this.getSheet_();
    sheet.getRange(sheet.getLastRow() + 1, 1,
                   rows.length, LOG_COLUMNS.length).setValues(rows);
  }

  // ---------- Readers ----------

  /**
   * Aggregate counts + totals within a date range. Used for reports.
   * @param {!Date} from Inclusive.
   * @param {!Date} to   Inclusive.
   * @return {!Object}
   */
  getStatsBetween(from, to) {
    const empty = this.emptyStats_();
    const sheet = this.getSheet_();
    const last = sheet.getLastRow();
    if (last < 2) return empty;

    const data = sheet.getRange(
        2, 1, last - 1, LOG_COLUMNS.length).getValues();
    const stats = empty;
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const ts = new Date(row[0]);
      if (isNaN(ts.getTime())) continue;
      if (ts < from || ts > to) continue;

      const size = Number(row[4]) || 0;
      const status = String(row[6] || '');
      const duration = Number(row[7]) || 0;
      stats.durationMs += duration;

      switch (status) {
        case FILE_STATUS.SUCCESS:
          stats.success++;
          stats.totalBytes += size;
          break;
        case FILE_STATUS.VERSIONED:
          stats.versioned++;
          stats.totalBytes += size;
          break;
        case FILE_STATUS.SKIPPED_DUPLICATE:
          stats.skipped++;
          break;
        case FILE_STATUS.FAILED:
          stats.failed++;
          stats.failedFiles.push({
            name: row[1], sourcePath: row[2],
            error: row[8], size: size,
          });
          break;
        case FILE_STATUS.PENDING_MANUAL:
          stats.pendingManual++;
          break;
        case FILE_STATUS.CHECKSUM_MISMATCH:
          stats.checksumMismatch++;
          break;
      }
      stats.total++;
    }
    return stats;
  }

  /**
   * Files marked PENDING_MANUAL across all history. Shown in the UI
   * pending queue and available for one-click retry.
   * @return {!Array<{fileName: string, sourcePath: string,
   *                  errorMessage: string, size: number}>}
   */
  getPendingManual() {
    const sheet = this.getSheet_();
    const last = sheet.getLastRow();
    if (last < 2) return [];
    const data = sheet.getRange(
        2, 1, last - 1, LOG_COLUMNS.length).getValues();
    const out = [];
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][6]) !== FILE_STATUS.PENDING_MANUAL) continue;
      out.push({
        fileName:     String(data[i][1] || ''),
        sourcePath:   String(data[i][2] || ''),
        errorMessage: String(data[i][8] || ''),
        size:         Number(data[i][4]) || 0,
      });
    }
    return out;
  }

  /** @return {string} The underlying Spreadsheet ID. */
  getSheetId() { return this.sheetId_; }

  /** @return {string} A shareable Sheets URL. */
  getSheetUrl() {
    return 'https://docs.google.com/spreadsheets/d/' + this.sheetId_;
  }

  // ---------- Internal ----------

  /** @private */
  toRow_(e) {
    return [
      new Date().toISOString(),
      e.fileName     || '',
      e.sourcePath   || '',
      e.drivePath    || '',
      e.sizeBytes    || 0,
      e.sha256       || '',
      e.status       || '',
      e.durationMs   || 0,
      e.errorMessage || '',
      e.retryCount   || 0,
      e.actionTaken  || '',
      e.sessionId    || '',
    ];
  }

  /** @private */
  emptyStats_() {
    return {
      total: 0, success: 0, failed: 0, skipped: 0, versioned: 0,
      pendingManual: 0, checksumMismatch: 0,
      totalBytes: 0, durationMs: 0, failedFiles: [],
    };
  }

  /** @private */
  getSheet_() {
    if (this.cachedSheet_) return this.cachedSheet_;
    const ss = SpreadsheetApp.openById(this.sheetId_);
    this.cachedSheet_ = ss.getSheetByName(LOG_TAB_NAME) ||
                        ss.getActiveSheet();
    return this.cachedSheet_;
  }

  /** @private */
  ensureLogSheet_() {
    const stored = getConfig(PROP_KEYS.LOG_SHEET_ID);
    if (stored) {
      try {
        SpreadsheetApp.openById(stored);
        return stored;
      } catch (e) {
        console.warn('[Logger] stored log sheet invalid, recreating');
      }
    }
    const ss = SpreadsheetApp.create(LOG_SHEET_NAME);
    const sheet = ss.getActiveSheet();
    sheet.setName(LOG_TAB_NAME);
    sheet.getRange(1, 1, 1, LOG_COLUMNS.length)
         .setValues([LOG_COLUMNS])
         .setFontWeight('bold')
         .setBackground('#e8eaed');
    sheet.setFrozenRows(1);
    // عرض مريح لأعمدة النصوص الطويلة
    sheet.setColumnWidths(1, 1, 180);   // Timestamp
    sheet.setColumnWidths(2, 1, 240);   // FileName
    sheet.setColumnWidths(3, 1, 320);   // SourcePath
    sheet.setColumnWidths(4, 1, 320);   // DrivePath
    sheet.setColumnWidths(6, 1, 420);   // SHA256
    sheet.setColumnWidths(9, 1, 320);   // ErrorMessage
    const id = ss.getId();
    setConfig(PROP_KEYS.LOG_SHEET_ID, id);
    return id;
  }
}

// ============================================================
// Singleton helpers + console wrappers
// ============================================================

/** @type {?ArchiveLogger} @private */
var __archiveLoggerInstance = null;

/**
 * Lazily-created per-invocation logger. Reusing one instance within a
 * session avoids re-opening the spreadsheet on every log call.
 * @return {!ArchiveLogger}
 */
function getLogger() {
  if (!__archiveLoggerInstance) {
    __archiveLoggerInstance = new ArchiveLogger();
  }
  return __archiveLoggerInstance;
}

/** @param {string} msg @param {*} [ctx] */
function logInfo(msg, ctx) {
  console.log(msg + (ctx !== undefined ? ' ' + safeStringify_(ctx) : ''));
}

/** @param {string} msg @param {*} [ctx] */
function logWarn(msg, ctx) {
  console.warn(msg + (ctx !== undefined ? ' ' + safeStringify_(ctx) : ''));
}

/** @param {string} msg @param {*} [ctx] */
function logError(msg, ctx) {
  console.error(msg + (ctx !== undefined ? ' ' + safeStringify_(ctx) : ''));
}

/** @private */
function safeStringify_(v) {
  try { return JSON.stringify(v); }
  catch (e) { return String(v); }
}
