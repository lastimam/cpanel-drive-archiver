/**
 * @fileoverview Deduplication index backed by a dedicated Google Sheet.
 *
 * The index records one row per successfully archived file keyed by its
 * SHA-256. An in-memory cache is lazily hydrated on first lookup so all
 * findByHash() calls in the same session are O(1). The sheet columns:
 *
 *   sha256 | drive_file_id | drive_path | size | first_seen
 *
 * The sheet ID is auto-persisted to ScriptProperties
 * (PROP_KEYS.DEDUP_SHEET_ID) and re-used across sessions.
 */

/** @const {string} */
const DEDUP_SHEET_NAME = 'cPanel Archiver — Dedup Index';
/** @const {string} */
const DEDUP_TAB_NAME   = 'dedup';

// ============================================================
// Deduplicator
// ============================================================

/**
 * In-session deduplicator. A single instance should be reused across all
 * file decisions in one orchestrator run to benefit from the lazy cache.
 */
class Deduplicator {
  constructor() {
    /** @private {string} */ this.sheetId_ = this.ensureDedupSheet_();
    /**
     * @private
     * {?Map<string, {id: string, path: string, size: number}>}
     */
    this.cache_ = null;
  }

  // ---------- Lookup ----------

  /**
   * Look up an existing Drive file by its SHA-256.
   * @param {string} sha256
   * @return {?{id: string, path: string, size: number}}
   */
  findByHash(sha256) {
    if (!sha256) return null;
    return this.loadCache_().get(sha256) || null;
  }

  /**
   * Decide how a newly seen cPanel file should be handled vs. existing
   * Drive content.
   * @param {!DriveArchiver} archiver Needed to probe the target folder.
   * @param {string} folderId Drive folder where the file would land.
   * @param {string} name Proposed Drive file name.
   * @param {string} sha256 Source SHA-256 (from bridge checksum action).
   * @return {{
   *   action: string,
   *   existingFileId: (string|undefined),
   *   versionedName: (string|undefined)
   * }} action ∈ NEW | SKIP_DUPLICATE | VERSION
   */
  resolve(archiver, folderId, name, sha256) {
    // أولاً: مطابقة hash — أقوى معيار للتكرار
    const byHash = this.findByHash(sha256);
    if (byHash) {
      return {
        action: FILE_STATUS.SKIPPED_DUPLICATE,
        existingFileId: byHash.id,
      };
    }
    // ثانياً: تصادم اسم في نفس المجلد بمحتوى مختلف ⇒ نسخة جديدة
    const existing = archiver.findFileByName(folderId, name);
    if (existing) {
      return {
        action: FILE_STATUS.VERSIONED,
        existingFileId: existing.id,
        versionedName: Deduplicator.buildVersionedName(name),
      };
    }
    return { action: 'NEW' };
  }

  // ---------- Recording ----------

  /**
   * Append a freshly-archived file to the dedup index.
   * @param {{
   *   sha256: string, fileId: string, drivePath: string, size: number
   * }} entry
   */
  recordArchived(entry) {
    if (!entry.sha256) return;
    const sheet = this.getSheet_();
    sheet.appendRow([
      entry.sha256,
      entry.fileId,
      entry.drivePath,
      entry.size,
      new Date().toISOString(),
    ]);
    if (this.cache_) {
      this.cache_.set(entry.sha256, {
        id: entry.fileId,
        path: entry.drivePath,
        size: entry.size,
      });
    }
  }

  // ---------- Versioning ----------

  /**
   * Build a versioned variant of a file name by injecting a timestamp
   * suffix before the extension.
   *     "photo.jpg"   → "photo_v2026-04-17_14-30-00.jpg"
   *     "README"      → "README_v2026-04-17_14-30-00"
   * @param {string} name
   * @param {Date} [now] Override for deterministic tests.
   * @return {string}
   */
  static buildVersionedName(name, now) {
    const t = (now || new Date()).toISOString()
        .replace('T', '_').replace('Z', '').replace(/[:.]/g, '-');
    const dot = name.lastIndexOf('.');
    // نحمي أسماء مثل ".env" من اعتبارها امتداداً
    if (dot > 0 && dot < name.length - 1) {
      return name.substring(0, dot) + '_v' + t + name.substring(dot);
    }
    return name + '_v' + t;
  }

  // ---------- Internal ----------

  /** @private */
  loadCache_() {
    if (this.cache_) return this.cache_;
    this.cache_ = new Map();
    const sheet = this.getSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return this.cache_;
    const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const hash = String(row[0] || '');
      if (!hash) continue;
      this.cache_.set(hash, {
        id: String(row[1] || ''),
        path: String(row[2] || ''),
        size: Number(row[3]) || 0,
      });
    }
    return this.cache_;
  }

  /** @private */
  getSheet_() {
    return SpreadsheetApp.openById(this.sheetId_).getSheetByName(DEDUP_TAB_NAME)
        || SpreadsheetApp.openById(this.sheetId_).getActiveSheet();
  }

  /**
   * Return the dedup sheet ID, creating a fresh Spreadsheet if the stored
   * ID is missing or unreadable.
   * @private
   */
  ensureDedupSheet_() {
    const stored = getConfig(PROP_KEYS.DEDUP_SHEET_ID);
    if (stored) {
      try {
        SpreadsheetApp.openById(stored);
        return stored;
      } catch (e) {
        console.warn('[Dedup] stored sheet ID invalid, recreating');
      }
    }
    const ss = SpreadsheetApp.create(DEDUP_SHEET_NAME);
    const sheet = ss.getActiveSheet();
    sheet.setName(DEDUP_TAB_NAME);
    sheet.getRange(1, 1, 1, 5).setValues([[
      'sha256', 'drive_file_id', 'drive_path', 'size', 'first_seen',
    ]]);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 460);
    sheet.setColumnWidth(2, 260);
    sheet.setColumnWidth(3, 340);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
    const id = ss.getId();
    setConfig(PROP_KEYS.DEDUP_SHEET_ID, id);
    return id;
  }
}
