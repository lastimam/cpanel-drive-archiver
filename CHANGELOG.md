# 📋 Changelog

جميع التغييرات المهمة على هذا المشروع موثقة هنا.

يتبع التنسيق [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
ويلتزم المشروع بـ [Semantic Versioning](https://semver.org/lang/ar/).

---

## [Unreleased] — v2.0.0-dev

### 🎯 التطوير الحالي (In Progress)

سيتم توسيع المشروع بمعمارية v2.0 التي تشمل:

**نظام كشف التكرار الذكي (Smart Deduplication)**
- Bloom Filter (100,000 file capacity)
- Hot Cache (72 hours configurable)
- Full Index Sheet
- Weekly Delta Verification (5% random sampling)

**Guardian Mode (وضع الحارس)**
- Delayed Deletion (72h configurable)
- Trash Monitoring (daily scan)
- Auto-Restore from Drive Trash
- Delete Lock (permission-based)
- Audit Trail
- Emergency Freeze

**نظام Vault Migration (التفريغ الانتقائي)**
- Interactive Folder Tree
- 4 Destinations: Local ZIP, FTP, S3-compatible, Metadata Only
- Automatic Strategy Selection (SingleZip / ChunkedZips / SequentialFiles)
- Job Queue (1 active + 10 queued)
- Preview Mode before execution
- Advanced Manifest System
- Post-Download Verification (Manual / Auto / Hybrid)

**Enhanced UI**
- Full RTL Arabic support
- Material Design 3
- 10 organized settings tabs
- Real-time job monitoring

**Companion Desktop App Hooks (Phase 2 ready)**
- REST API endpoints
- API Key authentication
- Standardized Manifest format

---

## [1.1.0] — 2026-07-11

### 🛡️ إصدار Phase 1 — تصلُّب أمني وبنيوي

نُشرت هذه النسخة تلقائياً بعد `clasp push` من فرع `main` في 2026-07-11. **لا ميزات مستخدم جديدة** — 100% تحسينات تحت الغطاء تُهيّئ الأساس لميزات v2.0 دون كسر السلوك القائم. البيانات في الإنتاج (7,880 ملف في Dedup Index، 297,602 سجل في Activity Log) لم تُمَسّ.

#### 🔒 أمان (Security)

- **`appsscript.json`:** تصحيح `timeZone` من `America/New_York` إلى `Asia/Muscat` (Triggers كانت تفوت 3 ساعات). تصريح 8 `oauthScopes` صراحة بدلاً من الاعتماد على auto-detection. تثبيت `webapp.access=MYSELF` + `executeAs=USER_DEPLOYING` في المصدر.
- **CSRF Protection:** نظام synchroniser-token جديد (`src/core/Csrf.gs`) يحمي 7 endpoints (`uiSaveConfig`, `uiTestConnection`, `uiTestEmail`, `uiInstallSchedule`, `uiRemoveAllTriggers`, `uiRetryPending`, `uiRunNow`). Token = `<ts>.<HMAC-SHA256>` بصلاحية ساعة. الـ salt يُولَّد تلقائياً في `PROP_KEYS.CSRF_TOKEN_SALT`.
- **`forceReset()` guards:** يتطلب الآن معامل تأكيد نصي `'YES_I_UNDERSTAND_THIS_WIPES_EVERYTHING'` + audit log + email alert قبل التنفيذ.

#### ➕ ميزات (Features)

- **`BandwidthBudget` class** في `Utils.gs`: يفعّل `BANDWIDTH_LIMIT_MB` (كان معلَناً غير مستخدَم منذ v1.0.0). الجلسة تتوقف عند بلوغ السقف مع checkpoint + PAUSED (بدون immediate resume).
- **`MAX_RETRIES` config activated:** `retryWithBackoff()` يقرأ الإعدادات كـ fallback عبر helper `getConfiguredMaxRetries_()`.

#### 🏗️ بنية (Structure)

- **إعادة تنظيم `src/`** إلى بنية هجينة: `core/`, `dedup/`, `guardian/` (محجوز), `eviction/` (محجوز), `ui/`, `tests/`, `diagnostics/`, `migration/` (محجوز). 13 ملف نُقلت بـ `git mv` (التاريخ محفوظ).
- **نقل 5 دوال تشخيصية** (`diagFirstFile`, `testDriveRoot`, `testDriveWrite`, `testDriveApi`, `forceReset`) من `ArchiveOrchestrator.gs` إلى `src/diagnostics/DiagnosticTools.gs` مع `README.md` توثيقي.
- **مراجع HTML templating** حُدِّثت لتطابق أسماء clasp الجديدة (`ui/Index`, `ui/Stylesheet`, إلخ).

#### 🐛 إصلاحات (Fixes)

- **`formatBytes` inconsistency:** `Utils.gs` كان يستعمل `toFixed(2)` (`"1.00 KB"`) بينما `ui/Scripts.html` يستعمل `toFixed(1)` (`"1.0 KB"`). موحَّد على decimal واحد.
- **CSRF signature mismatch:** التصميم الأول ربط التوقيع بـ `Session.getEffectiveUser().getEmail()` — تبيّن أن الدالة قد تعود بقيمة فارغة داخل handlers عبر `google.script.run` بينما تعود بالبريد الكامل داخل `doGet()`. أُزيل ربط البريد من التوقيع (الأمن يبقى محفوظاً بالـ salt المخزَّن + Apps Script authentication layer).

#### 🧪 اختبارات (Tests)

- **48 اختبار** (28 أصلي + 20 جديد). `runAllTests` يمر 100%.
- تغطية جديدة: `BandwidthBudget` (6 اختبارات)، `MAX_RETRIES` fallback (3)، CSRF token lifecycle (7)، `forceReset` guards (4).

#### 🎨 واجهة (UI)

- **Footer:** `v1.0.0` → `v1.1.0 (Phase 1 hardened)` — العلامة البصرية الوحيدة على النشر.
- **CSRF meta tag** في `<head>` (شفاف للمستخدم).

#### 📄 توثيق (Docs)

- `AUDIT_REPORT.md` (Phase 0) — تدقيق شامل قبل التعديل.
- `PHASE_1_REPORT.md` — سرد تنفيذ Phase 1 + ملحق تعديلات ما بعد النشر.
- `src/diagnostics/README.md` — توثيق الدوال التشخيصية + عقد `forceReset` guard.

**تفاصيل الـ commits:** 9 commits من `07ff657` إلى `af77dc9`.

---

## [1.0.0] — 2026-04-17

### الإصدار الأول (Original v1)

النسخة الأولى موثّقة في `_legacy_backup/CHANGELOG.v1.md`.

**البنية التحتية الأصلية:**
- `Config.gs` — 22 مفتاحاً في ScriptProperties مع تشفير تلقائي للأسرار
- `Utils.gs` — SHA-256 + HMAC-SHA256-CTR AE + Retry with Backoff + TimeBudget
- `CpanelConnector.gs` — الاتصال بـ cPanel عبر PHP Bridge
- `DriveArchiver.gs` — محرك الأرشفة الأساسي
- `Deduplicator.gs` — نظام كشف التكرار (نسخة أولى)
- `Scheduler.gs` — الجدولة عبر Triggers
- `Logger.gs` — نظام السجلات
- `Notifier.gs` — الإشعارات بالبريد
- `Main.gs` + `ArchiveOrchestrator.gs` — نقاط الدخول والتنسيق
- `Tests.gs` — اختبارات الوحدة

**الواجهات:**
- `Settings.html` — واجهة الإعدادات
- `Dashboard.html` — لوحة التحكم
- `ManualQueue.html` — طابور المحاولة اليدوية
- `Index.html` — الصفحة الرئيسية
- `Stylesheet.html` + `Scripts.html` — الأصول المشتركة

**PHP Bridge:**
- `bridge/bridge.php` — نقطة النهاية على cPanel
- `bridge/.htaccess` — الحماية

---

**Note:** التاريخ التفصيلي لـ v1.0 محفوظ في `_legacy_backup/CHANGELOG.v1.md`.