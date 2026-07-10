/**
 * @fileoverview End-to-end archive pipeline. Ties Connector + Deduplicator
 * + Archiver + Logger + Scheduler together under a single `run()` loop
 * that honours the Apps Script 6-minute hard limit via TimeBudget +
 * Checkpoint resume, and halts aggressively on a circuit-breaker when
 * too many files fail in a row.
 *
 * The class is driven by 4 top-level handlers at the bottom of the file:
 *   - scheduledArchiveRun    (time-driven trigger entry point)
 *   - resumeArchiveRun       (one-off continuation trigger)
 *   - runArchiveNow          (manual UI kick-off)
 *   - retryFailedArchives    (editor-callable retry of pending queue)
 */

// ============================================================
// ArchiveOrchestrator
// ============================================================

// Diagnostic and destructive-reset utilities relocated in Phase 1 to
// diagnostics/DiagnosticTools.gs. See that file's README.md for usage
// and the forceReset() confirmation-token contract.

class ArchiveOrchestrator {
  /**
   * @param {{retryPaths?: !Array<string>}} [opts] If retryPaths is a
   *     non-empty array, the orchestrator processes only those paths
   *     instead of walking the full source tree.
   */
  constructor(opts) {
    this.opts_             = opts || {};
    /** @private */ this.sessionId_        = null;
    /** @private */ this.connector_        = null;
    /** @private */ this.archiver_         = null;
    /** @private */ this.dedup_            = null;
    /** @private */ this.logger_           = null;
    /** @private */ this.budget_           = null;
    /** @private */ this.stats_            = null;
    /** @private */ this.consecutiveFails_ = 0;
  }

  // ---------- Public ----------

  /**
   * Run one session. Acquires a script-wide lock to prevent overlap.
   * @return {!Object} { status, stats, ... }
   */
  run() {
    const lock = acquireLock(2000);
    if (!lock) {
      logWarn('[Orch] could not acquire lock — another session active');
      return { status: 'LOCKED', stats: null };
    }
    try {
      return this.runLocked_();
    } finally {
      releaseLock(lock);
    }
  }

  // ---------- Core loop ----------

  /** @private */
  runLocked_() {
    // 1) تحقق من اكتمال الإعدادات
    const v = validateConfig();
    if (!v.ok) {
      logWarn('[Orch] invalid config', v.missing);
      setConfig(PROP_KEYS.ARCHIVE_STATUS, ARCHIVE_STATUS.ERROR);
      return { status: 'INVALID_CONFIG', missing: v.missing };
    }

    // 2) تهيئة الوحدات
    this.budget_    = new TimeBudget();
    this.connector_ = createCpanelConnector();
    this.archiver_  = new DriveArchiver();
    this.dedup_     = new Deduplicator();
    this.logger_    = getLogger();

    // 3) Checkpoint / session id
    const checkpoint = loadCheckpoint();
    const resumed = !!checkpoint;
    this.sessionId_ = resumed
        ? checkpoint.sessionId
        : Utilities.getUuid();
    this.stats_ = resumed && checkpoint.stats
        ? checkpoint.stats
        : this.emptyStats_();
    this.consecutiveFails_ = resumed
        ? (checkpoint.consecutiveFails || 0) : 0;

    setConfig(PROP_KEYS.ARCHIVE_STATUS, ARCHIVE_STATUS.ACTIVE);
    setConfig(PROP_KEYS.LAST_RUN_TIMESTAMP, new Date().toISOString());
    logInfo('[Orch] session start', {
      sessionId: this.sessionId_, resumed: resumed,
    });

    // 4) أولاً: تحقق من وجود retry paths عالقة من UI أو trigger retry
    const pendingRetry = this.consumePendingRetryPaths_();
    const retryFromOpts = this.opts_.retryPaths || [];
    const retryPaths = pendingRetry.concat(retryFromOpts);

    if (retryPaths.length > 0) {
      return this.runRetry_(retryPaths);
    }

    // 5) عملية أرشفة كاملة
    return this.runFullSession_(resumed, checkpoint);
  }

  /** @private */
  runFullSession_(resumed, checkpoint) {
    // A) جلب القائمة من الـ bridge (دائماً جديدة لتعكس تحديثات cPanel)
    let filtered;
    try {
      const all = this.connector_.listFiles('', { recursive: true })
          .filter(function(e) { return e.type === 'file'; });
      filtered = this.applyFilter_(all)
          .sort(function(a, b) {
            return a.relPath < b.relPath ? -1 : 1;
          });
    } catch (err) {
      logError('[Orch] list failed', String(err));
      setConfig(PROP_KEYS.ARCHIVE_STATUS, ARCHIVE_STATUS.ERROR);
      new Notifier().sendFailureAlert({
        title: 'تعذّر جلب قائمة الملفات',
        detail: String(err),
      });
      return { status: 'LIST_FAILED', error: String(err) };
    }

    // B) استئناف من آخر مسار معالج
    let startIdx = 0;
    if (resumed && checkpoint && checkpoint.lastProcessedPath) {
      for (let i = 0; i < filtered.length; i++) {
        if (filtered[i].relPath === checkpoint.lastProcessedPath) {
          startIdx = i + 1;
          break;
        }
      }
    }

    logInfo('[Orch] processing', {
      total: filtered.length,
      startIdx: startIdx,
      toProcess: filtered.length - startIdx,
    });

    // C) حلقة المعالجة مع مراقبة الوقت والـ circuit breaker
    let lastPath = null;
    let reason = null;
    for (let i = startIdx; i < filtered.length; i++) {
      if (this.budget_.isExhausted()) { reason = 'TIME_LIMIT'; break; }
      if (this.consecutiveFails_ >= LIMITS.MAX_CONSECUTIVE_FAILS) {
        reason = 'CIRCUIT_BREAKER'; break;
      }
      this.processOne_(filtered[i]);
      lastPath = filtered[i].relPath;
    }

    // D) قرار الإنهاء
    if (reason === 'TIME_LIMIT' && lastPath) {
      saveCheckpoint({
        sessionId: this.sessionId_,
        lastProcessedPath: lastPath,
        stats: this.stats_,
        consecutiveFails: this.consecutiveFails_,
      });
      scheduleImmediateResume();
      setConfig(PROP_KEYS.ARCHIVE_STATUS, ARCHIVE_STATUS.PAUSED);
      logInfo('[Orch] checkpoint at ' + lastPath, this.stats_);
      return {
        status: 'PAUSED_TIME',
        stats: this.stats_,
        lastPath: lastPath,
      };
    }

    if (reason === 'CIRCUIT_BREAKER') {
      clearCheckpoint();
      clearResumeTriggers();
      setConfig(PROP_KEYS.ARCHIVE_STATUS, ARCHIVE_STATUS.ERROR);
      logError('[Orch] circuit breaker tripped', this.stats_);
      try {
        new Notifier().sendFailureAlert({
          title: 'قاطع الدائرة فُتح',
          detail: LIMITS.MAX_CONSECUTIVE_FAILS +
              ' ملف فشلوا متتالياً — أُوقفت الجلسة تلقائياً.',
        });
      } catch (e) { /* ignore notify errors */ }
      return { status: 'CIRCUIT_BREAKER', stats: this.stats_ };
    }

    // انتهاء طبيعي
    clearCheckpoint();
    clearResumeTriggers();
    setConfig(PROP_KEYS.ARCHIVE_STATUS, ARCHIVE_STATUS.IDLE);
    logInfo('[Orch] session complete', this.stats_);
    this.maybeSendCompletionAlert_();
    return { status: 'COMPLETED', stats: this.stats_ };
  }

  /** @private */
  runRetry_(paths) {
    logInfo('[Orch] retry mode', { count: paths.length });
    let processed = 0;
    for (let i = 0; i < paths.length; i++) {
      if (this.budget_.isExhausted()) break;
      if (this.consecutiveFails_ >= LIMITS.MAX_CONSECUTIVE_FAILS) break;
      const rel = paths[i];
      try {
        const cksum = this.connector_.getChecksum(rel);
        const slash = rel.lastIndexOf('/');
        const name = slash >= 0 ? rel.substring(slash + 1) : rel;
        this.processOne_({
          relPath: rel, name: name, size: cksum.size,
          mtime: cksum.mtime, type: 'file',
        }, cksum);
        processed++;
      } catch (e) {
        this.recordFailure_(rel,
            rel.substring(rel.lastIndexOf('/') + 1),
            0, Date.now(), e);
      }
    }
    clearResumeTriggers();
    setConfig(PROP_KEYS.ARCHIVE_STATUS, ARCHIVE_STATUS.IDLE);
    logInfo('[Orch] retry done', {
      processed: processed, stats: this.stats_,
    });
    return {
      status: 'RETRY_COMPLETED',
      stats: this.stats_,
      processed: processed,
    };
  }

  // ---------- Per-file processing ----------

  /**
   * Archive a single file. On failure, route to manual queue.
   * @param {!Object} file
   * @param {?{sha256: string, size: number, mtime: number}} [precomputed]
   * @private
   */
  processOne_(file, precomputed) {
    const start = Date.now();
    try {
      // 1) checksum من الـ bridge (أو precomputed من retry)
      const cksum = precomputed || retryWithBackoff(
          () => this.connector_.getChecksum(file.relPath),
          { maxRetries: 2 });

      // 2) حساب المجلد الأب في Drive
      const slash = file.relPath.lastIndexOf('/');
      const folderRel = slash > 0
          ? file.relPath.substring(0, slash) : '';
      const folderId = this.archiver_.ensureFolderPath(folderRel);

      // 3) قرار التكرار
      const decision = this.dedup_.resolve(
          this.archiver_, folderId, file.name, cksum.sha256);

      if (decision.action === FILE_STATUS.SKIPPED_DUPLICATE) {
        this.recordOutcome_(file, folderRel, cksum,
            FILE_STATUS.SKIPPED_DUPLICATE, start,
            'dedup match: ' + decision.existingFileId);
        this.stats_.skipped++;
        this.consecutiveFails_ = 0;
        return;
      }

      // 4) رفع
      const nameToUse = decision.versionedName || file.name;
      const uploaded = this.archiver_.uploadFromCpanel(this.connector_, {
        relPath: file.relPath, name: nameToUse, size: cksum.size,
        mtime: cksum.mtime, sha256: cksum.sha256,
        folderRelPath: folderRel,
      }, nameToUse);

      const drivePath = folderRel
          ? folderRel + '/' + nameToUse : nameToUse;

      // 5) فهرسة التكرار
      this.dedup_.recordArchived({
        sha256: cksum.sha256, fileId: uploaded.id,
        drivePath: drivePath, size: cksum.size,
      });

      // 6) حذف المصدر إن طُلب
      let action = 'uploaded to ' + drivePath;
      if (getConfig(PROP_KEYS.SOURCE_DELETE_MODE) === 'true') {
        try {
          this.connector_.deleteFile(file.relPath);
          action += ' + source deleted';
        } catch (delErr) {
          action += ' (delete failed: ' +
              String(delErr).substring(0, 100) + ')';
          logWarn('[Orch] delete source failed', {
            path: file.relPath, err: String(delErr),
          });
        }
      }

      const status = decision.action === FILE_STATUS.VERSIONED
          ? FILE_STATUS.VERSIONED
          : FILE_STATUS.SUCCESS;
      this.recordOutcome_({
        relPath: file.relPath, name: nameToUse, size: cksum.size,
      }, folderRel, cksum, status, start, action);

      if (status === FILE_STATUS.VERSIONED) this.stats_.versioned++;
      else this.stats_.success++;
      this.stats_.totalBytes += Number(cksum.size) || 0;
      this.consecutiveFails_ = 0;

    } catch (err) {
      this.recordFailure_(file.relPath, file.name,
          file.size || 0, start, err);
    }
  }

  // ---------- Logging helpers ----------

  /** @private */
  recordOutcome_(file, folderRel, cksum, status, startMs, action) {
    const drivePath = folderRel
        ? folderRel + '/' + file.name : file.name;
    this.logger_.log({
      fileName: file.name,
      sourcePath: file.relPath,
      drivePath: drivePath,
      sizeBytes: file.size || (cksum && cksum.size) || 0,
      sha256: (cksum && cksum.sha256) || '',
      status: status,
      durationMs: Date.now() - startMs,
      errorMessage: '',
      retryCount: 0,
      actionTaken: action,
      sessionId: this.sessionId_,
    });
  }

  /** @private */
  recordFailure_(relPath, name, size, startMs, err) {
    const msg = String(err && err.message ? err.message : err);
    const status = /checksum|MAC|mismatch/i.test(msg)
        ? FILE_STATUS.CHECKSUM_MISMATCH
        : FILE_STATUS.PENDING_MANUAL;
    this.logger_.log({
      fileName: name, sourcePath: relPath, sizeBytes: size,
      status: status, durationMs: Date.now() - startMs,
      errorMessage: msg.substring(0, 500),
      sessionId: this.sessionId_,
      actionTaken: 'retry via UI queue',
    });
    this.consecutiveFails_++;
    if (status === FILE_STATUS.CHECKSUM_MISMATCH) {
      this.stats_.checksumMismatch++;
    } else {
      this.stats_.pendingManual++;
    }
    logWarn('[Orch] file failed', {
      path: relPath, status: status, err: msg,
    });
  }

  // ---------- Misc ----------

  /** @private */
  applyFilter_(files) {
    const raw = String(getConfig(PROP_KEYS.FILE_TYPE_FILTER) || '*')
        .trim();
    if (raw === '' || raw === '*') return files;
    const exts = raw.split(',')
        .map(function(s) {
          return s.trim().toLowerCase().replace(/^\./, '');
        })
        .filter(function(s) { return s.length > 0; });
    if (exts.length === 0) return files;
    return files.filter(function(f) {
      const name = String(f.name).toLowerCase();
      const dot = name.lastIndexOf('.');
      const ext = dot > 0 ? name.substring(dot + 1) : '';
      return exts.indexOf(ext) >= 0;
    });
  }

  /** @private */
  consumePendingRetryPaths_() {
    const raw = PropertiesService.getScriptProperties()
        .getProperty(PROP_KEYS.PENDING_RETRY_PATHS);
    if (!raw) return [];
    PropertiesService.getScriptProperties()
        .deleteProperty(PROP_KEYS.PENDING_RETRY_PATHS);
    const parsed = safeJsonParse(raw, []);
    return Array.isArray(parsed) ? parsed : [];
  }

  /** @private */
  maybeSendCompletionAlert_() {
    const hasFailures = this.stats_.pendingManual > 0 ||
                        this.stats_.checksumMismatch > 0;
    if (!hasFailures) return;
    if (getConfig(PROP_KEYS.ALERT_ON_FAILURE) !== 'true') return;
    try {
      new Notifier().sendFailureAlert({
        title: 'فشل في جلسة أرشفة',
        detail: this.stats_.pendingManual + ' بانتظار تدخل يدوي، ' +
            this.stats_.checksumMismatch + ' تعارض checksum.',
      });
    } catch (e) {
      logWarn('[Orch] alert send failed', String(e));
    }
  }

  /** @private */
  emptyStats_() {
    return {
      success: 0, failed: 0, skipped: 0, versioned: 0,
      checksumMismatch: 0, pendingManual: 0, totalBytes: 0,
    };
  }
}

// ============================================================
// Top-level trigger / UI entry points
// ============================================================

/**
 * Main scheduled handler installed by installSchedule(). Runs a full
 * archive session; if time runs out, a resume trigger is scheduled
 * automatically by the orchestrator.
 * @return {!Object}
 */
function scheduledArchiveRun() {
  return new ArchiveOrchestrator().run();
}

/**
 * One-off resume handler fired 60 s after saveCheckpoint() / uiRunNow() /
 * uiRetryPending(). Consumes pending_retry_paths if present; otherwise
 * resumes from the last checkpoint.
 * @return {!Object}
 */
function resumeArchiveRun() {
  return new ArchiveOrchestrator().run();
}

/**
 * Manually start an archive session (UI button "تشغيل يدوي الآن"). The
 * caller is the UI via uiRunNow() which schedules a one-shot trigger to
 * invoke us indirectly — we never run synchronously from doGet/doPost.
 * @param {!Array<string>} [retryPaths]
 * @return {!Object}
 */
function runArchiveNow(retryPaths) {
  return new ArchiveOrchestrator({ retryPaths: retryPaths }).run();
}

/**
 * Queue every current PENDING_MANUAL entry for retry in the next session.
 * Callable from the Apps Script editor without arguments.
 * @return {{queued: number}}
 */
function retryFailedArchives() {
  const pending = getLogger().getPendingManual();
  if (pending.length === 0) return { queued: 0 };
  const paths = pending.map(function(p) { return p.sourcePath; });
  PropertiesService.getScriptProperties().setProperty(
      PROP_KEYS.PENDING_RETRY_PATHS, JSON.stringify(paths));
  scheduleImmediateResume();
  return { queued: paths.length };
}
