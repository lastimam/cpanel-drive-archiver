/**
 * @fileoverview Utility module — cryptography, hashing, retry logic, and
 * execution-time budgeting.
 *
 * Authenticated-encryption construction (Encrypt-then-MAC):
 *   C = plaintext XOR HMAC-SHA256-CTR(encKey, nonce)
 *   T = HMAC-SHA256(macKey, nonce || C)
 *   envelope = base64(nonce || C || T)
 * Chosen over raw AES because Apps Script lacks native AES; HMAC-SHA256
 * in CTR mode is a secure stream cipher (see NIST SP 800-108, RFC 4493).
 * Keys are derived from an auto-generated 32-byte master stored in
 * ScriptProperties under PROP_KEYS.MASTER_KEY.
 */

// ============================================================
// 1) تشفير وتوقيع (Crypto Primitives)
// ============================================================

/**
 * Compute SHA-256 digest and return as lowercase hex.
 * @param {!Array<number>|string} input UTF-8 string or raw byte array.
 * @return {string} 64-character lowercase hex digest.
 */
function sha256Hex(input) {
  const bytes = typeof input === 'string'
    ? Utilities.newBlob(input).getBytes()
    : input;
  const digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256, bytes);
  return bytesToHex_(digest);
}

/**
 * HMAC-SHA256 wrapper.
 * @param {!Array<number>} key
 * @param {!Array<number>} data
 * @return {!Array<number>} 32-byte MAC.
 * @private
 */
function hmacSha256_(key, data) {
  return Utilities.computeHmacSignature(
      Utilities.MacAlgorithm.HMAC_SHA_256, data, key);
}

/**
 * Derive a labelled subkey from a master key (simplified HKDF-Expand).
 * @param {!Array<number>} masterKey
 * @param {string} label Purpose string, e.g. "enc" or "mac".
 * @return {!Array<number>} 32-byte derived key.
 * @private
 */
function deriveKey_(masterKey, label) {
  const info = Utilities.newBlob('cPanelArchiver/' + label).getBytes();
  return hmacSha256_(masterKey, info);
}

/**
 * Retrieve the master key, generating and persisting one on first use.
 * @return {!Array<number>} 32 raw bytes.
 * @private
 */
function getOrCreateMasterKey_() {
  const props = PropertiesService.getScriptProperties();
  const b64 = props.getProperty(PROP_KEYS.MASTER_KEY);
  if (b64) return Utilities.base64Decode(b64);
  const fresh = generateRandomBytes_(32);
  props.setProperty(PROP_KEYS.MASTER_KEY, Utilities.base64Encode(fresh));
  return fresh;
}

/**
 * Encrypt a UTF-8 string with authenticated encryption.
 * @param {string} plaintext
 * @return {string} Base64 envelope: nonce(16) || ciphertext || mac(32).
 * @private
 */
function encryptSecret_(plaintext) {
  const master = getOrCreateMasterKey_();
  const encKey = deriveKey_(master, 'enc');
  const macKey = deriveKey_(master, 'mac');
  const nonce  = generateRandomBytes_(16);
  const pt     = Utilities.newBlob(plaintext).getBytes();
  const ct     = streamXor_(pt, encKey, nonce);
  const mac    = hmacSha256_(macKey, concatBytes_(nonce, ct));
  return Utilities.base64Encode(concatBytes_(nonce, ct, mac));
}

/**
 * Decrypt an envelope produced by encryptSecret_.
 * @param {string} envelope Base64 string.
 * @return {string} UTF-8 plaintext.
 * @throws {Error} If envelope is malformed or MAC verification fails.
 * @private
 */
function decryptSecret_(envelope) {
  const raw = Utilities.base64Decode(envelope);
  if (raw.length < 16 + 32) throw new Error('Envelope too short');
  const master = getOrCreateMasterKey_();
  const encKey = deriveKey_(master, 'enc');
  const macKey = deriveKey_(master, 'mac');
  const nonce = Array.prototype.slice.call(raw, 0, 16);
  const ct    = Array.prototype.slice.call(raw, 16, raw.length - 32);
  const tag   = Array.prototype.slice.call(raw, raw.length - 32);
  const expected = hmacSha256_(macKey, concatBytes_(nonce, ct));
  if (!constantTimeEquals_(tag, expected)) {
    throw new Error('MAC verification failed');
  }
  const pt = streamXor_(ct, encKey, nonce);
  return Utilities.newBlob(pt).getDataAsString();
}

/**
 * HMAC-SHA256 CTR-mode keystream XORed with data.
 * @param {!Array<number>} data
 * @param {!Array<number>} key
 * @param {!Array<number>} nonce 16 bytes.
 * @return {!Array<number>} Same length as data.
 * @private
 */
function streamXor_(data, key, nonce) {
  const out = new Array(data.length);
  let counter = 0;
  let block = null;
  let pos = 32;
  for (let i = 0; i < data.length; i++) {
    if (pos >= 32) {
      block = hmacSha256_(key,
          concatBytes_(nonce, uint32ToBytes_(counter)));
      counter++;
      pos = 0;
    }
    // تحويل من byte موقّع (-128..127) إلى غير موقّع للعملية ثم العودة
    const d = data[i] & 0xff;
    const k = block[pos] & 0xff;
    const x = (d ^ k) & 0xff;
    out[i] = x > 127 ? x - 256 : x;
    pos++;
  }
  return out;
}

// ============================================================
// 2) مساعدات مصفوفات البايتات (Byte Helpers)
// ============================================================

/**
 * Convert a signed-byte array to lowercase hex.
 * @param {!Array<number>} bytes
 * @return {string}
 * @private
 */
function bytesToHex_(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] & 0xff;
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

/**
 * Concatenate any number of byte arrays into a fresh array.
 * @param {...!Array<number>} parts
 * @return {!Array<number>}
 * @private
 */
function concatBytes_() {
  let total = 0;
  for (let i = 0; i < arguments.length; i++) total += arguments[i].length;
  const out = new Array(total);
  let p = 0;
  for (let i = 0; i < arguments.length; i++) {
    const a = arguments[i];
    for (let j = 0; j < a.length; j++) out[p++] = a[j];
  }
  return out;
}

/**
 * Encode a 32-bit unsigned integer as 4 signed bytes (big-endian).
 * @param {number} n
 * @return {!Array<number>}
 * @private
 */
function uint32ToBytes_(n) {
  const b = [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8)  & 0xff,
    n & 0xff,
  ];
  for (let i = 0; i < 4; i++) if (b[i] > 127) b[i] -= 256;
  return b;
}

/**
 * Generate random bytes using Java SecureRandom (via Utilities.getUuid)
 * as the primary entropy source, hashed into a keystream.
 * @param {number} len Number of bytes to produce.
 * @return {!Array<number>}
 * @private
 */
function generateRandomBytes_(len) {
  // Utilities.getUuid() يستخدم SecureRandom في JVM — مصدر إنتروبيا آمن
  const seed = Utilities.getUuid() + ':' + Utilities.getUuid() +
               ':' + Date.now() + ':' + Math.random();
  let state = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      Utilities.newBlob(seed).getBytes());
  const out = [];
  while (out.length < len) {
    for (let i = 0; i < state.length && out.length < len; i++) {
      out.push(state[i]);
    }
    state = Utilities.computeDigest(
        Utilities.DigestAlgorithm.SHA_256, state);
  }
  return out;
}

/**
 * Constant-time byte array equality (timing-attack resistant).
 * @param {!Array<number>} a
 * @param {!Array<number>} b
 * @return {boolean}
 * @private
 */
function constantTimeEquals_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= ((a[i] & 0xff) ^ (b[i] & 0xff));
  }
  return diff === 0;
}

// ============================================================
// 3) إعادة المحاولة مع تأخير أُسّي (Retry with Exponential Backoff)
// ============================================================

/**
 * Resolve the retry budget from user configuration, falling back to 3
 * when the value is missing, non-numeric, or out of the sensible range
 * (1..10). Used by retryWithBackoff() when the caller doesn't specify
 * maxRetries explicitly. Kept private — callers pass the number in as
 * an opts field rather than reading config themselves.
 * @return {number}
 * @private
 */
function getConfiguredMaxRetries_() {
  const raw = getConfig(PROP_KEYS.MAX_RETRIES);
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 && n <= 10 ? n : 3;
}

/**
 * Execute fn with retry and exponential backoff.
 * Delay sequence: base, 2×base, 4×base, … capped at maxDelayMs.
 * @param {function(): T} fn Operation to attempt.
 * @param {{
 *   maxRetries?: number,
 *   baseDelayMs?: number,
 *   maxDelayMs?: number,
 *   onRetry?: function(number, !Error): void,
 *   shouldRetry?: function(!Error): boolean
 * }} [opts] If maxRetries is omitted, the value of
 *     PROP_KEYS.MAX_RETRIES from ScriptProperties is used (default 3).
 * @return {T}
 * @template T
 * @throws {Error} The last error if all retries are exhausted.
 */
function retryWithBackoff(fn, opts) {
  const o = opts || {};
  const maxRetries = o.maxRetries != null
      ? o.maxRetries
      : getConfiguredMaxRetries_();
  const base = o.baseDelayMs || LIMITS.RETRY_BASE_DELAY_MS;
  const max  = o.maxDelayMs  || LIMITS.RETRY_MAX_DELAY_MS;
  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return fn();
    } catch (err) {
      lastErr = err;
      if (o.shouldRetry && !o.shouldRetry(err)) throw err;
      if (attempt === maxRetries) break;
      const delay = Math.min(base * Math.pow(2, attempt), max);
      if (o.onRetry) {
        try { o.onRetry(attempt + 1, err); } catch (e) { /* ignore */ }
      }
      Utilities.sleep(delay);
    }
  }
  throw lastErr;
}

// ============================================================
// 4) مدير ميزانية الوقت (Time Budget Manager)
// ============================================================

/**
 * Tracks remaining execution time against the Apps Script hard limit,
 * allowing the orchestrator to checkpoint gracefully before termination.
 * Default limit: 6 min (personal Gmail) with 60 s reserved buffer.
 */
class TimeBudget {
  /**
   * @param {number} [reserveMs] Buffer to leave before the hard limit.
   * @param {number} [limitMs] Override for the hard limit (testing).
   */
  constructor(reserveMs, limitMs) {
    /** @private @const */ this.startMs_ = Date.now();
    /** @private @const */ this.reserveMs_ = reserveMs != null
        ? reserveMs : LIMITS.TIME_BUDGET_RESERVE_MS;
    /** @private @const */ this.limitMs_ = limitMs != null
        ? limitMs : LIMITS.MAX_EXECUTION_MS;
  }

  /** @return {number} ms since construction. */
  elapsed() { return Date.now() - this.startMs_; }

  /** @return {number} ms until we must checkpoint. */
  remaining() {
    return this.limitMs_ - this.reserveMs_ - this.elapsed();
  }

  /** @return {boolean} True if we've exceeded the safe window. */
  isExhausted() { return this.remaining() <= 0; }

  /**
   * @param {number} estimatedMs Expected duration of the next operation.
   * @return {boolean} True if it fits in remaining budget.
   */
  hasTimeFor(estimatedMs) { return this.remaining() >= estimatedMs; }
}

/**
 * Per-session bandwidth cap. Tracks bytes downloaded from cPanel and
 * lets the orchestrator pause the session before overwhelming the
 * source server. Mirrors the shape of TimeBudget for symmetry.
 *
 * Unlike TimeBudget, hitting the bandwidth cap does NOT schedule an
 * immediate resume — the orchestrator marks the session PAUSED and
 * relies on the next scheduled trigger to continue. Immediate resume
 * would just hit the same cap again.
 *
 * The limit is read from PROP_KEYS.BANDWIDTH_LIMIT_MB at construction
 * time (default 500 MB). Skipped duplicates never consume the budget
 * because they don't download; only successful upload paths do.
 */
class BandwidthBudget {
  /**
   * @param {number} [limitMb] Explicit override in megabytes (testing).
   *     If omitted, reads PROP_KEYS.BANDWIDTH_LIMIT_MB from config.
   */
  constructor(limitMb) {
    const configured = limitMb != null
        ? limitMb
        : parseInt(getConfig(PROP_KEYS.BANDWIDTH_LIMIT_MB), 10);
    /** @private @const */ this.limitBytes_ =
        Number.isFinite(configured) && configured > 0
            ? configured * 1024 * 1024
            : 500 * 1024 * 1024;
    /** @private */ this.consumedBytes_ = 0;
  }

  /**
   * Record bytes downloaded. Non-positive / non-finite values are
   * silently ignored so callers don't need to pre-validate.
   * @param {number} bytes
   */
  consume(bytes) {
    const n = Number(bytes);
    if (Number.isFinite(n) && n > 0) this.consumedBytes_ += n;
  }

  /** @return {number} */
  consumedBytes() { return this.consumedBytes_; }

  /** @return {number} */
  limitBytes() { return this.limitBytes_; }

  /** @return {number} May be negative once the cap is crossed. */
  remainingBytes() { return this.limitBytes_ - this.consumedBytes_; }

  /** @return {boolean} True once we've crossed the configured cap. */
  isExhausted() { return this.consumedBytes_ >= this.limitBytes_; }

  /**
   * @param {number} bytes Expected size of the next transfer.
   * @return {boolean} True if it fits in the remaining budget.
   */
  hasCapacityFor(bytes) {
    return this.remainingBytes() >= Number(bytes);
  }
}

// ============================================================
// 5) أدوات متفرقة (Miscellaneous Helpers)
// ============================================================

/**
 * JSON.parse that returns a fallback on failure instead of throwing.
 * @param {string} str
 * @param {*} [fallback=null]
 * @return {*}
 */
function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); }
  catch (e) { return fallback != null ? fallback : null; }
}

/**
 * Generate a URL-safe random token (base64url, no padding).
 * @param {number} [bytes=32]
 * @return {string}
 */
function generateToken(bytes) {
  const raw = generateRandomBytes_(bytes || 32);
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/, '');
}

/**
 * Format a byte count as a human-readable string.
 * @param {number} bytes
 * @return {string}
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  let n = bytes;
  do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
  // 1 decimal place — matches the client-side formatBytes in
  // ui/Scripts.html so the same value renders identically in daily
  // digest emails and the SPA dashboard.
  return n.toFixed(1) + ' ' + units[i];
}

/**
 * Sanitise a path segment (folder/file name) for Drive usage.
 * Removes characters that Drive disallows or that break logging.
 * @param {string} name
 * @return {string}
 */
function sanitizeName(name) {
  return String(name).replace(/[\x00-\x1f\\]/g, '_').trim();
}

/**
 * Normalise a POSIX path: strip trailing slashes, collapse duplicates.
 * @param {string} p
 * @return {string}
 */
function normalizePath(p) {
  return String(p).replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}
