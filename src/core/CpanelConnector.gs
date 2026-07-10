/**
 * @fileoverview cPanel connector using the PHP Bridge strategy.
 *
 * The bridge is a single PHP file uploaded to cPanel (see bridge/bridge.php)
 * exposing a minimal JSON API over HTTPS protected by a Bearer token. This
 * implementation never talks to cPanel's UAPI or WebDAV directly; it only
 * calls the bridge — which yields the most universal compatibility across
 * shared-hosting environments.
 *
 * Endpoints used (all authenticated):
 *   GET  ?action=ping
 *   GET  ?action=list      &path=REL&recursive=0|1
 *   GET  ?action=checksum  &path=REL
 *   GET  ?action=download  &path=REL       (supports Range)
 *   POST ?action=delete    {"path": "REL"}
 */

// ============================================================
// 1) أنواع البيانات (Typedefs)
// ============================================================

/**
 * File / directory entry returned by the bridge's `list` action.
 * @typedef {{
 *   path: string,
 *   relPath: string,
 *   name: string,
 *   size: number,
 *   mtime: number,
 *   type: string
 * }}
 */
var CpanelEntry; // eslint-disable-line no-unused-vars

/**
 * Standard JSON envelope from the bridge.
 * @typedef {{ ok: boolean, data: *, error: (string|undefined),
 *             code: (string|undefined) }}
 */
var BridgeResponse; // eslint-disable-line no-unused-vars

// ============================================================
// 2) المنفِّذ الرئيسي (PhpBridgeConnector)
// ============================================================

/**
 * PHP-Bridge implementation of the cPanel connector. Reads configuration
 * lazily from ScriptProperties on construction.
 */
class PhpBridgeConnector {
  constructor() {
    const url    = getConfig(PROP_KEYS.CPANEL_BRIDGE_URL);
    const secret = getConfig(PROP_KEYS.CPANEL_BRIDGE_SECRET);
    const root   = getConfig(PROP_KEYS.CPANEL_SOURCE_PATH);
    if (!url)    throw new Error('CPANEL_BRIDGE_URL not configured');
    if (!secret) throw new Error('CPANEL_BRIDGE_SECRET not configured');
    /** @private @const */ this.url_    = url;
    /** @private @const */ this.secret_ = secret;
    /** @private @const */ this.root_   = root || '';
  }

  // ---------- Public API ----------

  /**
   * Connectivity / auth smoke test.
   * @return {!BridgeResponse}
   */
  ping() {
    return this.request_('get', 'ping');
  }

  /**
   * List files / directories under a path relative to ALLOWED_ROOT.
   * @param {string} relPath Path relative to bridge root ('' = root).
   * @param {{recursive?: boolean}} [opts]
   * @return {!Array<!CpanelEntry>}
   * @throws {Error} On HTTP or auth failure.
   */
  listFiles(relPath, opts) {
    const params = { path: relPath || '' };
    if (opts && opts.recursive) params.recursive = '1';
    const res = this.request_('get', 'list', params);
    if (!res.ok) throw new Error('list failed: ' + (res.error || ''));
    return res.data;
  }

  /**
   * Compute server-side SHA-256 of a file (avoids downloading just to hash).
   * @param {string} relPath
   * @return {{sha256: string, size: number, mtime: number}}
   */
  getChecksum(relPath) {
    const res = this.request_('get', 'checksum', { path: relPath });
    if (!res.ok) throw new Error('checksum failed: ' + (res.error || ''));
    return res.data;
  }

  /**
   * Download an entire file in a single request. Intended for files ≤
   * LIMITS.CHUNK_SIZE; larger files should use downloadRange() driven
   * by the orchestrator to stream directly into a Drive resumable upload.
   * @param {string} relPath
   * @return {!Blob}
   */
  downloadFile(relPath) {
    const url = this.buildUrl_('download', { path: relPath });
    return retryWithBackoff(() => {
      const res = UrlFetchApp.fetch(url, {
        method: 'get',
        headers: this.authHeaders_(),
        muteHttpExceptions: true,
        followRedirects: true,
      });
      const code = res.getResponseCode();
      if (code !== 200) {
        throw new Error('HTTP ' + code + ' — ' +
            res.getContentText().substring(0, 200));
      }
      return res.getBlob().setName(this.baseName_(relPath));
    }, {
      maxRetries: 3,
      shouldRetry: (e) => !/HTTP 40[134]/.test(String(e)),
    });
  }

  /**
   * Download a single byte range. Server must honour the Range header;
   * we accept both 206 (partial) and 200 (full response if server ignored).
   * @param {string} relPath
   * @param {number} startByte Inclusive.
   * @param {number} endByte Inclusive.
   * @return {!Array<number>} Raw response bytes.
   */
  downloadRange(relPath, startByte, endByte) {
    const url = this.buildUrl_('download', { path: relPath });
    return retryWithBackoff(() => {
      const res = UrlFetchApp.fetch(url, {
        method: 'get',
        headers: Object.assign({}, this.authHeaders_(), {
          Range: 'bytes=' + startByte + '-' + endByte,
        }),
        muteHttpExceptions: true,
      });
      const code = res.getResponseCode();
      if (code !== 206 && code !== 200) {
        throw new Error('HTTP ' + code + ' at bytes ' +
            startByte + '-' + endByte);
      }
      return res.getContent();
    }, {
      maxRetries: 3,
      shouldRetry: (e) => !/HTTP 40[134]/.test(String(e)),
    });
  }

  /**
   * Delete a file on the cPanel server (only files inside ALLOWED_ROOT).
   * @param {string} relPath
   * @return {boolean}
   */
  deleteFile(relPath) {
    const res = this.request_('post', 'delete', null, { path: relPath });
    if (!res.ok) throw new Error('delete failed: ' + (res.error || ''));
    return true;
  }

  // ---------- Internal ----------

  /**
   * Send a request returning a JSON envelope. Non-JSON response or HTTP
   * error is surfaced as {ok: false, error: ...}.
   * @private
   */
  request_(method, action, params, body) {
    const url = this.buildUrl_(action, params);
    const opts = {
      method: method,
      headers: this.authHeaders_(),
      muteHttpExceptions: true,
    };
    if (body) {
      opts.contentType = 'application/json';
      opts.payload = JSON.stringify(body);
    }
    const res = UrlFetchApp.fetch(url, opts);
    const code = res.getResponseCode();
    const text = res.getContentText();
    if (code === 401) {
      return { ok: false, error: 'unauthorized (bad secret)', code: 401 };
    }
    const parsed = safeJsonParse(text, null);
    if (!parsed) {
      return {
        ok: false,
        error: 'bad_json (HTTP ' + code + '): ' + text.substring(0, 200),
        code: code,
      };
    }
    return parsed;
  }

  /** @private */
  buildUrl_(action, params) {
    const qs = ['action=' + encodeURIComponent(action)];
    if (params) {
      for (const k in params) {
        qs.push(encodeURIComponent(k) + '=' +
                encodeURIComponent(params[k]));
      }
    }
    const sep = this.url_.indexOf('?') >= 0 ? '&' : '?';
    return this.url_ + sep + qs.join('&');
  }

  /** @private */
  authHeaders_() {
    return { Authorization: 'Bearer ' + this.secret_ };
  }

  /** @private */
  baseName_(relPath) {
    const parts = String(relPath).split('/');
    return parts[parts.length - 1] || 'file';
  }
}

// ============================================================
// 3) فابريكا (Factory)
// ============================================================

/**
 * Build the active connector instance. Currently returns PhpBridgeConnector;
 * this indirection exists so future strategies (UAPI / WebDAV) can plug in
 * by reading a CPANEL_STRATEGY property without touching callers.
 * @return {!PhpBridgeConnector}
 */
function createCpanelConnector() {
  return new PhpBridgeConnector();
}

// ============================================================
// 4) اختبار الاتصال (Connection Self-Test)
// ============================================================

/**
 * Interactive connection test. Run from the Apps Script editor after
 * saving bridge URL + secret in the settings UI. Output goes to the
 * execution log (View → Logs).
 * @return {{ok: boolean, ping?: Object, rootCount?: number,
 *           error?: string}}
 */
function testCpanelConnection() {
  try {
    const conn = createCpanelConnector();

    const ping = conn.ping();
    if (!ping.ok) {
      console.error('❌ ping failed: ' + ping.error);
      return { ok: false, error: ping.error };
    }
    console.log('✅ ping OK: ' + JSON.stringify(ping.data));

    const entries = conn.listFiles('', { recursive: false });
    console.log('📁 root entries: ' + entries.length);
    if (entries.length > 0) {
      const sample = entries.slice(0, 3).map((e) =>
          e.type + ' ' + e.name + ' (' + formatBytes(e.size) + ')');
      console.log('   sample: ' + sample.join(', '));
    }

    return {
      ok: true,
      ping: ping.data,
      rootCount: entries.length,
    };
  } catch (err) {
    console.error('❌ test failed: ' + err);
    return { ok: false, error: String(err) };
  }
}
