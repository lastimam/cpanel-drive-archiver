/**
 * @fileoverview Unit tests for the pure-logic parts of the project. Uses
 * a minimal AAA (Arrange-Act-Assert) runner — no external framework.
 *
 * To run: open the Apps Script editor, select `runAllTests` in the
 * function dropdown, and click ▶. Results go to the execution log.
 *
 * Integration tests that hit cPanel / Drive / Gmail are NOT here — those
 * are smoke-tested manually via testCpanelConnection() and the UI.
 */

// ============================================================
// Mini runner
// ============================================================

/** @type {!Array<{name: string, fn: function(): void}>} */
var __TEST_REGISTRY = [];

/** @private */
function test_(name, fn) {
  __TEST_REGISTRY.push({ name: name, fn: fn });
}

/** @private */
function assertTrue_(cond, msg) {
  if (!cond) throw new Error('assertTrue failed: ' + (msg || ''));
}

/** @private */
function assertEqual_(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error('assertEqual failed: ' + (msg || '') +
        ' — actual=' + JSON.stringify(actual) +
        ', expected=' + JSON.stringify(expected));
  }
}

/** @private */
function assertThrows_(fn, msg) {
  var thrown = false;
  try { fn(); } catch (e) { thrown = true; }
  if (!thrown) throw new Error('assertThrows failed: ' + (msg || ''));
}

/**
 * Register every test, then execute them sequentially. Summary is
 * printed to the console and returned.
 * @return {{passed: number, failed: number, failures: !Array<string>}}
 */
function runAllTests() {
  __TEST_REGISTRY.length = 0;
  registerTests_();

  var passed = 0;
  var failed = 0;
  var failures = [];

  for (var i = 0; i < __TEST_REGISTRY.length; i++) {
    var t = __TEST_REGISTRY[i];
    try {
      t.fn();
      passed++;
      console.log('  ✅  ' + t.name);
    } catch (e) {
      failed++;
      failures.push(t.name + ' — ' + e.message);
      console.error('  ❌  ' + t.name + ' — ' + e.message);
    }
  }

  console.log('--------------------------------------');
  console.log('Results: ' + passed + ' passed, ' + failed + ' failed.');
  return { passed: passed, failed: failed, failures: failures };
}

// ============================================================
// Tests
// ============================================================

/** @private */
function registerTests_() {

  // ---------- Utils: hashing ----------

  test_('sha256Hex returns 64-char lowercase hex', function() {
    var h = sha256Hex('hello');
    assertEqual_(h.length, 64);
    assertTrue_(/^[0-9a-f]+$/.test(h), 'hex chars only');
  });

  test_('sha256Hex is deterministic', function() {
    assertEqual_(sha256Hex('abc'), sha256Hex('abc'));
  });

  test_('sha256Hex differs for different input', function() {
    assertTrue_(sha256Hex('a') !== sha256Hex('b'));
  });

  // ---------- Utils: encryption round-trip ----------

  test_('encrypt → decrypt round-trip (ASCII)', function() {
    var plaintext = 'my-secret-password-123!@#';
    var envelope = encryptSecret_(plaintext);
    var decrypted = decryptSecret_(envelope);
    assertEqual_(decrypted, plaintext);
  });

  test_('encrypt → decrypt round-trip (Unicode/Arabic)', function() {
    var plaintext = 'سر باللغة العربية 🔐 مع emoji';
    var envelope = encryptSecret_(plaintext);
    var decrypted = decryptSecret_(envelope);
    assertEqual_(decrypted, plaintext);
  });

  test_('encrypt produces distinct envelopes for same plaintext', function() {
    // nonce عشوائي → envelopes مختلفة حتى لنفس المدخل
    var a = encryptSecret_('same');
    var b = encryptSecret_('same');
    assertTrue_(a !== b, 'nonces should differ');
  });

  test_('MAC tampering is detected', function() {
    var envelope = encryptSecret_('hello-world');
    var raw = Array.prototype.slice.call(
        Utilities.base64Decode(envelope));
    // اقلب بتاً واحداً في الـ ciphertext ثم حاول فك التشفير
    raw[20] = (raw[20] ^ 0x01);
    if (raw[20] > 127) raw[20] -= 256;
    var tampered = Utilities.base64Encode(raw);
    assertThrows_(function() { decryptSecret_(tampered); },
        'tampered envelope must fail MAC check');
  });

  // ---------- Utils: constant-time compare ----------

  test_('constantTimeEquals_ accepts equal arrays', function() {
    assertTrue_(constantTimeEquals_([1, 2, 3], [1, 2, 3]));
  });

  test_('constantTimeEquals_ rejects different bytes', function() {
    assertTrue_(!constantTimeEquals_([1, 2, 3], [1, 2, 4]));
  });

  test_('constantTimeEquals_ rejects different lengths', function() {
    assertTrue_(!constantTimeEquals_([1, 2], [1, 2, 3]));
  });

  // ---------- Utils: retryWithBackoff ----------

  test_('retryWithBackoff succeeds after transient failures', function() {
    var attempts = 0;
    var result = retryWithBackoff(function() {
      attempts++;
      if (attempts < 3) throw new Error('transient');
      return 'ok';
    }, { maxRetries: 5, baseDelayMs: 1, maxDelayMs: 5 });
    assertEqual_(result, 'ok');
    assertEqual_(attempts, 3);
  });

  test_('retryWithBackoff gives up after maxRetries', function() {
    var attempts = 0;
    assertThrows_(function() {
      retryWithBackoff(function() {
        attempts++;
        throw new Error('always');
      }, { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 5 });
    });
    // initial + 2 retries = 3 attempts
    assertEqual_(attempts, 3);
  });

  test_('retryWithBackoff honours shouldRetry=false', function() {
    var attempts = 0;
    assertThrows_(function() {
      retryWithBackoff(function() {
        attempts++;
        throw new Error('HTTP 404 (no retry)');
      }, {
        maxRetries: 5, baseDelayMs: 1,
        shouldRetry: function(e) { return !/no retry/.test(String(e)); },
      });
    });
    assertEqual_(attempts, 1);
  });

  // ---------- Utils: TimeBudget ----------

  test_('TimeBudget reports elapsed + remaining', function() {
    var b = new TimeBudget(0, 500);
    assertTrue_(b.remaining() > 0);
    assertTrue_(!b.isExhausted());
    Utilities.sleep(30);
    assertTrue_(b.elapsed() >= 20);
  });

  test_('TimeBudget exhausts past the limit', function() {
    var b = new TimeBudget(0, 10);
    Utilities.sleep(20);
    assertTrue_(b.isExhausted());
  });

  test_('TimeBudget.hasTimeFor returns false for large op', function() {
    var b = new TimeBudget(0, 100);
    assertTrue_(!b.hasTimeFor(10000));
  });

  // ---------- Utils: formatters ----------

  test_('formatBytes formats each magnitude', function() {
    assertEqual_(formatBytes(512), '512 B');
    assertEqual_(formatBytes(1024), '1.0 KB');
    assertEqual_(formatBytes(1536), '1.5 KB');
    assertEqual_(formatBytes(1048576), '1.0 MB');
    assertEqual_(formatBytes(1073741824), '1.0 GB');
  });

  test_('normalizePath collapses duplicate slashes', function() {
    assertEqual_(normalizePath('a//b///c/'), 'a/b/c');
    assertEqual_(normalizePath('/a//b/'), '/a/b');
    assertEqual_(normalizePath('/'), '/');
    assertEqual_(normalizePath(''), '/');
  });

  test_('sanitizeName strips control chars + backslash', function() {
    assertEqual_(sanitizeName('hello'), 'hello');
    assertEqual_(sanitizeName('a\\b'), 'a_b');
    assertEqual_(sanitizeName('name\x00x'), 'name_x');
    assertEqual_(sanitizeName('\x07bell'), '_bell');
  });

  test_('safeJsonParse returns fallback on bad input', function() {
    assertEqual_(safeJsonParse('not json', 'fb'), 'fb');
    assertEqual_(safeJsonParse('not json'), null);
  });

  test_('safeJsonParse parses valid JSON', function() {
    var out = safeJsonParse('{"a":1,"b":"x"}');
    assertEqual_(out.a, 1);
    assertEqual_(out.b, 'x');
  });

  test_('generateToken produces URL-safe token of expected length', function() {
    var t = generateToken(16);
    assertTrue_(t.length >= 20, 'base64 of 16 bytes ≥ 20 chars');
    assertTrue_(/^[A-Za-z0-9_-]+$/.test(t), 'URL-safe chars only');
  });

  // ---------- Deduplicator: versioned names ----------

  test_('buildVersionedName keeps extension', function() {
    var out = Deduplicator.buildVersionedName(
        'photo.jpg', new Date('2025-01-15T10:30:00Z'));
    assertTrue_(out.indexOf('photo_v') === 0,
        'must start with name_v');
    assertTrue_(out.substr(-4) === '.jpg', 'must end with .jpg');
  });

  test_('buildVersionedName works without extension', function() {
    var out = Deduplicator.buildVersionedName('README', new Date());
    assertTrue_(out.indexOf('README_v') === 0);
    // لا نقطة مُدرجة
    assertTrue_(out.lastIndexOf('.') === -1 ||
                out.lastIndexOf('.') < out.lastIndexOf('_v'));
  });

  test_('buildVersionedName preserves dotfile format', function() {
    var out = Deduplicator.buildVersionedName('.env', new Date());
    assertTrue_(out.indexOf('.env_v') === 0,
        'dotfile suffix comes after the entire name');
  });

  // ---------- ArchiveOrchestrator: filter ----------

  test_('applyFilter: * matches everything', function() {
    var orch = Object.create(ArchiveOrchestrator.prototype);
    // stub getConfig via temporary override
    var origGet = this.getConfig;
    var origProp = PropertiesService.getScriptProperties();
    origProp.setProperty(PROP_KEYS.FILE_TYPE_FILTER, '*');
    var files = [{ name: 'a.jpg' }, { name: 'b.txt' }];
    var out = orch.applyFilter_(files);
    assertEqual_(out.length, 2);
  });

  test_('applyFilter: comma list filters by extension', function() {
    var orch = Object.create(ArchiveOrchestrator.prototype);
    PropertiesService.getScriptProperties()
        .setProperty(PROP_KEYS.FILE_TYPE_FILTER, 'jpg,pdf');
    var files = [
      { name: 'a.jpg' }, { name: 'b.txt' },
      { name: 'c.PDF' }, { name: 'd.docx' },
    ];
    var out = orch.applyFilter_(files);
    assertEqual_(out.length, 2);
    // استعد * كي لا نؤثر على جلسة لاحقة
    PropertiesService.getScriptProperties()
        .setProperty(PROP_KEYS.FILE_TYPE_FILTER, '*');
  });

  test_('applyFilter: leading dots stripped', function() {
    var orch = Object.create(ArchiveOrchestrator.prototype);
    PropertiesService.getScriptProperties()
        .setProperty(PROP_KEYS.FILE_TYPE_FILTER, '.zip, .tar');
    var files = [
      { name: 'backup.zip' }, { name: 'code.tar' },
      { name: 'photo.jpg' },
    ];
    var out = orch.applyFilter_(files);
    assertEqual_(out.length, 2);
    PropertiesService.getScriptProperties()
        .setProperty(PROP_KEYS.FILE_TYPE_FILTER, '*');
  });

  // ---------- retryWithBackoff: MAX_RETRIES config activation ----------

  test_('retryWithBackoff falls back to config MAX_RETRIES', function() {
    var props = PropertiesService.getScriptProperties();
    props.setProperty(PROP_KEYS.MAX_RETRIES, '2');
    try {
      var attempts = 0;
      assertThrows_(function() {
        retryWithBackoff(function() {
          attempts++;
          throw new Error('always');
        }, { baseDelayMs: 1, maxDelayMs: 5 });
      });
      // initial + 2 retries from config = 3 attempts
      assertEqual_(attempts, 3);
    } finally {
      props.setProperty(PROP_KEYS.MAX_RETRIES, '3');
    }
  });

  test_('retryWithBackoff prefers explicit maxRetries over config', function() {
    var props = PropertiesService.getScriptProperties();
    props.setProperty(PROP_KEYS.MAX_RETRIES, '5');
    try {
      var attempts = 0;
      assertThrows_(function() {
        retryWithBackoff(function() {
          attempts++;
          throw new Error('always');
        }, { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 5 });
      });
      // initial + 1 retry (explicit) = 2 attempts, ignoring config's 5
      assertEqual_(attempts, 2);
    } finally {
      props.setProperty(PROP_KEYS.MAX_RETRIES, '3');
    }
  });

  test_('retryWithBackoff falls back to 3 when MAX_RETRIES invalid', function() {
    var props = PropertiesService.getScriptProperties();
    props.setProperty(PROP_KEYS.MAX_RETRIES, 'not-a-number');
    try {
      var attempts = 0;
      assertThrows_(function() {
        retryWithBackoff(function() {
          attempts++;
          throw new Error('always');
        }, { baseDelayMs: 1, maxDelayMs: 5 });
      });
      // initial + 3 (safe default) = 4 attempts
      assertEqual_(attempts, 4);
    } finally {
      props.setProperty(PROP_KEYS.MAX_RETRIES, '3');
    }
  });

  // ---------- BandwidthBudget ----------

  test_('BandwidthBudget: fresh budget is empty', function() {
    var b = new BandwidthBudget(1); // 1 MB
    assertEqual_(b.consumedBytes(), 0);
    assertEqual_(b.limitBytes(), 1024 * 1024);
    assertTrue_(!b.isExhausted());
  });

  test_('BandwidthBudget.consume accumulates positive bytes', function() {
    var b = new BandwidthBudget(1);
    b.consume(500 * 1024);
    b.consume(200 * 1024);
    assertEqual_(b.consumedBytes(), 700 * 1024);
    assertEqual_(b.remainingBytes(), 1024 * 1024 - 700 * 1024);
  });

  test_('BandwidthBudget.consume ignores non-positive / non-finite', function() {
    var b = new BandwidthBudget(1);
    b.consume(-100);
    b.consume(0);
    b.consume(NaN);
    b.consume(Infinity);
    b.consume('not a number');
    assertEqual_(b.consumedBytes(), 0);
  });

  test_('BandwidthBudget.isExhausted flips after crossing limit', function() {
    var b = new BandwidthBudget(1);
    b.consume(1024 * 1024 - 1);
    assertTrue_(!b.isExhausted());
    b.consume(1);
    assertTrue_(b.isExhausted());
  });

  test_('BandwidthBudget.hasCapacityFor is accurate', function() {
    var b = new BandwidthBudget(1); // 1 MB
    b.consume(500 * 1024);
    assertTrue_(b.hasCapacityFor(500 * 1024));
    assertTrue_(!b.hasCapacityFor(600 * 1024));
  });

  test_('BandwidthBudget reads config when limitMb omitted', function() {
    var props = PropertiesService.getScriptProperties();
    props.setProperty(PROP_KEYS.BANDWIDTH_LIMIT_MB, '2');
    try {
      var b = new BandwidthBudget();
      assertEqual_(b.limitBytes(), 2 * 1024 * 1024);
    } finally {
      props.setProperty(PROP_KEYS.BANDWIDTH_LIMIT_MB, '500');
    }
  });

  // ---------- CSRF ----------

  test_('generateCsrfToken produces well-formed token', function() {
    var t = generateCsrfToken();
    assertTrue_(/^\d+\.[0-9a-f]{64}$/.test(t), 'shape mismatch: ' + t);
  });

  test_('verifyCsrfToken accepts a fresh token', function() {
    var t = generateCsrfToken();
    assertTrue_(verifyCsrfToken(t) === true);
  });

  test_('verifyCsrfToken rejects malformed tokens', function() {
    var bad = [
      '', '.', 'abc', '123', '123.', '.abc',
      '123.tooshort',
      // wrong hex length (63 chars)
      '123.' + new Array(64).join('a'),
      // non-hex chars
      '123.' + new Array(65).join('z'),
      null, undefined, 42,
    ];
    for (var i = 0; i < bad.length; i++) {
      var val = bad[i];
      assertThrows_(function() { verifyCsrfToken(val); },
          'expected reject for ' + JSON.stringify(val));
    }
  });

  test_('verifyCsrfToken rejects an expired token', function() {
    // Build a token whose timestamp is 2 hours ago using the same
    // internal signing path generateCsrfToken() uses.
    var ts = Date.now() - 2 * 60 * 60 * 1000;
    var email = _csrfActor_();
    var salt = _getOrCreateCsrfSalt_();
    var mac = hmacSha256_(salt, _csrfMessage_(ts, email));
    var expired = ts + '.' + bytesToHex_(mac);
    assertThrows_(function() { verifyCsrfToken(expired); },
        'expired token must fail');
  });

  test_('verifyCsrfToken rejects a token from too far in the future', function() {
    // 10 minutes ahead — beyond the 5-minute skew tolerance.
    var ts = Date.now() + 10 * 60 * 1000;
    var email = _csrfActor_();
    var salt = _getOrCreateCsrfSalt_();
    var mac = hmacSha256_(salt, _csrfMessage_(ts, email));
    var future = ts + '.' + bytesToHex_(mac);
    assertThrows_(function() { verifyCsrfToken(future); },
        'far-future token must fail');
  });

  test_('verifyCsrfToken tolerates small clock skew', function() {
    // 1 minute ahead — well inside the 5-minute skew window.
    var ts = Date.now() + 60 * 1000;
    var email = _csrfActor_();
    var salt = _getOrCreateCsrfSalt_();
    var mac = hmacSha256_(salt, _csrfMessage_(ts, email));
    var skewed = ts + '.' + bytesToHex_(mac);
    assertTrue_(verifyCsrfToken(skewed) === true);
  });

  test_('verifyCsrfToken rejects a token with a tampered signature', function() {
    var t = generateCsrfToken();
    // Flip the first hex character of the MAC.
    var dot = t.indexOf('.');
    var flipped = t.substring(0, dot + 1) +
        (t.charAt(dot + 1) === '0' ? '1' : '0') +
        t.substring(dot + 2);
    assertThrows_(function() { verifyCsrfToken(flipped); },
        'tampered signature must fail MAC check');
  });

  // ---------- Diagnostics: forceReset guard rails ----------
  //
  // All four tests here call forceReset() with a WRONG confirmation,
  // so the throw fires before any destructive branch runs. Never add a
  // test here that passes the real FORCE_RESET_CONFIRMATION — it would
  // wipe the production trigger + checkpoint state on every runAllTests.

  test_('FORCE_RESET_CONFIRMATION is a long distinctive constant', function() {
    assertEqual_(typeof FORCE_RESET_CONFIRMATION, 'string');
    assertTrue_(FORCE_RESET_CONFIRMATION.length >= 30,
        'confirmation must be long enough to be deliberate');
    assertTrue_(FORCE_RESET_CONFIRMATION.indexOf(' ') < 0,
        'confirmation must not contain spaces');
  });

  test_('forceReset refuses call without confirmation', function() {
    assertThrows_(function() { forceReset(); },
        'forceReset must throw without any argument');
  });

  test_('forceReset refuses wrong confirmation strings', function() {
    var wrongs = ['', 'yes', 'YES', 'reset', 'confirm',
        'yes_i_understand_this_wipes_everything', // lower-case variant
        FORCE_RESET_CONFIRMATION + 'x',           // near-miss suffix
        'x' + FORCE_RESET_CONFIRMATION];          // near-miss prefix
    for (var i = 0; i < wrongs.length; i++) {
      var v = wrongs[i];
      assertThrows_(function() { forceReset(v); },
          'expected reject for ' + JSON.stringify(v));
    }
  });

  test_('forceReset refuses non-string confirmation types', function() {
    var wrongs = [true, false, 1, 0, null, undefined, {}, []];
    for (var i = 0; i < wrongs.length; i++) {
      var v = wrongs[i];
      assertThrows_(function() { forceReset(v); },
          'expected reject for ' + JSON.stringify(v));
    }
  });
}
