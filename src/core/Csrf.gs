/**
 * @fileoverview CSRF synchroniser-token implementation for the Web App.
 *
 * Threat model: the deployment binds the Web App to access=MYSELF, so the
 * deploying user is the only principal that can reach doGet/doPost at the
 * HTTP layer. Nevertheless, browser origins the same user visits could
 * still try to fabricate `google.script.run` calls; the token here is
 * defence-in-depth against that, and it also documents the fact that
 * every state-changing endpoint requires a bound token from the SPA.
 *
 * Token construction:
 *   token = <timestamp_ms> "." hex(HMAC-SHA256(salt, <ts>|<email>))
 * Verification:
 *   1. Well-formed shape (integer "." 64-hex).
 *   2. Age within [-CSRF_CLOCK_SKEW_MS, CSRF_MAX_AGE_MS].
 *   3. Recomputed HMAC matches, compared in constant time.
 *
 * The salt is auto-generated on first use (32 random bytes, base64) and
 * stored under PROP_KEYS.CSRF_TOKEN_SALT — analogous to the master key in
 * Utils.gs. Rotating the salt (by deleting the property) invalidates
 * every outstanding token in-flight.
 *
 * Sessions: there is no explicit session id — the token is bound to the
 * effective user's email, which is stable per Google account inside the
 * MYSELF-scoped deployment. This matches the "one user" mental model.
 */

// ============================================================
// 1) Constants
// ============================================================

/** Token freshness window. One hour matches the plan in CLAUDE.md. */
const CSRF_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * Small tolerance for client-clock skew — a token whose timestamp is up
 * to 5 minutes in the future still verifies, avoiding spurious rejects
 * when the browser clock drifts.
 */
const CSRF_CLOCK_SKEW_MS = 5 * 60 * 1000;

// ============================================================
// 2) Public API
// ============================================================

/**
 * Mint a fresh CSRF token. Called from doGet() at page-load time and
 * embedded in the SPA as a <meta> tag so the client can echo it back
 * with every state-changing call.
 *
 * Under access=MYSELF the Apps Script HTTP layer authenticates the
 * caller before we ever run, so binding the token to a user identity
 * is redundant. It's also actively harmful: Session.getEffectiveUser()
 * .getEmail() can legitimately return "" inside google.script.run
 * handlers while returning the real address inside doGet(), producing
 * a spurious signature mismatch on every request. The token is now
 * scoped only to the salt + timestamp — the salt is the actual secret.
 *
 * @return {string} `<ts>.<64-hex>`
 */
function generateCsrfToken() {
  const ts = Date.now();
  const salt = _getOrCreateCsrfSalt_();
  const mac = hmacSha256_(salt, _csrfMessage_(ts));
  return ts + '.' + bytesToHex_(mac);
}

/**
 * Verify a token minted by generateCsrfToken(). Throws with a diagnostic
 * message on any failure so callers can surface a stable error to the
 * client without leaking which check failed.
 *
 * @param {string} token
 * @return {boolean} Always true on success — throws otherwise.
 * @throws {Error} On malformed shape, expiry, future-drift, or MAC
 *     mismatch. Do not catch and continue.
 */
function verifyCsrfToken(token) {
  if (typeof token !== 'string' || token.length < 66) {
    throw new Error('csrf: malformed token');
  }
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) {
    throw new Error('csrf: malformed token');
  }
  const tsPart = token.substring(0, dot);
  const macHex = token.substring(dot + 1);
  const ts = parseInt(tsPart, 10);
  if (!Number.isFinite(ts) || String(ts) !== tsPart) {
    throw new Error('csrf: malformed token');
  }
  if (!/^[0-9a-f]{64}$/.test(macHex)) {
    throw new Error('csrf: malformed token');
  }

  const now = Date.now();
  const age = now - ts;
  if (age > CSRF_MAX_AGE_MS) throw new Error('csrf: token expired');
  if (age < -CSRF_CLOCK_SKEW_MS) {
    throw new Error('csrf: token from the future');
  }

  const salt = _getOrCreateCsrfSalt_();
  const expected = hmacSha256_(salt, _csrfMessage_(ts));
  const actual = _hexToBytes_(macHex);
  if (!constantTimeEquals_(actual, expected)) {
    throw new Error('csrf: signature mismatch');
  }
  return true;
}

// ============================================================
// 3) Internals
// ============================================================

/**
 * Assemble the bytes that get MAC'd — the timestamp as a UTF-8 string.
 * Kept as its own helper so a future rebind (e.g. adding a per-session
 * nonce for multi-user deployments) only needs to touch this function.
 * @param {number} ts
 * @return {!Array<number>}
 * @private
 */
function _csrfMessage_(ts) {
  return Utilities.newBlob(String(ts)).getBytes();
}

/**
 * Retrieve the CSRF salt, generating and persisting a fresh 32-byte
 * value on first use. Kept parallel to getOrCreateMasterKey_() in
 * Utils.gs so the two secret-key lifecycles behave the same way.
 * @return {!Array<number>} 32 raw bytes.
 * @private
 */
function _getOrCreateCsrfSalt_() {
  const props = PropertiesService.getScriptProperties();
  const b64 = props.getProperty(PROP_KEYS.CSRF_TOKEN_SALT);
  if (b64) return Utilities.base64Decode(b64);
  const fresh = generateRandomBytes_(32);
  props.setProperty(
      PROP_KEYS.CSRF_TOKEN_SALT, Utilities.base64Encode(fresh));
  return fresh;
}

/**
 * Convert a lowercase hex string to a signed-byte array (matching the
 * shape returned by Utilities.computeHmacSignature). Inverse of
 * Utils.bytesToHex_. No length or charset validation — callers must
 * pre-check via the /^[0-9a-f]{64}$/ regex.
 * @param {string} hex
 * @return {!Array<number>}
 * @private
 */
function _hexToBytes_(hex) {
  const n = hex.length / 2;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const b = parseInt(hex.substr(i * 2, 2), 16);
    out[i] = b > 127 ? b - 256 : b;
  }
  return out;
}
