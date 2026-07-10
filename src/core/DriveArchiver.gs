/**
 * @fileoverview Drive archival layer. Responsible for:
 *   - Mirroring the cPanel directory tree under a root Drive folder.
 *   - Uploading files via either multipart (≤ 5 MB) or resumable upload
 *     (larger files, streamed chunk-by-chunk from cPanel to avoid the
 *     50 MB Blob ceiling of Apps Script).
 *   - Attaching metadata (sha256, source path, source mtime) as
 *     appProperties on each Drive file for later audit / dedup.
 *
 * All Drive API v3 calls go through UrlFetchApp authenticated with the
 * current user's OAuth token (ScriptApp.getOAuthToken()). We do not use
 * DriveApp so that we can set appProperties uniformly.
 */

// ============================================================
// 1) نقاط نهاية Drive API
// ============================================================

/** @const {string} */
const DRIVE_API_V3   = 'https://www.googleapis.com/drive/v3';
/** @const {string} */
const DRIVE_UPLOAD_V3 = 'https://www.googleapis.com/upload/drive/v3';
/** @const {string} */
const MIME_FOLDER = 'application/vnd.google-apps.folder';

// ============================================================
// 2) الصنف الرئيسي (DriveArchiver)
// ============================================================

/**
 * Archive driver built around a single root folder. Maintains an in-memory
 * folder cache (relPath → folderId) for the lifetime of one session so
 * repeated writes into the same subtree don't re-query Drive.
 */
class DriveArchiver {
  constructor() {
    const rootId = getConfig(PROP_KEYS.ROOT_DRIVE_FOLDER_ID);
    if (!rootId) throw new Error('ROOT_DRIVE_FOLDER_ID not configured');
    /** @private @const */ this.rootId_ = rootId;
    /** @private @const {!Map<string, string>} */
    this.folderCache_ = new Map();
    this.folderCache_.set('', rootId);
  }

  // ---------- Public: Folder Tree ----------

  /**
   * Ensure every segment in a relative directory path exists under the
   * root, creating missing segments as needed. Returns the leaf folder ID.
   * @param {string} relDirPath e.g. "uploads/images/2025".
   * @return {string} Drive folder ID for the deepest segment.
   */
  ensureFolderPath(relDirPath) {
    const norm = normalizePath(relDirPath || '').replace(/^\/+/, '');
    if (norm === '' || norm === '/') return this.rootId_;
    if (this.folderCache_.has(norm)) return this.folderCache_.get(norm);

    const parts = norm.split('/').filter((p) => p.length > 0);
    let currentId = this.rootId_;
    let currentPath = '';
    for (const raw of parts) {
      const part = sanitizeName(raw);
      currentPath = currentPath ? currentPath + '/' + part : part;
      if (this.folderCache_.has(currentPath)) {
        currentId = this.folderCache_.get(currentPath);
        continue;
      }
      currentId = this.findOrCreateChildFolder_(currentId, part);
      this.folderCache_.set(currentPath, currentId);
    }
    return currentId;
  }

  /**
   * Search for a file with the given name inside a folder.
   * @param {string} folderId
   * @param {string} name Literal file name (will be escaped).
   * @return {?{id: string, name: string, size: number}}
   */
  findFileByName(folderId, name) {
    const escaped = String(name).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const q = "'" + folderId + "' in parents and " +
              "name = '" + escaped + "' and trashed = false";
    const url = DRIVE_API_V3 + '/files?q=' + encodeURIComponent(q) +
                '&fields=files(id,name,size)&pageSize=1';
    const res = this.driveFetch_(url, { method: 'get' });
    if (res.files && res.files.length > 0) {
      const f = res.files[0];
      return { id: f.id, name: f.name, size: Number(f.size) || 0 };
    }
    return null;
  }

  // ---------- Public: Upload ----------

  /**
   * Upload a file from cPanel to Drive, choosing the transport automatically
   * based on size. On success returns the Drive file metadata.
   * @param {!PhpBridgeConnector} connector
   * @param {{
   *   relPath: string, name: string, size: number, mtime: number,
   *   sha256: string, folderRelPath: string
   * }} src
   * @param {string} [overrideName] Used when versioning a collision.
   * @return {{id: string, name: string, size: number}}
   */
  uploadFromCpanel(connector, src, overrideName) {
    const folderId = this.ensureFolderPath(src.folderRelPath);
    const name = sanitizeName(overrideName || src.name);
    // Drive appProperties محدود بـ 124 بايت لكل زوج (مفتاح+قيمة) UTF-8.
    // لا نخزّن srcPath هنا لأن المسارات العربية الطويلة تتجاوز الحد؛
    // المسار الأصلي محفوظ أصلاً في Log Sheet.
    const appProps = {
      sha256:   String(src.sha256 || ''),
      srcMtime: String(src.mtime || ''),
    };

    if (src.size <= LIMITS.DRIVE_MULTIPART_MAX) {
      const blob = connector.downloadFile(src.relPath);
      return this.uploadMultipart_(blob, folderId, name, appProps, src.size);
    }
    return this.uploadResumable_(
        connector, src.relPath, src.size, folderId, name, appProps);
  }

  // ---------- Internal: Folder helpers ----------

  /**
   * Look up or create an immediate child folder by name.
   * @private
   */
  findOrCreateChildFolder_(parentId, name) {
    const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const q = "'" + parentId + "' in parents and " +
              "mimeType = '" + MIME_FOLDER + "' and " +
              "name = '" + escaped + "' and trashed = false";
    const listUrl = DRIVE_API_V3 + '/files?q=' + encodeURIComponent(q) +
                    '&fields=files(id,name)&pageSize=1';
    const listRes = this.driveFetch_(listUrl, { method: 'get' });
    if (listRes.files && listRes.files.length > 0) {
      return listRes.files[0].id;
    }
    const createRes = this.driveFetch_(
        DRIVE_API_V3 + '/files?fields=id,name',
        {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({
            name: name,
            mimeType: MIME_FOLDER,
            parents: [parentId],
          }),
        });
    if (!createRes.id) throw new Error('folder create returned no id');
    return createRes.id;
  }

  // ---------- Internal: Multipart upload (small files) ----------

  /**
   * Multipart upload for files ≤ DRIVE_MULTIPART_MAX.
   * @private
   */
  uploadMultipart_(blob, folderId, name, appProps, expectedSize) {
    const metadata = {
      name: name,
      parents: [folderId],
      appProperties: appProps,
    };
    const boundary = '----gasArch' + Utilities.getUuid().replace(/-/g, '');
    const contentType = blob.getContentType() || 'application/octet-stream';
    const body = this.buildMultipartBody_(
        boundary, metadata, blob.getBytes(), contentType);
    const url = DRIVE_UPLOAD_V3 +
        '/files?uploadType=multipart&fields=id,name,size,md5Checksum';

    const res = retryWithBackoff(() => {
      const r = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'multipart/related; boundary=' + boundary,
        payload: body,
        headers: this.authHeaders_(),
        muteHttpExceptions: true,
      });
      const code = r.getResponseCode();
      if (code === 200 || code === 201) return r;
      if (code === 401 || code === 403 || code === 404) {
        throw new Error('HTTP ' + code + ' (no retry) — ' +
            r.getContentText().substring(0, 200));
      }
      throw new Error('HTTP ' + code);
    }, {
      maxRetries: 3,
      shouldRetry: (e) => !/no retry/.test(String(e)),
    });

    const parsed = safeJsonParse(res.getContentText(), null);
    if (!parsed || !parsed.id) {
      throw new Error('multipart: no id in response');
    }
    if (expectedSize && parsed.size &&
        Number(parsed.size) !== expectedSize) {
      throw new Error('size mismatch: got ' + parsed.size +
          ', expected ' + expectedSize);
    }
    return parsed;
  }

  /**
   * Assemble a multipart/related request body (JSON meta + binary body).
   * @private
   */
  buildMultipartBody_(boundary, metadata, contentBytes, contentType) {
    const CRLF = '\r\n';
    const header =
        '--' + boundary + CRLF +
        'Content-Type: application/json; charset=UTF-8' + CRLF + CRLF +
        JSON.stringify(metadata) + CRLF +
        '--' + boundary + CRLF +
        'Content-Type: ' + contentType + CRLF + CRLF;
    const footer = CRLF + '--' + boundary + '--';
    const headerBytes = Utilities.newBlob(header).getBytes();
    const footerBytes = Utilities.newBlob(footer).getBytes();
    return concatBytes_(headerBytes, contentBytes, footerBytes);
  }

  // ---------- Internal: Resumable upload (large files) ----------

  /**
   * Resumable upload streamed chunk-by-chunk from cPanel into Drive.
   * Each chunk is 10 MB except the last. Chunks are aligned to 256 KB
   * boundaries as required by the Drive resumable protocol.
   * @private
   */
  uploadResumable_(connector, srcRelPath, totalSize, folderId, name,
                   appProps) {
    const metadata = {
      name: name,
      parents: [folderId],
      appProperties: appProps,
    };
    const initUrl = DRIVE_UPLOAD_V3 +
        '/files?uploadType=resumable&fields=id,name,size,md5Checksum';

    // 1) بدء الجلسة: POST بالـ metadata نحصل على upload URL في Location
    const initRes = UrlFetchApp.fetch(initUrl, {
      method: 'post',
      contentType: 'application/json; charset=UTF-8',
      headers: Object.assign({}, this.authHeaders_(), {
        'X-Upload-Content-Length': String(totalSize),
        'X-Upload-Content-Type': 'application/octet-stream',
      }),
      payload: JSON.stringify(metadata),
      muteHttpExceptions: true,
    });
    const initCode = initRes.getResponseCode();
    if (initCode !== 200 && initCode !== 201) {
      throw new Error('resumable init HTTP ' + initCode + ' — ' +
          initRes.getContentText().substring(0, 200));
    }
    const headers = initRes.getHeaders();
    const uploadUrl = headers['Location'] || headers['location'];
    if (!uploadUrl) throw new Error('resumable init: no Location header');

    // 2) ارفع الـ chunks بالتسلسل
    const chunkSize = LIMITS.CHUNK_SIZE;
    let offset = 0;
    let finalMeta = null;
    while (offset < totalSize) {
      const end = Math.min(offset + chunkSize - 1, totalSize - 1);
      const expectedLen = end - offset + 1;
      const bytes = connector.downloadRange(srcRelPath, offset, end);
      if (bytes.length !== expectedLen) {
        throw new Error('chunk size mismatch at offset ' + offset +
            ': got ' + bytes.length + ' expected ' + expectedLen);
      }
      const isLast = (end === totalSize - 1);
      const chunkRes = this.putChunk_(uploadUrl, bytes, offset, end,
                                      totalSize);
      const code = chunkRes.getResponseCode();
      if (isLast) {
        if (code !== 200 && code !== 201) {
          throw new Error('resumable final HTTP ' + code + ' — ' +
              chunkRes.getContentText().substring(0, 200));
        }
        finalMeta = safeJsonParse(chunkRes.getContentText(), null);
        break;
      }
      if (code !== 308) {
        throw new Error('resumable chunk HTTP ' + code + ' at ' + offset);
      }
      offset = end + 1;
    }

    if (!finalMeta || !finalMeta.id) {
      throw new Error('resumable: no id in final response');
    }
    if (finalMeta.size && Number(finalMeta.size) !== totalSize) {
      throw new Error('size mismatch: got ' + finalMeta.size +
          ', expected ' + totalSize);
    }
    return finalMeta;
  }

  /**
   * PUT a single chunk into an active resumable session URL.
   * @private
   */
  putChunk_(uploadUrl, bytes, start, end, total) {
    return retryWithBackoff(() => {
      const r = UrlFetchApp.fetch(uploadUrl, {
        method: 'put',
        headers: {
          'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
        },
        contentType: 'application/octet-stream',
        payload: bytes,
        muteHttpExceptions: true,
      });
      const code = r.getResponseCode();
      if (code === 308 || code === 200 || code === 201) return r;
      // 4xx الثابتة لا نعيدها — ما عدا 408/429
      if (code >= 400 && code < 500 && code !== 408 && code !== 429) {
        throw new Error('HTTP ' + code + ' (no retry)');
      }
      throw new Error('HTTP ' + code);
    }, {
      maxRetries: 3,
      shouldRetry: (e) => !/no retry/.test(String(e)),
    });
  }

  // ---------- Internal: Drive API helper ----------

  /**
   * Fetch JSON from Drive API with auth + retry. Returns parsed body or
   * throws on non-2xx.
   * @private
   */
  driveFetch_(url, opts) {
    const full = Object.assign({}, opts, {
      headers: Object.assign({}, opts.headers || {}, this.authHeaders_()),
      muteHttpExceptions: true,
    });
    const res = retryWithBackoff(() => {
      const r = UrlFetchApp.fetch(url, full);
      const code = r.getResponseCode();
      if (code >= 200 && code < 300) return r;
      if (code === 404) throw new Error('HTTP 404 (no retry)');
      if (code === 401 || code === 403) {
        throw new Error('HTTP ' + code + ' (no retry) — ' +
            r.getContentText().substring(0, 200));
      }
      throw new Error('HTTP ' + code);
    }, {
      maxRetries: 3,
      shouldRetry: (e) => !/no retry/.test(String(e)),
    });
    return safeJsonParse(res.getContentText(), {});
  }

  /** @private */
  authHeaders_() {
    return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  }
}
