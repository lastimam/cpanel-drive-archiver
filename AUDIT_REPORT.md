<div dir="rtl">

# 🔍 AUDIT_REPORT — تدقيق كود v1.0.0

> **الغرض:** المرحلة 0 من خطة الترقية إلى v2.0. تحليل ما هو مطبَّق، ما ينقص، وما يحتاج تحسيناً — قبل أي تعديل على الكود.
>
> **التاريخ:** 2026-07-10 · **المُدقِّق:** Claude Code · **الحالة:** بانتظار موافقة المستخدم

---

## 📊 ملخص تنفيذي (30 ثانية)

| البند | القيمة |
|---|---|
| **الملفات المفحوصة** | 19 ملفاً في `src/` + `bridge/bridge.php` + `bridge/.htaccess` |
| **حجم الكود الفعلي** | ~147 KB (كما ذُكر في CLAUDE.md) |
| **جودة v1** | 🟢 **عالية** — بنية نظيفة، JSDoc كامل، اختبارات (24)، معمارية Class-based |
| **التغطية مقابل v2.0** | 🟡 **~30%** — الأساس متين لكن الميزات الحرجة (Bloom/Guardian/Eviction) غائبة تماماً |
| **مخاطر أمنية عاجلة** | 3 (متوسطة/عالية) — تفاصيل في القسم 6 |
| **جهد الترقية المتوقع** | ⏳ ~10 مراحل تدريجية دون كسر v1 |

**الحكم:** الكود جاهز للبناء عليه، وليس للاستبدال. الأساس (Config/Utils/Connector/Bridge/Logger/Notifier/Scheduler) صلب ويمكن ترقية v2.0 كطبقات فوقه دون مساس.

---

## القسم 1: ما هو مطبَّق حالياً ✅

### 1.1 البنية التحتية الحرجة (Foundation)

| الميزة | الملف | الملاحظات |
|---|---|---|
| ✅ تشفير AE (Encrypt-then-MAC) | [src/Utils.gs:77-110](src/Utils.gs#L77-L110) | HMAC-SHA256-CTR مع MAC verification بوقت ثابت — تصميم قوي جداً |
| ✅ SHA-256 hex | [src/Utils.gs:24-31](src/Utils.gs#L24-L31) | يستخدم `Utilities.computeDigest` |
| ✅ Retry with Exponential Backoff | [src/Utils.gs:256-277](src/Utils.gs#L256-L277) | مع `shouldRetry` قابل للتخصيص |
| ✅ TimeBudget Manager | [src/Utils.gs:288-317](src/Utils.gs#L288-L317) | يحسب `remaining()` و `hasTimeFor()` |
| ✅ Master Key generation + persistence | [src/Utils.gs:62-69](src/Utils.gs#L62-L69) | 32 بايت random في ScriptProperties |
| ✅ ScriptProperties CRUD مع تشفير شفاف | [src/Config.gs:132-243](src/Config.gs#L132-L243) | `ENCRYPTED_KEYS` array يفعّل التشفير تلقائياً |
| ✅ Default values initialization | [src/Config.gs:218-227](src/Config.gs#L218-L227) | `initializeDefaults()` idempotent |
| ✅ Config validation | [src/Config.gs:233-243](src/Config.gs#L233-L243) | يعيد `{ok, missing}` |
| ✅ 22 property key معرَّف | [src/Config.gs:15-52](src/Config.gs#L15-L52) | مطابق للمذكور في CLAUDE.md |

### 1.2 طبقة الاتصال بـ cPanel

| الميزة | الملف | الملاحظات |
|---|---|---|
| ✅ PHP Bridge Connector كامل | [src/CpanelConnector.gs:50-225](src/CpanelConnector.gs#L50-L225) | ping/list/checksum/download/range/delete |
| ✅ Streaming/Chunked Range download | [src/CpanelConnector.gs:134-154](src/CpanelConnector.gs#L134-L154) | HTTP 206 + Range header |
| ✅ Server-side SHA-256 (لا يُنزَّل ثم يُحسب) | [src/CpanelConnector.gs:92-96](src/CpanelConnector.gs#L92-L96) | + [bridge/bridge.php:205-220](bridge/bridge.php#L205-L220) |
| ✅ Factory pattern لمستقبل UAPI/WebDAV | [src/CpanelConnector.gs:237-239](src/CpanelConnector.gs#L237-L239) | `createCpanelConnector()` |
| ✅ Interactive connection test | [src/CpanelConnector.gs:252-280](src/CpanelConnector.gs#L252-L280) | يعرض عيّنة من الجذر |
| ✅ PHP Bridge بحماية Path Traversal | [bridge/bridge.php:102-130](bridge/bridge.php#L102-L130) | `realpath()` + prefix check |
| ✅ Constant-time secret comparison | [bridge/bridge.php:87-96](bridge/bridge.php#L87-L96) | `hash_equals` |
| ✅ HTTPS enforcement + deny others | [bridge/.htaccess:4-16](bridge/.htaccess#L4-L16) | mod_rewrite + FilesMatch |
| ✅ Security headers | [bridge/.htaccess:19-23](bridge/.htaccess#L19-L23) | nosniff, X-Frame-Options, Referrer-Policy |

### 1.3 طبقة Drive

| الميزة | الملف | الملاحظات |
|---|---|---|
| ✅ Drive API v3 مباشرة عبر UrlFetchApp | [src/DriveArchiver.gs:20-25](src/DriveArchiver.gs#L20-L25) | تجنّب DriveApp لدعم appProperties |
| ✅ Multipart upload (≤ 5 MB) | [src/DriveArchiver.gs:164-207](src/DriveArchiver.gs#L164-L207) | multipart/related |
| ✅ Resumable upload (> 5 MB) بـ Chunks 10 MB | [src/DriveArchiver.gs:235-303](src/DriveArchiver.gs#L235-L303) | يبثّ chunk-by-chunk من bridge |
| ✅ Folder tree cache in-session | [src/DriveArchiver.gs:41-72](src/DriveArchiver.gs#L41-L72) | `Map<relPath, folderId>` |
| ✅ appProperties (sha256, srcMtime) | [src/DriveArchiver.gs:113-116](src/DriveArchiver.gs#L113-L116) | لا يخزّن srcPath (حد 124 بايت) |
| ✅ Retry + non-retriable 4xx handling | [src/DriveArchiver.gs:186-195](src/DriveArchiver.gs#L186-L195) | 401/403/404 → لا إعادة |

### 1.4 نظام كشف التكرار (v1 — أولي)

| الميزة | الملف | الملاحظات |
|---|---|---|
| ✅ فهرس Google Sheet | [src/Deduplicator.gs:29-190](src/Deduplicator.gs#L29-L190) | 5 أعمدة (v2.0 يطلب 15) |
| ✅ Lazy in-memory cache | [src/Deduplicator.gs:135-153](src/Deduplicator.gs#L135-L153) | تحميل كامل عند أول lookup |
| ✅ SHA-256-based lookup | [src/Deduplicator.gs:44-47](src/Deduplicator.gs#L44-L47) | O(1) بعد التحميل |
| ✅ Versioned name generation | [src/Deduplicator.gs:121-130](src/Deduplicator.gs#L121-L130) | `photo_v2026-04-17_14-30-00.jpg` |
| ✅ Dotfile-safe naming | [src/Deduplicator.gs:126](src/Deduplicator.gs#L126) | `.env` → `.env_v...` |
| ✅ Auto-create sheet on first run | [src/Deduplicator.gs:166-190](src/Deduplicator.gs#L166-L190) | مع رؤوس ثابتة وتنسيق |

### 1.5 الجدولة والتنسيق

| الميزة | الملف | الملاحظات |
|---|---|---|
| ✅ Trigger management ديناميكي | [src/Scheduler.gs:34-64](src/Scheduler.gs#L34-L64) | Hourly/Daily/Weekly + حذف السابق |
| ✅ Notification triggers | [src/Scheduler.gs:70-82](src/Scheduler.gs#L70-L82) | Daily 07:00 + Weekly Sunday |
| ✅ LockService wrapper | [src/Scheduler.gs:141-160](src/Scheduler.gs#L141-L160) | `tryLock(2000)` |
| ✅ Checkpoint في Drive JSON | [src/Scheduler.gs:173-225](src/Scheduler.gs#L173-L225) | ليس ScriptProperties (حد 500KB) |
| ✅ Resume trigger (60s) | [src/Scheduler.gs:97-101](src/Scheduler.gs#L97-L101) | one-off بعد استنفاد الوقت |
| ✅ Main archive loop مع Circuit Breaker | [src/ArchiveOrchestrator.gs:253-302](src/ArchiveOrchestrator.gs#L253-L302) | 20 فشل متتالي → إيقاف |
| ✅ Per-file processing pipeline | [src/ArchiveOrchestrator.gs:347-422](src/ArchiveOrchestrator.gs#L347-L422) | checksum → dedup → upload → log |
| ✅ Retry queue (pending manual) | [src/ArchiveOrchestrator.gs:304-337](src/ArchiveOrchestrator.gs#L304-L337) | + UI trigger من ManualQueue |

### 1.6 السجلات والإشعارات

| الميزة | الملف | الملاحظات |
|---|---|---|
| ✅ Activity Log Sheet (12 عمود) | [src/Logger.gs:16-20](src/Logger.gs#L16-L20) | Timestamp, FileName, SourcePath, DrivePath, SizeBytes, SHA256, Status, DurationMs, ErrorMessage, RetryCount, ActionTaken, SessionId |
| ✅ Batch write helper | [src/Logger.gs:57-63](src/Logger.gs#L57-L63) | تجنّب appendRow المتكرر |
| ✅ getStatsBetween للتقارير | [src/Logger.gs:73-122](src/Logger.gs#L73-L122) | يفلتر بالتاريخ ويجمع per-status |
| ✅ getPendingManual للطابور | [src/Logger.gs:130-147](src/Logger.gs#L130-L147) | مصدر UI ManualQueue |
| ✅ Singleton pattern | [src/Logger.gs:239-244](src/Logger.gs#L239-L244) | تجنّب إعادة فتح Sheet |
| ✅ Daily HTML digest RTL | [src/Notifier.gs:115-177](src/Notifier.gs#L115-L177) | KPI grid + failed files table |
| ✅ Weekly summary | [src/Notifier.gs:179-203](src/Notifier.gs#L179-L203) | KPIs بسيطة |
| ✅ Failure alert فوري | [src/Notifier.gs:205-224](src/Notifier.gs#L205-L224) | مع gating بـ `ALERT_ON_FAILURE` |
| ✅ Test email button | [src/Notifier.gs:58-67](src/Notifier.gs#L58-L67) | ربط في UI الإعدادات |
| ✅ GmailApp → MailApp fallback | [src/Notifier.gs:81-91](src/Notifier.gs#L81-L91) | حصص مختلفة |
| ✅ HTML escaping للسلاسل الحساسة | [src/Notifier.gs:258-263](src/Notifier.gs#L258-L263) | `escapeHtml_` |

### 1.7 واجهة المستخدم

| الميزة | الملف | الملاحظات |
|---|---|---|
| ✅ SPA shell بـ 3 تبويبات | [src/Index.html](src/Index.html) | Dashboard, Settings, ManualQueue |
| ✅ Material Design 3 tokens | [src/Stylesheet.html:5-28](src/Stylesheet.html#L5-L28) | ألوان، radii، shadows |
| ✅ RTL كامل | [src/Index.html:2](src/Index.html#L2) | `dir="rtl" lang="ar"` |
| ✅ Cairo + Material Icons fonts | [src/Index.html:8-11](src/Index.html#L8-L11) | من CDN جوجل |
| ✅ 15 حقل إعدادات | [src/Settings.html:1-180](src/Settings.html) | Bridge + Drive + Behavior + Schedule + Notif |
| ✅ Password toggle + placeholder ذكي للأسرار | [src/Settings.html:194-202](src/Settings.html#L194-L202) | لا يحقن السر المُقنّع مرة أخرى |
| ✅ Test buttons (Connection + Email) | [src/Settings.html:47-53](src/Settings.html#L47-L53) | UX جيد مع snackbar |
| ✅ 6 KPI dashboard | [src/Dashboard.html:31-59](src/Dashboard.html) | success/versioned/skipped/failed/pending/bytes |
| ✅ Status chip حي في header | [src/Dashboard.html:87-92](src/Dashboard.html#L87-L92) | IDLE/ACTIVE/PAUSED/ERROR |
| ✅ Manual queue table + multi-select | [src/ManualQueue.html:31-73](src/ManualQueue.html#L31-L73) | + retry all/selected |
| ✅ Promise wrapper لـ google.script.run | [src/Scripts.html:6-16](src/Scripts.html#L6-L16) | `gsRun()` |
| ✅ Lazy panel refresh عند التبديل | [src/Scripts.html:35-51](src/Scripts.html#L35-L51) | tabs |

### 1.8 الاختبارات

| الميزة | الملف | التغطية |
|---|---|---|
| ✅ Mini AAA runner | [src/Tests.gs:20-74](src/Tests.gs#L20-L74) | لا Framework خارجي |
| ✅ 24 unit test | [src/Tests.gs:80-313](src/Tests.gs#L80-L313) | hashing (3) + AE (3) + constant-time (3) + retry (3) + budget (3) + formatters (7) + versioning (3) + filter (3) |

### 1.9 نقاط دخول واجهة UI API

| الدالة | الملف | الوظيفة |
|---|---|---|
| `doGet` | [src/Main.gs:21-27](src/Main.gs#L21-L27) | تقديم SPA |
| `uiGetConfig` | [src/Main.gs:59-62](src/Main.gs#L59-L62) | + masking للأسرار |
| `uiSaveConfig` | [src/Main.gs:70-75](src/Main.gs#L70-L75) | + normalization لـ Drive URLs |
| `uiTestConnection` | [src/Main.gs:108-111](src/Main.gs#L108-L111) | ping bridge |
| `uiTestEmail` | [src/Main.gs:117-120](src/Main.gs#L117-L120) | test digest |
| `uiInstallSchedule` | [src/Main.gs:131-136](src/Main.gs#L131-L136) | + notification triggers |
| `uiRemoveAllTriggers` | [src/Main.gs:139-143](src/Main.gs#L139-L143) | - |
| `uiListTriggers` | [src/Main.gs:146-149](src/Main.gs#L146-L149) | لعرض UI |
| `uiGetDashboardStats` | [src/Main.gs:163-196](src/Main.gs#L163-L196) | آخر 24 ساعة |
| `uiGetPendingManual` | [src/Main.gs:203-206](src/Main.gs#L203-L206) | للطابور |
| `uiRetryPending` | [src/Main.gs:215-227](src/Main.gs#L215-L227) | يجدول resume trigger |
| `uiRunNow` | [src/Main.gs:238-246](src/Main.gs#L238-L246) | يمنع الطلبات المتزامنة |

---

## القسم 2: ما يحتاج تحسين ⚠️

### 2.1 مشاكل بنيوية (High Priority)

#### 🔴 [CRITICAL] `appsscript.json` ناقص بشكل خطير

**الملف:** [src/appsscript.json](src/appsscript.json)

```json
{
  "timeZone": "America/New_York",   // ❌ يجب Asia/Muscat
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8"
  // ❌ لا oauthScopes
  // ❌ لا webapp {access, executeAs}
}
```

**المشكلة:**
- `oauthScopes` غير مصرَّح — Apps Script سيطلبها تلقائياً لكن هذا هش (قد يتغيّر السلوك بين النشرات).
- `webapp.access = MYSELF` غير موجود — Main.gs يعتمد عليه في `assertAuthorized_()` (تعليق سطر 6-9).
- `timeZone` خاطئ — يؤثر على `atHour()` في Triggers ⇒ الجدولة ستقع بتوقيت غير متوقع!

**الإصلاح المطلوب:** إضافة القسمين `oauthScopes` (7-8 scopes) و `webapp` مع تصحيح المنطقة.

---

#### 🔴 [POLLUTION] دوال تشخيصية في ملف production

**الملف:** [src/ArchiveOrchestrator.gs:19-123](src/ArchiveOrchestrator.gs#L19-L123)

خمس دوال تشخيصية سُرّبت للـ orchestrator:
- `diagFirstFile()` — يختبر Drive API
- `testDriveRoot()` — يفحص permissions
- `testDriveWrite()` — ينشئ مجلد `_test_write_...`
- `testDriveApi()` — يستدعي `/about`
- `forceReset()` — **خطر!** يحذف كل Triggers ويمسح checkpoints

**المشكلة:**
- تضخّم الملف بلا فائدة إنتاجية.
- `forceReset()` قابلة للاستدعاء من Apps Script editor → أي مستخدم لديه صلاحية تحرير يمكنه مسح كل الحالة.
- تنتهك مبدأ Single Responsibility.

**الإصلاح المقترح:** نقلها إلى `Diagnostics.gs` منفصل مع تعليق `@internal` واضح، أو حذفها تماماً.

---

#### 🟠 [DEAD-CODE] Config keys معلَنة لكن غير مستخدمة

| المفتاح | المكان المعلَن | المكان المفترض استخدامه | الحالة |
|---|---|---|---|
| `MAX_RETRIES` | Config.gs:29 | Utils.gs (retryWithBackoff) | ❌ لم يُقرأ أبداً — retryWithBackoff تستخدم `opts.maxRetries` أو 3 hardcoded |
| `BANDWIDTH_LIMIT_MB` | Config.gs:30 | Orchestrator | ❌ لم يُقرأ — لا حماية من إغراق cPanel |
| `CSRF_TOKEN_SALT` | Config.gs:51 | Main.gs (Web App) | ❌ لا CSRF token generation أو verification |
| `CPANEL_HOST` | Config.gs:17 | UI Info only | ⚠️ يُخزَّن لكن لا يُستخدم |
| `CPANEL_USERNAME` | Config.gs:18 | UI Info only | ⚠️ يُخزَّن لكن لا يُستخدم |

**التوصية:** إما تنشيطها فعلياً أو تعليمها بـ `@deprecated`/`@reserved`.

---

#### 🟠 [SCALE] Deduplicator يحمّل الفهرس كاملاً في الذاكرة

**الملف:** [src/Deduplicator.gs:135-153](src/Deduplicator.gs#L135-L153)

```javascript
loadCache_() {
  ...
  const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  for (let i = 0; i < data.length; i++) { this.cache_.set(...); }
  ...
}
```

**المشكلة:** CLAUDE.md يتوقع "ملايين الصفوف" في Full Index. تحميل ملايين الصفوف في `Map` سيتجاوز حد ذاكرة Apps Script (~256 MB) ويكسر الجلسة.

**الإصلاح المطلوب في v2.0:** Layer 1 Bloom Filter (سعة 100k) + Layer 2 Hot Cache (CacheService) + Layer 3 Sheet كـ cold storage مع lookup مُوجَّه (لا full load).

---

#### 🟠 [SEMANTICS] الفرق بين `FAILED` و `PENDING_MANUAL` غير متسق

**الملف:** [src/ArchiveOrchestrator.gs:446-467](src/ArchiveOrchestrator.gs#L446-L467)

- `recordFailure_()` يكتب `PENDING_MANUAL` (لا `FAILED`) في كل حالة فشل عادي.
- لكن `Notifier.buildDailySubject_()` [src/Notifier.gs:105-113](src/Notifier.gs#L105-L113) يعلن "X فشل" مستنداً إلى `stats.failed`.
- `stats.failed` يظل 0 دائماً لأن ما من ملف يُكتب بـ `FAILED`!

**النتيجة:** الرسائل اليومية تقول "0 فشل" حتى لو فشلت كل الملفات (يظهرون كـ `PENDING_MANUAL`).

**الإصلاح:** إما توحيد الاسم، أو تحديث Subject/Dashboard ليدمج `failed + pendingManual` كـ "فاشل".

---

### 2.2 Code smells متوسطة

#### 🟡 خيار تشغيل واحد فقط (PHP Bridge)

**الملف:** [src/CpanelConnector.gs:237-239](src/CpanelConnector.gs#L237-L239)

Factory يعد بـ "UAPI / WebDAV plug-in" لكن لا شيء منها موجود. CLAUDE.md يعد بـ 3 طرق.

**الحالة:** غير حرج، PHP Bridge كافٍ لأغلب Shared Hosting.

---

#### 🟡 كاش الجلسة يعتمد على Property واحد للـ pending_retry_paths

**الملف:** [src/ArchiveOrchestrator.gs:491-499](src/ArchiveOrchestrator.gs#L491-L499)

يخزَّن كـ JSON string واحد في property واحد ⇒ حد 9 KB لكل قيمة. آلاف المسارات ستتجاوزه.

---

#### 🟡 اختبار `applyFilter_` يستخدم PropertiesService حقيقي

**الملف:** [src/Tests.gs:275-313](src/Tests.gs#L275-L313)

- يعدّل `FILE_TYPE_FILTER` مباشرة (بدل mock).
- يعتمد على `this.getConfig` غير الموجود [src/Tests.gs:278](src/Tests.gs#L278).
- ينظّف نفسه في النهاية لكن أي فشل mid-test يترك حالة قذرة.

---

#### 🟡 `normalizePath('')` تعيد `'/'` لكن ترمى بحماية بسيطة في الأركسترا

**الملف:** [src/Utils.gs:373-375](src/Utils.gs#L373-L375)

`Deduplicator.folderCache_` يستخدم `''` كمفتاح للجذر لكن `normalizePath` تحوّله إلى `'/'`. عدم اتساق يعمل حالياً بالمصادفة لأن `ensureFolderPath` يفحص `if (norm === '' || norm === '/')`.

---

#### 🟡 `sessionId` يُنشأ في كل مرة (لا يُعاد استخدامه في resume)

**الملف:** [src/ArchiveOrchestrator.gs:184-186](src/ArchiveOrchestrator.gs#L184-L186)

فعلياً يُعاد من checkpoint — لكن checkpoint نفسه يعتمد على قراءة/كتابة ملف Drive وقد يفشل صامتاً.

---

#### 🟡 المستكشف الأولي في Dashboard لا يُظهر `nextRun`

**الملف:** [src/Main.gs:180](src/Main.gs#L180)

`nextRun: null // Apps Script API لا يعرض وقت التشغيل القادم`

هذا صحيح تقنياً لكن يمكن حسابه من `SCHEDULE_TIME` + `SCHEDULE_FREQUENCY`.

---

### 2.3 مشاكل ثانوية

- 🟢 [src/Notifier.gs:60](src/Notifier.gs#L60): `sendTestEmail` يقرأ `email_` مرة واحدة عند البناء ⇒ إن غُيّر الإعداد أثناء الجلسة، سيُرسَل للقديم.
- 🟢 [src/Config.gs:174-183](src/Config.gs#L174-L183): `getAllConfig` تفكّ الأسرار حتى عند `maskSecrets=false` ⇒ ترجع plaintext إلى UI. حالياً UI يمرِّر `true` دائماً، لكن API endpoint مباشر قد يكشف السر.
- 🟢 [src/Scheduler.gs:41-42](src/Scheduler.gs#L41-L42): parseInt بدون radix (safe لكن ESLint سيصرخ).
- 🟢 [src/Deduplicator.gs:157-158](src/Deduplicator.gs#L157-L158): إن كان الـ tab غير موجود يعود إلى `getActiveSheet()` — قد يكتب في tab خطأ عند التغيير اليدوي.
- 🟢 [src/Logger.gs:190-193](src/Logger.gs#L190-L193): نفس مشكلة fallback إلى activeSheet.
- 🟢 README.md يصف بنية `src/cpanel/`, `src/drive/`, `src/dedup/` — لكن الكود flat في `src/` مباشرة.

---

## القسم 3: ما هو مفقود من v2.0 ❌

### 3.1 نظام كشف التكرار (Smart Deduplication)

| المكوّن | الحالة | التفاصيل من CLAUDE.md |
|---|---|---|
| ❌ Bloom Filter | مفقود تماماً | سعة 100k، MurmurHash3، 10 hash functions، ~180 KB bit array |
| ❌ Hot Cache Layer | مفقود | CacheService بـ 72h TTL configurable |
| ❌ Full Index Sheet (15 عمود) | جزئي (5 من 15) | ينقص: RowId, FileName, SourcePath, DrivePath, MimeType, ArchivedAt, Status, EvictedTo, EvictionId, LastVerifiedAt, VersionNumber, PreviousSHA, Notes |
| ❌ Weekly Delta Verification | مفقود | فحص 5% عشوائي أسبوعياً + كشف حذف يدوي |
| ❌ Tombstoning (EVICTED status) | مفقود | يمنع إعادة أرشفة الملفات المُفرَّغة |

### 3.2 Guardian Mode (وضع الحارس)

| المكوّن | الحالة |
|---|---|
| ❌ Delayed Deletion (72h wait) | حالياً حذف فوري إن SOURCE_DELETE_MODE=true |
| ❌ Trash Monitoring trigger | مفقود |
| ❌ Auto-Restore من Trash | مفقود |
| ❌ Delete Lock (Drive Permissions) | مفقود |
| ❌ Audit Log Sheet | مفقود |
| ❌ Emergency Freeze toggle | مفقود |
| ❌ Geographic Backup | مفقود |
| ❌ Alert on Manual Delete | مفقود |

### 3.3 نظام Vault Migration (التفريغ)

| المكوّن | الحالة |
|---|---|
| ❌ Interactive Folder Tree UI | مفقود |
| ❌ Quick Selectors (>100MB, >1yr, etc) | مفقود |
| ❌ Job Queue (1 active + 10 queued) | مفقود |
| ❌ Preview Mode قبل التنفيذ | مفقود |
| ❌ 4 Destinations (Local ZIP, FTP, S3, Metadata) | مفقود |
| ❌ Strategies (SingleZip / ChunkedZips / SequentialFiles) | مفقود |
| ❌ Advanced Manifest JSON | مفقود |
| ❌ Post-Download Verification (Manual/Auto/Hybrid) | مفقود |
| ❌ Delete Mode (Manual/Semi/Full auto) | جزئي (فقط bool) |
| ❌ Active Sessions Dashboard | مفقود |
| ❌ Local Storage Bookmarks | مفقود |

### 3.4 Companion API (Phase 2 hooks)

| المكوّن | الحالة |
|---|---|
| ❌ `doPost` handler | مفقود |
| ❌ API Router (`/api/v1/*`) | مفقود |
| ❌ API Key management sheet | مفقود |
| ❌ CSRF protection (المفتاح موجود لكن غير مُستخدَم) | مفقود |

### 3.5 UI Enhancements

| المكوّن | الحالة |
|---|---|
| ❌ 10 tabs (لدينا 3) | جزئي |
| ❌ Language switcher (AR/EN) | مفقود |
| ❌ Dark/Light mode | مفقود |
| ❌ Guardian tab | مفقود |
| ❌ Eviction tab | مفقود |
| ❌ i18n files (ar.json, en.json) | مفقود |
| ❌ Advanced tab (API, Debug, Reset) | مفقود |

### 3.6 Reliability Enhancements

| المكوّن | الحالة |
|---|---|
| ⚠️ Circuit Breaker موجود لكن غير قابل للتخصيص | LIMITS.MAX_CONSECUTIVE_FAILS hardcoded |
| ⚠️ Retry Backoff Strategy غير قابل للتخصيص | dropdown في المواصفات (EXPONENTIAL/LINEAR) |
| ⚠️ Bandwidth Limit غير مطبَّق | key موجود، لا فعل |
| ❌ Retry Failed Archives trigger (كل 6 ساعات) | مفقود — حالياً manual فقط |
| ❌ Cleanup Old Logs trigger (شهري) | مفقود |
| ❌ Queue Processor trigger (كل 5 دقائق) | مفقود (لأن Queue نفسه غير موجود) |

### 3.7 مستندات مفقودة

- ❌ `ARCHITECTURE.md` (Mermaid diagrams)
- ❌ `docs/DEPLOYMENT.md`
- ❌ `docs/CPANEL_SETUP.md`
- ❌ `docs/TROUBLESHOOTING.md`
- ❌ `docs/API_REFERENCE.md`
- ❌ `docs/SECURITY.md`
- ❌ `LICENSE` (مذكور في README لكن مفقود من الجذر — موجود في `_legacy_backup/`)
- ❌ `CONTRIBUTING.md`
- ❌ `.github/workflows/deploy.yml`

---

## القسم 4: مصفوفة الفجوات (Gap Matrix) 📊

| # | الميزة | v1 الحالي | v2.0 المطلوب | الفجوة | الأولوية |
|---|---|---|---|---|---|
| 1 | Config keys | 22 | 60+ | Guardian(9) + Dedup(5) + Eviction(11) + Notification(5) + Advanced | 🔴 P0 |
| 2 | appsscript.json scopes | 0 (auto) | 8 صريحة | كل الـ scopes + webapp block + timeZone | 🔴 P0 |
| 3 | Deduplication method | Sheet-only | Bloom+Cache+Sheet+Delta | 3 طبقات كاملة | 🔴 P0 |
| 4 | Full Index columns | 5 | 15 | 10 أعمدة | 🔴 P0 |
| 5 | Guardian Mode | 0% | 100% | كل الوحدة | 🔴 P0 |
| 6 | Eviction Engine | 0% | 100% | JobQueue + FolderTree + 4 Destinations + Strategies + Manifest | 🟠 P1 |
| 7 | UI tabs | 3 | 10 | Guardian, Eviction, Notif split, Reports, Advanced، Dedup config | 🟠 P1 |
| 8 | Triggers | 3 (main, daily, weekly) | 7 | trashMonitor, weeklyDelta, queueProcessor, retryFailed, cleanupLogs | 🟠 P1 |
| 9 | File status enum | 6 | 11 | + EVICTED_TO_LOCAL/FTP/S3, RESTORED_FROM_TRASH, QUARANTINED | 🟡 P2 |
| 10 | Companion API | 0% | Phase 2 hooks | doPost router + ApiKeys + Auth | 🟡 P2 |
| 11 | CSRF protection | key معلَن غير مُستخدَم | مُفعَّل | generate + verify في doPost | 🟠 P1 (أمن) |
| 12 | Bandwidth throttling | key معلَن غير مُستخدَم | مُفعَّل | تتبع bytes per session | 🟡 P2 |
| 13 | Language i18n | AR only | AR + EN | ملفات ترجمة + switcher | 🟡 P2 |
| 14 | Dark mode | لا | نعم | CSS variables + toggle | 🟢 P3 |
| 15 | Emergency Freeze | لا | نعم | flag يقرأه Orchestrator في بداية كل ملف | 🟠 P1 |
| 16 | Tests | 24 (unit فقط) | Feature + Integration | Bloom, Guardian, Eviction, Manifest, ApiRouter | 🟠 P1 |
| 17 | Documentation | README + CHANGELOG | 8 مستندات | ARCHITECTURE + docs/* + LICENSE في الجذر | 🟡 P2 |
| 18 | CI/CD | لا | GitHub Actions | `.github/workflows/deploy.yml` | 🟢 P3 |
| 19 | مسار المجلدات (folders src/*/) | flat | متداخل | reorganization غير مُلحّ (يكسر التاريخ) | 🟢 P3 |
| 20 | تشخيصات pollution | 5 دوال في Orchestrator | مفصولة | نقل إلى Diagnostics.gs | 🟡 P2 |

**التوزيع:** 🔴 P0: 5 · 🟠 P1: 7 · 🟡 P2: 6 · 🟢 P3: 3

---

## القسم 5: خطة الترقية التدريجية 🗺️

**المبدأ الحاكم:** كل خطوة تحافظ على قابلية `runAllTests` للنجاح ولا تكسر UI الحالي.

### 🥇 المرحلة A: الإصلاحات الأمنية والبنيوية العاجلة (لا وظائف جديدة)

**الهدف:** جعل v1 صالح للإنتاج قبل بناء v2.0 عليه.

1. **A1** — إصلاح `appsscript.json` (scopes + webapp + timeZone). قابل للاختبار عبر إعادة النشر.
2. **A2** — نقل الدوال التشخيصية من `ArchiveOrchestrator.gs` إلى `Diagnostics.gs` جديد. لا تغيير سلوكي.
3. **A3** — توحيد `FAILED` / `PENDING_MANUAL` في الإحصائيات (خيار: عمود جديد `FailureCategory`).
4. **A4** — تفعيل `CSRF_TOKEN_SALT` في `doGet`/`doPost` (حماية استباقية).
5. **A5** — تنشيط `MAX_RETRIES` و `BANDWIDTH_LIMIT_MB` (قراءتهما فعلياً في Orchestrator).

**Commits:** 5. **الاختبارات:** لا اختبارات جديدة (لا سلوك جديد). **الوقت المتوقع:** ~جلسة واحدة.

---

### 🥈 المرحلة B: توسعة Config لدعم v2.0 (بدون تفعيل)

**الهدف:** إضافة كل مفاتيح v2.0 مع defaults آمنة (كل الميزات الجديدة OFF افتراضياً).

1. **B1** — إضافة `PROP_KEYS` الجديدة (Guardian, Dedup, Eviction, Notifications, Advanced).
2. **B2** — تحديث `DEFAULTS` مع قيم آمنة (كل toggle=off).
3. **B3** — توسيع `validateConfig()` بدون كسر التحقق الحالي.
4. **B4** — إضافة `Tests.gs` لكل مفتاح جديد.

**Commits:** 4. **الوقت:** ~جلسة نصف.

---

### 🥉 المرحلة C: Smart Deduplication (بدائل تدريجية)

**الهدف:** إضافة Bloom + Cache دون كسر Deduplicator الحالي. يبقى الفهرس السابق يعمل.

1. **C1** — إنشاء `BloomFilter.gs` مع MurmurHash3 + persistence في ScriptProperties (Base64).
2. **C2** — إنشاء `HotCache.gs` كطبقة رقيقة على CacheService.
3. **C3** — إنشاء `FullIndex.gs` بـ 15 عمود (ترحيل الفهرس القديم عبر migration script).
4. **C4** — تحديث `Deduplicator.gs` ليصبح Orchestrator يستدعي 3 طبقات بترتيب Bloom → Cache → Index.
5. **C5** — `DeltaVerifier.gs` جديد + trigger أسبوعي.
6. **C6** — اختبارات unit + integration.

**Commits:** 6. **الوقت:** ~جلستان. **المخاطر:** ترحيل الفهرس القديم — يحتاج migration محمي بـ backup.

---

### 🏅 المرحلة D: Guardian Mode

**الهدف:** حماية دون تغيير لسلوك الأرشفة الحالي.

1. **D1** — `GuardianMode.gs` صنف يقرأ Config ويقرر إجراءات pre/post archive.
2. **D2** — Delayed Deletion: طابور DELETE_PENDING في sheet منفصل + trigger يومي.
3. **D3** — `TrashMonitor.gs` + trigger.
4. **D4** — `AutoRestore.gs`.
5. **D5** — `EmergencyFreeze` (flag يقرأه Orchestrator في بداية كل ملف).
6. **D6** — `AuditLog.gs` كـ sheet منفصل.
7. **D7** — UI tab جديد لـ Guardian.

**Commits:** 7. **الوقت:** ~جلستان.

---

### 🎖️ المرحلة E: Eviction Engine

**الهدف:** أكبر ميزة v2.0. تحتاج تخطيط منفصل قبل البدء.

1. **E1** — `JobQueue.gs` مع 1 active + 10 queued.
2. **E2** — `FolderTree.gs` + UI مستكشف.
3. **E3** — Preview Mode.
4. **E4** — Strategies (SingleZip → ChunkedZips → SequentialFiles).
5. **E5** — Destinations (Local → Metadata → FTP → S3).
6. **E6** — `ManifestGenerator.gs`.
7. **E7** — Verification workflows.
8. **E8** — UI tab.

**Commits:** 8. **الوقت:** ~3-4 جلسات.

---

### 🏆 المرحلة F: باقي المراحل من CLAUDE.md

- تحديثات UI (10 tabs + i18n + dark mode).
- Companion API (doPost + ApiRouter + ApiAuth).
- Retry/Cleanup/QueueProcessor triggers.
- Documentation كاملة.
- CI/CD.

---

## القسم 6: المخاطر الأمنية 🔒

### 🔴 [عالي] فقدان `webapp.access = MYSELF` في المانفست

**الملف:** [src/appsscript.json](src/appsscript.json) + [src/Main.gs:6-9](src/Main.gs#L6-L9)

Main.gs يعلن في تعليقه أن `access=MYSELF + executeAs=USER_DEPLOYING` مضمونان من المانفست — **لكن المانفست لا يحويهما**. النشر الحالي قد يستخدم defaults (`access=ANYONE_WITH_GOOGLE_ACCOUNT`) وهو ما يعرّض cPanel للاتصال من أي مستخدم Google!

**التصعيد:** لو تم Deploy على default → أي شخص لديه رابط الـ Web App يمكنه استدعاء `uiSaveConfig` و **إعادة توجيه Drive folder** أو تسريب أسماء الملفات عبر `uiGetDashboardStats`.

**الإصلاح فوري:** أضف الـ webapp block قبل أي إعادة نشر.

---

### 🟠 [متوسط] `XFrameOptionsMode.ALLOWALL` يفتح النافذة للـ Clickjacking

**الملف:** [src/Main.gs:26](src/Main.gs#L26)

`.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)` يسمح لأي موقع بتضمين SPA في iframe → clickjacking على أزرار مثل "تفعيل الجدولة" أو "إعادة محاولة الكل".

**الإصلاح:** استبدل بـ `SAMEORIGIN` (Apps Script default آمن).

---

### 🟠 [متوسط] لا CSRF على Web App state-changing calls

**الملفات:** `uiSaveConfig`, `uiInstallSchedule`, `uiRemoveAllTriggers`, `uiRunNow`, `uiRetryPending`

كل هذه غير محمية بـ CSRF token. `CSRF_TOKEN_SALT` معلَن في Config لكن **لا generation ولا verification**. مع `access=MYSELF` الخطر منخفض عملياً (المهاجم لا يستطيع الوصول أصلاً)، لكن لو تغيّرت سياسة النشر، الخطر يتفاقم.

---

### 🟡 [منخفض] `getAllConfig(false)` يفكّ الأسرار

**الملف:** [src/Config.gs:170-186](src/Config.gs#L170-L186)

حالياً UI يستدعي `getAllConfig(true)` دائماً، لكن أي endpoint مستقبلي يستدعي `false` سيعرِّض السر الفعلي. الأفضل أن يكون `maskSecrets` **افتراضياً true** بدل false.

---

### 🟡 [منخفض] Diagnostic `forceReset()` قابلة للاستدعاء من Editor

**الملف:** [src/ArchiveOrchestrator.gs:113-123](src/ArchiveOrchestrator.gs#L113-L123)

أي شخص لديه تحرير Script يمكنه تشغيلها → مسح Triggers + Checkpoint + Pending Queue فوراً. يجب إما نقلها أو إضافة confirmation prompt أو حذفها.

---

### 🟡 [منخفض] `bridge.php` لا يسجّل محاولات auth الفاشلة

**الملف:** [bridge/bridge.php:87-96](bridge/bridge.php#L87-L96)

لا log ولا rate limiting → brute-force ممكن بلا اكتشاف. مع سر 32 حرف عشوائي، الاحتمال منخفض لكن defense-in-depth مطلوب.

**الإصلاح:** log إلى ملف داخل مجلد `.archiver-bridge/logs/` (مع rotation) + sleep بسيط بعد الفشل.

---

### 🟢 [ملاحظة] `BRIDGE_SECRET` placeholder في الكود المُلتزَم في Git

**الملف:** [bridge/bridge.php:35](bridge/bridge.php#L35)

النص واضح: "REPLACE_WITH_A_LONG_RANDOM_SECRET_AT_LEAST_32_CHARS" — التعليق يحذر ألا يُلتزَم بالسر الفعلي. جيد. لكن لا `.gitignore` rule يمنع الالتزام الخاطئ.

**الإصلاح المقترح:** `bridge/bridge.php.example` + rule في `.gitignore` تُحظر `bridge/bridge.php` بعد تعديله.

---

### 🟢 [إيجابي] نقاط قوة أمنية موجودة

- ✅ Encrypt-then-MAC صحيح تقنياً (nonce عشوائي 16 بايت + MAC 32 بايت).
- ✅ `constantTimeEquals_` في Utils.
- ✅ `hash_equals` في bridge.
- ✅ Path Traversal مغطاة بـ `realpath()` + prefix check.
- ✅ HTML escaping في email templates.
- ✅ HTTPS enforced في `.htaccess`.
- ✅ Bearer token في Authorization header (وليس query string حيث يُسرَّب في logs).

---

## القسم 7: التوصيات النهائية 💡

### 🎯 الحكم العام

**v1 codebase صحّي ومبني بمهارة.** جودة الكود، JSDoc، التصميم Class-based، الاختبارات، الحماية الأمنية الأساسية — كلها على مستوى production. **البناء عليه أفضل بكثير من إعادة الكتابة.**

### 📋 قرار العمل المُقترَح (بالترتيب)

**قبل أي ميزة v2.0 جديدة:**

1. 🔴 **تنفيذ المرحلة A كاملة** (5 إصلاحات أمنية/بنيوية). هذه لا تُضيف ميزات — بل تحمي ما هو موجود.
2. ✅ **تشغيل `runAllTests` بعد كل تعديل** للتحقق من عدم كسر السلوك.
3. ✅ **إنشاء branch منفصل لكل مرحلة** — commits صغيرة متكررة.

**عند بدء ميزات v2.0:**

4. 🟠 **الترتيب المُقترَح:** C (Dedup) → D (Guardian) → E (Eviction) → F (UI/API/Docs).
5. ✅ **كل مرحلة يجب أن تبدأ باقتراح schema/config قبل الكود** — للحصول على موافقتك.
6. ⚠️ **Migration الفهرس القديم** (المرحلة C3) هو أخطر خطوة — يحتاج backup تلقائي قبل التنفيذ.

### 🚦 قرارات تحتاج مدخلات المستخدم قبل بدء المرحلة 1

قبل الانتقال للمرحلة 1 من CLAUDE.md، أحتاج توضيحات:

1. **timeZone:** هل نصححه إلى `Asia/Muscat` كما يقول CLAUDE.md؟ (حالياً `America/New_York`)
2. **الدوال التشخيصية:** حذف كامل، أم نقل إلى `Diagnostics.gs` مع تعليق `@internal`؟
3. **الفهرس القديم:** هل به بيانات فعلية الآن؟ (يؤثر على استراتيجية Migration في المرحلة C).
4. **CSRF:** هل نضيف طبقة CSRF كامنة الآن، أم نؤجّلها للمرحلة F مع Companion API؟
5. **البنية المتداخلة (src/dedup/, src/guardian/…):** هل نبقيها flat كما هي أم نتّبع البنية المتداخلة الموصوفة في CLAUDE.md؟ (تغيير البنية سيكسر git blame).

---

## 📌 خاتمة

هذا التقرير خريطة، وليس حكماً. الكود v1.0.0 نجح فيما وضع نفسه له. المسار إلى v2.0 واضح — لكن يحتاج انضباطاً في تسلسل التنفيذ وحماية للسلوك الحالي.

**⏸️ بانتظار موافقتك على التقرير + الإجابة على 5 الأسئلة أعلاه قبل الانتقال إلى المرحلة 1.**

---

*نهاية التقرير · تم إعداده كجزء من المرحلة 0 · لم تُعدَّل أي ملفات في `src/` أو `bridge/`.*

</div>
