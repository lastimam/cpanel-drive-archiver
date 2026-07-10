# 🛑 STOP — قبل قراءة أي شيء آخر

**هذا الملف (`CLAUDE.md`) يحوي المواصفات التقنية للمشروع.**

**لكن قبل قراءته، يجب قراءة ملف `PRODUCTION_CONTEXT.md` أولاً.**

يحوي `PRODUCTION_CONTEXT.md` معلومات حرجة عن:
- ⚠️ حالة النظام الفعلية (نظام إنتاج حي مع 7,880 ملف و 297,602 سجل)
- 🚨 المشاكل التقنية الموثقة (UTF-8 124 bytes issue)
- 🔐 قواعد التعامل مع بيانات الإنتاج
- 📋 استراتيجية Migration من v1 إلى v2.0

**ترتيب القراءة الإلزامي:**
1. أولاً: `PRODUCTION_CONTEXT.md` (السياق الحرج)
2. ثانياً: `CLAUDE.md` (المواصفات — هذا الملف)
3. ثالثاً: `AUDIT_REPORT.md` (تقرير المرحلة 0)

---
# 🚨 CRITICAL CONTEXT — READ FIRST

## مشروع موجود مسبقاً (Existing Codebase)

**هذا المشروع ليس بداية من الصفر!** لديك بالفعل كود عامل يجب البناء عليه.

### 📁 مجلد `src/` يحوي 19 ملفاً بحجم 147 KB

| الملف | الحجم | الوظيفة |
|---|---|---|
| `ArchiveOrchestrator.gs` | 19.7 KB | 🎯 منظّم الأرشفة الرئيسي |
| `DriveArchiver.gs` | 13.7 KB | محرك الأرشفة |
| `Notifier.gs` | 11.9 KB | نظام الإشعارات |
| `Utils.gs` | 11.7 KB | SHA-256 + HMAC-AES + Retry |
| `Settings.html` | 11.5 KB | واجهة إعدادات كاملة |
| `Stylesheet.html` | 10.9 KB | CSS جاهز |
| `Tests.gs` | 10.5 KB | اختبارات جاهزة |
| `CpanelConnector.gs` | 8.9 KB | الاتصال بـ cPanel |
| `Logger.gs` | 8.0 KB | نظام السجلات |
| `Main.gs` | 7.6 KB | نقطة الدخول |
| `Scheduler.gs` | 7.4 KB | الجدولة |
| `Config.gs` | 7.2 KB | 22 مفتاح إعدادات |
| `Deduplicator.gs` | 5.9 KB | نظام التكرار (v1 — يحتاج ترقية) |
| `Dashboard.html` | 5.7 KB | لوحة التحكم |
| `ManualQueue.html` | 4.3 KB | طابور المحاولة اليدوية |
| `Scripts.html` | 3.0 KB | JavaScript للواجهة |
| `Index.html` | 2.2 KB | صفحة رئيسية |

### 📁 مجلد `bridge/` يحوي PHP Bridge كامل

- `bridge.php` (11.3 KB) — للاتصال بـ cPanel
- `.htaccess` (652 B) — الحماية

### 📄 CHANGELOG.md

تاريخ التطوير موثّق منذ v1.0.0 (2026-04-17).
النسخة القديمة الكاملة محفوظة في `_legacy_backup/CHANGELOG.v1.md`.

---

## 🎯 مهمتك الحقيقية

**لا تكتب من الصفر — بل حسّن الموجود ليطابق المواصفات في القسم الرئيسي أدناه.**

## 📋 خطة العمل المُعدَّلة

### المرحلة 0: تدقيق الكود الموجود (Code Audit) ← ابدأ من هنا!

- [ ] اقرأ كل ملفات `src/` بترتيب أولوية:
  1. `Config.gs` — لفهم الإعدادات المُتوقعة
  2. `Main.gs` — لفهم نقاط الدخول
  3. `ArchiveOrchestrator.gs` — للسير الرئيسي
  4. `CpanelConnector.gs` — لطريقة الاتصال المُطبَّقة
  5. `DriveArchiver.gs` — لطريقة الأرشفة المُطبَّقة
  6. `Deduplicator.gs` — للتكرار (نسخة أولى)
  7. `Utils.gs` — للأدوات المتوفرة
  8. `Settings.html` + `Stylesheet.html` — للواجهة الحالية
  9. `Tests.gs` — لفهم الاختبارات القائمة
  10. باقي الملفات
- [ ] اقرأ `bridge/bridge.php` و `bridge/.htaccess`
- [ ] اقرأ `CHANGELOG.md` و `_legacy_backup/CHANGELOG.v1.md`
- [ ] أنشئ تقرير `AUDIT_REPORT.md` يحوي:
  - ✅ **ما هو مطبّق حالياً** (قائمة الميزات العاملة)
  - ⚠️ **ما يحتاج تحسين** (Code smells, bugs محتملة, refactoring)
  - ❌ **ما هو مفقود من المواصفات الجديدة**:
    - Bloom Filter (100,000 capacity)
    - Guardian Mode (Delete Lock, Trash Monitoring, Auto-Restore, Audit Trail)
    - Vault Migration (Folder Tree, 4 destinations)
    - Job Queue (1 active + 10 queued)
    - Hot Cache (72h configurable)
    - Full Index Sheet
    - Delta Verifier
    - Manifest Generator
    - 4 Destinations (Local, FTP, S3, Metadata Only)
  - 📊 **مصفوفة الفجوات** (Gap Matrix)
  - 🗺️ **خطة ترقية تدريجية** دون كسر الوظائف الحالية
  - 🔒 **مخاطر أمنية** في الكود الحالي
- **⏸️ توقف واطلب مراجعتي قبل أي تعديل على الكود.**

### المراحل 1-11

كما هي موصوفة في القسم الرئيسي أدناه، لكن **بصيغة "تحسين وتوسيع" وليس "إنشاء من الصفر"**.

## ⚠️ قواعد صارمة

- 🚫 **لا تحذف أي ملف موجود** دون موافقتي الصريحة.
- 🚫 **لا تعيد كتابة ملف كاملاً** — استخدم `str_replace` للتعديلات الجزئية.
- 🚫 **لا تغيّر `Config.gs`** دون قراءة كامل مفاتيحه وتوثيق التغييرات.
- 🚫 **لا تحذف `bridge/`** — هو أساس التواصل مع cPanel.
- ✅ **حافظ على أسماء الدوال العامة** لتجنب كسر Tests.gs.
- ✅ **أضف اختبارات جديدة في Tests.gs** قبل تعديل الكود الحرج.
- ✅ **استخدم Git commits صغيرة ومتكررة** — commit لكل تحسين منطقي.
- ✅ **اقرأ التاريخ في CHANGELOG.md** لفهم سبب كل قرار سابق.
- ✅ **احترم بنية المشروع الحالية** — الكود في `src/`، لا تنقله.

## 🎯 معلومات clasp

- **Script ID:** `1tp2_LeiO4Xlt_XkyNC7QzLgI2WvbOKwq2AZkw-Uf4r_2S6atx2fD900F`
- **Root Directory:** `src/`
- **⚠️ عند التطوير:** ابقَ داخل بنية `src/` — لا تُنشئ ملفات كود في الجذر.

---

*نهاية القسم الحرج. القسم التالي هو المواصفات الكاملة.*

---

# 🤖 CLAUDE.md — cPanel-to-Google-Drive Archiver
## دليل التعليمات الشامل والدائم لـ Claude Code

> **هذا الملف يُقرأ تلقائياً بواسطة Claude Code في كل جلسة.**
> **يحوي كامل مواصفات المشروع، القيود، والقرارات المعمارية المُتفق عليها.**

---

## 📋 معلومات المشروع

| البند | القيمة |
|---|---|
| **اسم المشروع** | `cpanel-drive-archiver` |
| **لغة التطوير** | Google Apps Script (V8 Runtime) |
| **بيئة التشغيل** | Google Workspace + cPanel Server |
| **نوع النشر** | Web App + Time-driven Triggers |
| **إصدار المواصفات** | 2.0.0 (Enhanced) |
| **آخر تحديث** | 2026-01-10 |
| **الحساب المستهدف** | Gmail شخصي (تم التأكيد) |

---

## 🎯 ROLE & EXPERTISE

أنت **مهندس برمجيات أول (Senior Software Engineer)** متخصص في:
- تطوير Google Apps Script (GAS) على Runtime V8 مع خبرة عميقة في قيوده.
- تكامل Google Workspace APIs (Drive, Gmail, Sheets, Properties, Triggers, HTML Service, Cache Service, Lock Service).
- خبرة في بروتوكولات cPanel (UAPI / cPanel REST API / WebDAV / HTTPS PHP Bridge).
- إدارة OAuth 2.0 و Service Accounts و Scopes بمبدأ أقل الامتيازات.
- هندسة أنظمة النسخ الاحتياطي والأرشفة طويلة الأمد (LTA).
- بنى بيانات متقدمة (Bloom Filters, Merkle Trees, Hash Maps).
- كتابة كود نظيف بأسلوب SOLID + JSDoc كامل.
- تصميم واجهات RTL بـ Material Design 3.

---

## 🏛️ ARCHITECTURAL DECISIONS (قرارات معمارية نهائية)

هذه القرارات **متفق عليها ومغلقة** — لا تُغيّرها دون تأكيد صريح:

| القرار | القيمة | السبب |
|---|---|---|
| نظام كشف التكرار | Full Index + Bloom Filter + Hot Cache | أداء + دقة |
| سعة Bloom Filter | 100,000 file capacity | ~1.2 KB ذاكرة |
| Hot Cache Window | 72 ساعة افتراضياً (قابل للتغيير) | تسريع اليوميات |
| Concurrent Eviction Sessions | 1 نشط + طابور حتى 10 | تجنب حدود GAS |
| Companion Desktop App | مؤجل للمرحلة 2 (Hooks جاهزة) | تركيز على Web أولاً |
| ترتيب عرض المجلدات | حسب التاريخ (الأحدث أولاً) | UX أفضل |
| التحقق بعد التنزيل | قابل للتغيير (Manual/Auto) | مرونة |
| حذف من Drive | قابل للتغيير (Manual/Semi/Full) | مرونة + أمان |
| Guardian Mode | مُفعّل افتراضياً | حماية البيانات |
| Language | Arabic UI (Primary) + English (Secondary) | جمهور مستهدف |

---

## 🎯 PROJECT BRIEF

طوّر نظاماً متكاملاً بـ Google Apps Script لأرشفة الملفات من خادم cPanel إلى Google Drive،
مع:
- الحفاظ التام على الهيكل الشجري والتصنيفات.
- كشف تكرار ذكي سريع الأداء (Bloom Filter + Full Index).
- حماية متقدمة من الفقدان (Guardian Mode + Trash Monitoring + Auto-Restore).
- نظام تفريغ (Eviction) انتقائي بالمجلدات مع Job Queue.
- واجهة إعدادات كاملة بـ RTL.
- تقارير وإشعارات شاملة.

---

# 📐 FUNCTIONAL REQUIREMENTS (المتطلبات الوظيفية)

## 1) وحدة الاتصال بـ cPanel (`CpanelConnector.gs`)

### طرق الاتصال المدعومة (قابلة للتبديل من الإعدادات)
- **Option A: cPanel UAPI + API Token** (المفضّل للأمان).
- **Option B: WebDAV** مع Basic Auth.
- **Option C: PHP Bridge Script** مخصّص يُرفع على cPanel (يعرض JSON عبر HTTPS).

### الوظائف الأساسية
- استخدام `UrlFetchApp` مع دعم **Streaming/Chunked Download** للملفات > 50 MB.
- التحقق من **SHA-256 Checksum** بعد التحميل قبل الحذف من المصدر.
- حساب Checksum من الخادم إن أمكن (لتقليل النقل).
- دعم Resume للتنزيلات المقطوعة.
- Rate Limiting لمنع إغراق cPanel.

---

## 2) 🧠 نظام كشف التكرار الذكي (Smart Deduplication System)

### المعمارية: نظام هجين متعدد الطبقات

```
┌──────────────────────────────────────────────────────────┐
│  Layer 1: Bloom Filter (In-Memory) — سرعة فائقة          │
│    ├── سعة: 100,000 file                                 │
│    ├── معدل False Positive: 0.1%                         │
│    └── الاستخدام: فحص أولي فوري                          │
│                                                          │
│  Layer 2: Hot Cache (CacheService) — آخر 72 ساعة        │
│    ├── تخزين: SHA-256 hashes                             │
│    ├── انتهاء: قابل للتغيير من الإعدادات                 │
│    └── الاستخدام: تسريع الأرشفة اليومية                  │
│                                                          │
│  Layer 3: Full Index (Google Sheet) — دائم               │
│    ├── الأعمدة: SHA256, Path, DriveId, ArchivedAt, Status│
│    ├── الحجم المتوقع: ملايين الصفوف                      │
│    └── الاستخدام: التحقق النهائي                          │
│                                                          │
│  Layer 4: Weekly Delta Verification — تحقق دوري          │
│    ├── فحص 5% عشوائياً من الفهرس                         │
│    ├── مقارنة مع Drive الفعلي                            │
│    └── كشف الحذف اليدوي وإرسال تنبيهات                   │
└──────────────────────────────────────────────────────────┘
```

### التدفق التنفيذي (Deduplication Flow)

```
عند فحص ملف جديد من cPanel:

1. احسب SHA-256 (سريع محلياً)
      │
      ▼
2. bloomFilter.mightContain(sha256)?
      │
      ├── ❌ False (100% ملف جديد)
      │      └── أرشف فوراً ✅
      │
      └── ✅ True (قد يكون موجوداً)
             │
             ▼
      3. hotCache.has(sha256)?
             │
             ├── ✅ Yes → SKIPPED_DUPLICATE (فوري)
             │
             └── ❌ No → fullIndex.lookup(sha256)?
                    │
                    ├── ✅ Found + Status=ARCHIVED
                    │      └── تحقق من وجود الملف في Drive:
                    │           ├── موجود → SKIPPED_DUPLICATE
                    │           ├── في Trash → auto-restore
                    │           └── مفقود → re-archive + alert
                    │
                    ├── ✅ Found + Status=EVICTED
                    │      └── لا تُعِد الأرشفة (Tombstone) ⚠️
                    │
                    └── ❌ Not Found → ملف جديد → أرشف
```

### هيكل ورقة Full Index

| العمود | النوع | الوصف |
|---|---|---|
| `RowId` | INT | معرف تسلسلي |
| `SHA256` | STRING(64) | البصمة الرقمية (Primary Key) |
| `FileName` | STRING | اسم الملف |
| `SourcePath` | STRING | المسار الأصلي في cPanel |
| `DrivePath` | STRING | المسار في Drive |
| `DriveFileId` | STRING | معرف الملف في Drive |
| `SizeBytes` | LONG | الحجم بالبايت |
| `MimeType` | STRING | نوع الملف |
| `ArchivedAt` | DATETIME | تاريخ الأرشفة |
| `Status` | ENUM | ARCHIVED / EVICTED / RESTORED / DELETED_MANUAL |
| `EvictedTo` | STRING | وجهة التفريغ (إن وجدت) |
| `EvictionId` | STRING | معرف عملية التفريغ |
| `LastVerifiedAt` | DATETIME | آخر تحقق من الوجود |
| `VersionNumber` | INT | رقم الإصدار (للملفات المعدّلة) |
| `PreviousSHA` | STRING(64) | SHA السابق (للإصدارات) |
| `Notes` | TEXT | ملاحظات إدارية |

### Bloom Filter Implementation

```javascript
// المواصفات التقنية
const BLOOM_FILTER_SPEC = {
  expectedItems: 100000,
  falsePositiveRate: 0.001, // 0.1%
  hashFunctions: 10,
  bitArraySize: 1437758, // ~180 KB
  hashAlgorithm: 'MurmurHash3' // سريع وموزّع
};

// يُخزَّن في PropertiesService كـ Base64
// يُحمَّل عند بدء الجلسة، ويُحفَظ عند انتهائها
```

---

## 3) 🛡️ Guardian Mode (وضع الحارس)

نظام حماية متعدد الطبقات ضد فقدان البيانات:

### الميزات
- ✅ **Delayed Deletion:** انتظار قابل للتخصيص (افتراضي 72 ساعة) قبل حذف الملف من cPanel.
- ✅ **Trash Monitoring:** Trigger يومي يفحص Drive Trash ويكشف الحذف اليدوي.
- ✅ **Auto-Restore:** استعادة تلقائية من Trash إن اكتُشف حذف يدوي لملف في الفهرس.
- ✅ **Delete Lock:** ضبط صلاحيات Drive لجعل مجلد الأرشيف "View Only" لغير المسؤول.
- ✅ **Audit Trail:** سجل تدقيق لكل عمليات الحذف والاستعادة.
- ✅ **Emergency Freeze:** إمكانية تجميد كل العمليات فوراً من الواجهة.

### إعدادات Guardian Mode

```javascript
{
  "GUARDIAN_MODE_ENABLED": true,
  "DELETE_CONFIRMATION_HOURS": 72,        // انتظار قبل حذف من cPanel
  "TRASH_MONITORING_ENABLED": true,
  "TRASH_CHECK_FREQUENCY_HOURS": 24,
  "AUTO_RESTORE_FROM_TRASH": true,
  "ALERT_ON_MANUAL_DELETE": true,
  "DELETE_LOCK_ENABLED": false,           // خيار متقدم
  "EMERGENCY_FREEZE": false,              // مفتاح إيقاف طارئ
  "GEOGRAPHIC_BACKUP": false              // نسخة ثانية (اختياري)
}
```

### سجل التدقيق (Audit Log Sheet)

| Timestamp | Event | File | Actor | Details | Action Taken |
|---|---|---|---|---|---|
| 2026-01-10 | MANUAL_DELETE | report.pdf | user@moe.om | Deleted from Drive | AUTO_RESTORED |
| 2026-01-10 | TRASH_FOUND | archive.zip | System | Found in Trash | RESTORED |
| 2026-01-10 | EVICTION_START | /2025/Q1 | admin@moe.om | Requested eviction | QUEUED |

---

## 4) 🗂️ نظام Vault Migration (تفريغ الأرشيف)

### شجرة المجلدات التفاعلية (Interactive Folder Tree)

**الوظائف:**
- 📊 عرض حجم كل مجلد وعدد الملفات (من الفهرس، ليس Drive → فوري).
- 🎨 تلوين حسب الحجم (أخضر < 100MB, أصفر < 1GB, أحمر > 1GB).
- 📅 عرض تاريخ آخر إضافة.
- 🔍 بحث سريع بالاسم/التاريخ/الحجم.
- 📁 Deep Selection (تحديد مجلد يشمل كل ما بداخله).
- ⚡ Lazy Loading للفروع.
- 📊 **الترتيب الافتراضي: حسب التاريخ (الأحدث أولاً)**.

**Quick Selectors:**
```
🎯 التحديد السريع:
   [تحديد الكل]  [إلغاء]  [أقدم من سنة]
   [حجم > 100MB] [لم يُصل له منذ 6 أشهر]
```

### استراتيجيات التنزيل (اختيار تلقائي حسب الحجم)

| حجم المجلد | الاستراتيجية | ملاحظة |
|---|---|---|
| < 100 MB | Single ZIP | تنزيل واحد سريع |
| 100 MB - 2 GB | Single ZIP | Google يدعم حتى 2 GB |
| 2 GB - 10 GB | **Chunked ZIPs** (500MB/جزء افتراضياً) | تجنب فشل التنزيل |
| > 10 GB | **Sequential Files + Manifest** | فردياً |
| > 50 GB | ⚠️ تحذير + Companion App Recommendation (Phase 2) | خارج نطاق GAS |

### وجهات التفريغ (Eviction Destinations)

النظام يدعم **4 وجهات** قابلة للتكوين:

#### 1. Local Download (المتصفح)
```javascript
{
  type: 'LOCAL_DOWNLOAD',
  zipPartSize: 500, // MB
  encryption: 'NONE' | 'ZIP_PASSWORD' | 'AES-256',
  password: null // encrypted in Properties
}
```

#### 2. FTP Server
```javascript
{
  type: 'FTP',
  host: 'backup.example.com',
  port: 21,
  username: '***',
  password: '***', // encrypted
  remotePath: '/archive/',
  passive: true,
  verifyChecksum: true
}
```

#### 3. S3 / Cloud Storage (Amazon S3, Google Cloud Storage, Wasabi, Backblaze B2)
```javascript
{
  type: 'S3_COMPATIBLE',
  endpoint: 's3.amazonaws.com',
  bucket: 'moe-cold-archive',
  accessKeyId: '***',
  secretAccessKey: '***', // encrypted
  region: 'me-south-1',
  storageClass: 'GLACIER' | 'STANDARD' | 'STANDARD_IA'
}
```

#### 4. Metadata Only
```javascript
{
  type: 'METADATA_ONLY',
  generateManifestPDF: true,
  keepIndex: true,
  physicalDelete: false // مجرد Tombstoning
}
```

### 🚦 نظام Job Queue (طابور المهام)

**القاعدة الذهبية:** 1 جلسة نشطة + حتى 10 في الطابور.

```javascript
{
  "queue_config": {
    "maxConcurrent": 1,      // ثابت — لا تُغيّر
    "maxQueued": 10,
    "autoStartNext": true,
    "priority": "FIFO",      // FIFO | LIFO | BY_SIZE | BY_AGE
    "retryFailedJobs": true,
    "maxRetries": 3
  }
}
```

**دورة حياة Job:**
```
QUEUED → SCHEDULED → RUNNING → CHECKPOINT_PAUSED
         (إن طال) ↑                    │
                  └────────────────────┘
                           │
                           ▼
                    ├── COMPLETED ✅
                    ├── FAILED ❌
                    └── CANCELLED ⚠️
```

**بنية Job:**
```javascript
{
  "job_id": "EVIC-2026-001-ABC123",
  "type": "EVICTION",
  "folder_path": "/Archive/2025/Q1/",
  "destination": { /* eviction destination config */ },
  "strategy": "CHUNKED_ZIPS",
  "priority": 1,
  "status": "RUNNING",
  "created_at": "2026-01-10T14:00:00Z",
  "started_at": "2026-01-10T14:05:00Z",
  "checkpoint": {
    "last_processed_file_id": "1abc...xyz",
    "resumable_from_index": 188,
    "current_zip_part": 2
  },
  "progress": {
    "total_files": 423,
    "processed": 187,
    "failed": 2,
    "current_batch": 5
  },
  "artifacts": [
    { "part": 1, "url": "https://...", "size_mb": 500, "sha": "...", "status": "READY" },
    { "part": 2, "url": null, "status": "PROCESSING" }
  ],
  "verification": {
    "mode": "MANUAL",
    "verified_parts": [1],
    "pending_parts": [2]
  }
}
```

### 📄 نظام Manifest المتقدم

كل عملية تفريغ تُنتج ملف `MANIFEST.json` شامل:

```json
{
  "manifest_version": "2.0",
  "eviction_id": "EVIC-2026-001",
  "eviction_date": "2026-01-10T14:30:00Z",
  "system_version": "cpanel-archiver@1.0.0",
  "source": {
    "folder_path": "/Archive/2025/Q1/",
    "drive_folder_id": "1abc...xyz",
    "total_files": 423,
    "total_size_bytes": 1610612736
  },
  "destination": {
    "type": "LOCAL_DOWNLOAD",
    "user_verified_path": "E:\\MOE-Backup\\2025-Q1\\",
    "verified_by_sha": true,
    "verification_mode": "MANUAL"
  },
  "parts": [
    {
      "part_number": 1,
      "filename": "EVIC-2026-001-Part-01-of-03.zip",
      "size_bytes": 524288000,
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "files_count": 145,
      "downloaded_at": "2026-01-10T14:45:00Z",
      "verified": true,
      "verified_by": "engineering.affairs.moe@gmail.com"
    }
  ],
  "files_index": [
    {
      "original_path": "/Archive/2025/Q1/report-001.pdf",
      "size_bytes": 2048000,
      "sha256": "d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35",
      "in_part": 1,
      "path_in_zip": "2025-Q1/reports/report-001.pdf",
      "mime_type": "application/pdf"
    }
  ],
  "restoration": {
    "guide_url": "https://github.com/.../RESTORE.md",
    "restore_command": "clasp run restoreFromManifest --params '{\"manifestPath\":\"...\"}'"
  },
  "integrity": {
    "manifest_hash": "sha256:...",
    "signed_by": "cpanel-archiver-system",
    "generation_timestamp": "2026-01-10T14:30:00Z"
  }
}
```

### 🔐 Post-Download Verification (Configurable)

**الأوضاع المتاحة:**

```javascript
{
  "verification_mode": "MANUAL", // MANUAL | AUTO_TIMED | HYBRID
  
  "manual_settings": {
    "require_sha_input": true,
    "or_confirmation_button": true,
    "timeout_hours": 168 // أسبوع
  },
  
  "auto_timed_settings": {
    "wait_hours_before_verify": 24,
    "assume_success_after_hours": 48
  },
  
  "hybrid_settings": {
    "prompt_first": true,
    "auto_confirm_after_hours": 72,
    "escalation_email": true
  }
}
```

### 🗑️ Delete from Drive (Configurable)

**الأوضاع المتاحة:**

```javascript
{
  "delete_mode": "SEMI_AUTO", // MANUAL | SEMI_AUTO | FULL_AUTO
  
  "manual_settings": {
    // المستخدم يضغط "احذف الآن" بعد التحقق
    "require_double_confirmation": true
  },
  
  "semi_auto_settings": {
    // احذف بعد التحقق فقط
    "delete_after_verification": true,
    "wait_hours_after_verify": 0
  },
  
  "full_auto_settings": {
    "delete_immediately_after_download": true,
    "grace_period_hours": 24, // للاستعادة الطارئة
    "keep_in_trash_days": 30
  }
}
```

### 🔍 وضع المعاينة (Preview Mode)

قبل تنفيذ أي تفريغ، عرض:

```
┌──────────────────────────────────────────────────────────┐
│  🔍 Eviction Preview                                     │
│                                                          │
│  📁 Selected: /Archive/2025/Q1/                         │
│  📊 Statistics:                                          │
│     • Total files: 423                                   │
│     • Total size: 1.5 GB                                 │
│     • Estimated time: ~15 minutes                        │
│     • Number of ZIP parts: 3 (500 MB each)              │
│                                                          │
│  📋 File Types Breakdown:                                │
│     • .pdf → 187 files (890 MB)                         │
│     • .docx → 134 files (420 MB)                        │
│     • .xlsx → 78 files (180 MB)                         │
│     • Others → 24 files (10 MB)                         │
│                                                          │
│  ⚠️ Warnings:                                            │
│     • 3 files exceed 100 MB (Direct download only)      │
│     • 12 files have duplicate SHA (safe to skip)        │
│                                                          │
│  🎯 Impact:                                              │
│     • Drive space freed: 1.5 GB (12% of quota)          │
│     • Files marked as: EVICTED_TO_LOCAL                  │
│     • Re-archiving prevention: ✅ Enabled                │
│                                                          │
│  [❌ Cancel]  [✏️ Modify]  [▶ Start Eviction]           │
└──────────────────────────────────────────────────────────┘
```

### 📊 لوحة الجلسات النشطة (Active Sessions Dashboard)

```
📊 Active Eviction Sessions

┌────────────────────────────────────────────────────────────┐
│ 🟢 EVIC-2026-001 | 2025/Q1/ | 44% (187/423)               │
│    Part 1 [✅ Ready]    Part 2 [✅ Ready]                  │
│    Part 3 [⏳ 68%]      Part 4 [⏸ Queued]                 │
│    [📥 Download Ready]  [⏸ Pause]  [❌ Cancel]              │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│ 🟡 EVIC-2026-002 | 2025/Q2/ | Queued (#1)                  │
│    ⏰ Waiting in queue                                      │
│    [🔼 Priority] [❌ Remove from queue]                     │
└────────────────────────────────────────────────────────────┘
```

### 📚 Local Storage Bookmarks

```
📚 My Local Storage Locations:

📁 Primary Backup
   📍 E:\MOE-Backup\
   💾 Available: 450 GB
   📊 Used by archive: 12.4 GB
   [Test Connection] [Change]

📁 External Drive
   📍 Not connected (Last seen: 2025-12-15)
   ⚠️ Contains: EVIC-2025-047 through EVIC-2025-051
```

---

## 5) 🎨 واجهة الإعدادات (Settings UI)

بنية على `HtmlService` (Web App) بـ Material Design 3 مع دعم RTL كامل.

### التبويبات الرئيسية

```
[⚙️ عام] [🔗 cPanel] [📁 Drive] [🧠 التكرار] [🛡️ Guardian] [🗂️ التفريغ] [📅 الجدولة] [📧 الإشعارات] [📊 التقارير] [🔧 متقدم]
```

### حقول الإعدادات

#### تبويب "عام"
| الحقل | النوع | الافتراضي |
|---|---|---|
| `LANGUAGE` | Dropdown (AR/EN) | AR |
| `ARCHIVE_STATUS_DISPLAY` | Read-only | نشط |
| `EMERGENCY_FREEZE` | Toggle | OFF |
| `TIMEZONE` | Dropdown | Asia/Muscat |

#### تبويب "cPanel"
| الحقل | النوع | ملاحظات |
|---|---|---|
| `CPANEL_CONNECTION_METHOD` | Dropdown (UAPI/WebDAV/PHP_BRIDGE) | UAPI |
| `CPANEL_HOST` | Text | مع تحقق فوري |
| `CPANEL_USERNAME` | Text | — |
| `CPANEL_API_TOKEN` | Password (مشفّر AES) | لا يُخزَّن كنص |
| `CPANEL_SOURCE_PATH` | Text + Browse | جذر المصدر |
| `FILE_TYPE_FILTER` | Multi-select | امتدادات مسموحة |
| `BANDWIDTH_LIMIT_MB` | Number | حدّ الاستهلاك |
| `[Test Connection]` | Button | — |

#### تبويب "Drive"
| الحقل | النوع | الافتراضي |
|---|---|---|
| `ROOT_DRIVE_FOLDER_ID` | Text + Folder Picker | — |
| `PRESERVE_DIRECTORY_STRUCTURE` | Toggle | ON |
| `GCP_API_KEY` | Password (اختياري) | — |

#### تبويب "التكرار"
| الحقل | النوع | الافتراضي |
|---|---|---|
| `DEDUP_METHOD` | Dropdown | HYBRID (Bloom+Cache+Index) |
| `HOT_CACHE_HOURS` | Number | 72 |
| `BLOOM_FILTER_CAPACITY` | Number | 100,000 |
| `WEEKLY_DELTA_VERIFICATION` | Toggle | ON |
| `DELTA_SAMPLE_PERCENTAGE` | Number | 5 |
| `[Rebuild Index]` | Button | — |
| `[Reset Bloom Filter]` | Button | — |

#### تبويب "Guardian"
| الحقل | النوع | الافتراضي |
|---|---|---|
| `GUARDIAN_MODE_ENABLED` | Toggle | ON |
| `DELETE_CONFIRMATION_HOURS` | Number | 72 |
| `TRASH_MONITORING_ENABLED` | Toggle | ON |
| `TRASH_CHECK_FREQUENCY_HOURS` | Number | 24 |
| `AUTO_RESTORE_FROM_TRASH` | Toggle | ON |
| `ALERT_ON_MANUAL_DELETE` | Toggle | ON |
| `DELETE_LOCK_ENABLED` | Toggle | OFF (متقدم) |
| `GEOGRAPHIC_BACKUP_ENABLED` | Toggle | OFF |
| `GEOGRAPHIC_BACKUP_FOLDER_ID` | Text | — |

#### تبويب "التفريغ" (Eviction)
| الحقل | النوع | الافتراضي |
|---|---|---|
| `VERIFICATION_MODE` | Dropdown (MANUAL/AUTO_TIMED/HYBRID) | MANUAL |
| `AUTO_VERIFY_AFTER_HOURS` | Number | 24 |
| `DELETE_MODE` | Dropdown (MANUAL/SEMI_AUTO/FULL_AUTO) | MANUAL |
| `AUTO_DELETE_GRACE_HOURS` | Number | 24 |
| `DEFAULT_ZIP_PART_SIZE_MB` | Number | 500 |
| `MAX_QUEUED_JOBS` | Number | 10 |
| `DEFAULT_ENCRYPTION` | Dropdown | NONE |
| `DEFAULT_FOLDER_SORT` | Dropdown | BY_DATE_DESC |
| `[Manage Local Bookmarks]` | Button | — |
| `[Configure FTP]` | Button | — |
| `[Configure S3]` | Button | — |

#### تبويب "الجدولة"
| الحقل | النوع | الافتراضي |
|---|---|---|
| `SCHEDULE_FREQUENCY` | Dropdown (كل ساعة/يومي/أسبوعي/Cron) | يومي |
| `SCHEDULE_TIME` | Time Picker | 02:00 |
| `MAX_RETRIES` | Number (1-10) | 3 |
| `RETRY_BACKOFF_STRATEGY` | Dropdown | EXPONENTIAL |
| `CIRCUIT_BREAKER_THRESHOLD` | Number | 20 |
| `EXECUTION_TIMEOUT_MINUTES` | Number | 25 |

#### تبويب "الإشعارات"
| الحقل | النوع | الافتراضي |
|---|---|---|
| `NOTIFICATION_EMAIL` | Email | — |
| `DAILY_REPORT_ENABLED` | Toggle | ON |
| `DAILY_REPORT_TIME` | Time Picker | 08:00 |
| `WEEKLY_REPORT_ENABLED` | Toggle | ON |
| `ALERT_ON_FAILURE` | Toggle | ON |
| `ALERT_THRESHOLD_FAILED_FILES` | Number | 5 |
| `SEND_PUSH_NOTIFICATIONS` | Toggle | OFF |

#### تبويب "التقارير"
- عرض إحصائيات مباشرة.
- روابط لأوراق Sheets: Archive Log, Eviction Log, Audit Log, Failed Queue.
- زر تصدير PDF.

#### تبويب "متقدم"
- Endpoint API للـ Companion Desktop App (Phase 2).
- Cache management.
- Debug logs.
- Data export/import.
- **Factory reset**.

### التخزين الآمن
- استخدام `PropertiesService.getScriptProperties()` للإعدادات.
- **تشفير AES-256** لكلمات المرور والـ API Tokens قبل التخزين.
- **لا** تخزين كلمات المرور كنص صريح **أبداً**.
- Master Key مشتقّ من Script ID + user email.

### دعم RTL
- استخدام `dir="rtl"` على كامل الصفحة.
- خط `Cairo` أو `Tajawal` للعربية.
- Layout يعكس تلقائياً في RTL.
- التبديل الفوري بين اللغتين دون تحميل الصفحة.

---

## 6) ⏰ الجدولة والتشغيل (`Scheduler.gs`)

- استخدام `ScriptApp.newTrigger()` ديناميكياً.
- حذف Triggers القديمة عند تحديث الجدولة.
- **Lock Service** (`LockService.getScriptLock()`) لمنع التوازي.
- **Execution Time Awareness:**
  - تقسيم العمل على دفعات (Batching).
  - Checkpoint في `PropertiesService` كل 100 ملف.
  - استئناف تلقائي عند تجاوز الحد الزمني.

### Triggers المطلوبة
| Trigger | التكرار | الوظيفة |
|---|---|---|
| `mainArchiveJob` | حسب الإعدادات | الأرشفة الرئيسية |
| `trashMonitor` | يومي | مراقبة Drive Trash |
| `weeklyDeltaCheck` | أسبوعي | Delta Verification |
| `dailyReportSender` | يومي | إرسال التقارير |
| `queueProcessor` | كل 5 دقائق | معالجة Job Queue |
| `retryFailedArchives` | كل 6 ساعات | إعادة المحاولة |
| `cleanupOldLogs` | شهري | تنظيف السجلات القديمة |

---

## 7) 📊 نظام السجلات والتقارير (`Logger.gs`)

### الأوراق التلقائية في Sheet المصاحبة

| الورقة | الأعمدة | الغرض |
|---|---|---|
| `ArchiveLog` | Timestamp, FileName, SourcePath, DrivePath, SizeBytes, SHA256, Status, DurationMs, ErrorMessage, RetryCount, ActionTaken | سجل الأرشفة |
| `FullIndex` | (كما في القسم 2) | الفهرس الرئيسي |
| `EvictionLog` | EvictionId, StartAt, EndAt, Folder, Destination, FilesCount, SizeBytes, Status, ManifestUrl | سجل التفريغ |
| `AuditLog` | Timestamp, Event, File, Actor, Details, ActionTaken | التدقيق الأمني |
| `FailedQueue` | Timestamp, File, Error, RetryCount, NextRetryAt, Status | فشل يحتاج تدخل |
| `Settings` | Key, Value, LastModified, ModifiedBy | نسخة مقروءة من Properties |
| `Stats` | Date, TotalFiles, TotalSize, Archived, Skipped, Failed | إحصائيات يومية |

### حالات (Status enum)
```
SUCCESS
SKIPPED_DUPLICATE
VERSIONED
FAILED
PENDING_MANUAL
CHECKSUM_MISMATCH
EVICTED_TO_LOCAL
EVICTED_TO_FTP
EVICTED_TO_S3
RESTORED_FROM_TRASH
QUARANTINED
```

### Cloud Logging
- استخدام `console.log` بالتوازي مع `Logger.log` للتكامل مع Stackdriver.

---

## 8) 📧 نظام الإشعارات (`Notifier.gs`)

### أنواع الإشعارات

#### 1. تقرير يومي (Daily Digest)
- HTML أنيق RTL.
- إجمالي الملفات، الناجحة، الفاشلة، المتكررة.
- الحجم المؤرشف.
- الوقت المستغرق.
- الملفات التي تحتاج تدخل يدوي مع روابط.
- إحصائيات Job Queue.
- تحذيرات Drive Storage.

#### 2. تنبيه فوري (Real-time Alert)
- عند فشل > X ملف.
- انقطاع cPanel.
- كشف حذف يدوي.
- امتلاء Drive.
- فشل Job في الطابور.

#### 3. تقرير أسبوعي
- اتجاهات وإحصائيات.
- أعلى المجلدات حجماً.
- التوقعات.
- ملخص التفريغات.

#### 4. تنبيهات Guardian
- كشف حذف يدوي → تنبيه فوري.
- Auto-restore ناجح → تأكيد.
- Auto-restore فاشل → طوارئ.

#### 5. تحديثات Eviction
- بدء Job.
- اكتمال جزء (Part).
- طلب تحقق يدوي.
- اكتمال Job كامل.
- Job فاشل.

### قنوات الإشعارات
- **Email:** `MailApp.sendEmail()` أو `GmailApp` (HTML + RTL).
- **Web Push:** عبر Service Worker (اختياري).
- **WhatsApp:** بديل متقدم عبر webhook (اختياري).

---

## 9) 🔒 الأمان والصلاحيات

### Scopes في `appsscript.json`

```json
{
  "timeZone": "Asia/Muscat",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.scriptapp",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/script.container.ui",
    "https://www.googleapis.com/auth/script.storage",
    "https://www.googleapis.com/auth/userinfo.email"
  ],
  "webapp": {
    "access": "MYSELF",
    "executeAs": "USER_DEPLOYING"
  }
}
```

### قواعد الأمان
- لا كلمات مرور في الكود.
- تشفير AES-256 لكل البيانات الحساسة في Properties.
- CSRF Token في كل نموذج Web.
- التحقق من هوية المستخدم في `doGet`/`doPost`.
- Rate Limiting على الـ API endpoints.
- Sanitization لكل المدخلات.

---

## 10) 🔄 الموثوقية وتجاوز الأخطاء

### أنماط الاستقرار
- **Exponential Backoff:** ابدأ 1 ثانية، ضاعف حتى 60 ثانية، حد أقصى `MAX_RETRIES`.
- **Circuit Breaker:** بعد 20 فشل متتالي → أوقف الجلسة + تنبيه.
- **Bulkhead:** عزل الأخطاء — فشل ملف واحد لا يوقف الباقي.
- **Retry Queue:** طابور خاص للفاشلين قابل للتشغيل يدوياً.
- **Graceful Degradation:** استمرار العمل رغم فشل بعض المكونات.

---

# 🏗️ HOOKS للـ COMPANION DESKTOP APP (المرحلة 2)

جهّز التصميم الحالي للربط المستقبلي دون إعادة كتابة:

## Endpoint API
```javascript
// Web App يقبل POST من Desktop App
function doPost(e) {
  // 1. Verify API Key from header
  // 2. Route to correct handler
  // 3. Return JSON response
}

// Endpoints المطلوبة:
// POST /api/v1/eviction/create
// GET  /api/v1/eviction/status/{jobId}
// POST /api/v1/eviction/verify
// GET  /api/v1/index/lookup?sha=...
// POST /api/v1/notification/register
```

## Authentication System
- إنشاء API Keys منفصلة للـ Desktop App.
- تخزين في Sheet خاصة `ApiKeys` (مشفّرة).
- Revocation فوري من الواجهة.

## Manifest Format
- موحّد وقابل للقراءة من Desktop App.
- Schema versioning للتوافق المستقبلي.

---

# 📁 هيكل المشروع (File Structure)

```
cpanel-drive-archiver/
├── .clasp.json                    # (git-ignored)
├── .claspignore
├── .gitignore
├── appsscript.json                # Manifest
├── CLAUDE.md                      # هذا الملف
├── README.md
├── CHANGELOG.md
├── ARCHITECTURE.md                # Diagrams
├── src/
│   ├── Main.js                    # Entry point + doGet/doPost
│   ├── Config.js                  # الإعدادات الافتراضية
│   ├── Utils.js                   # دوال مساعدة
│   ├── Crypto.js                  # التشفير AES + SHA
│   │
│   ├── cpanel/
│   │   ├── CpanelConnector.js
│   │   ├── CpanelUAPI.js
│   │   ├── CpanelWebDAV.js
│   │   └── CpanelPHPBridge.js
│   │
│   ├── drive/
│   │   ├── DriveArchiver.js
│   │   ├── DriveHelper.js
│   │   └── TrashMonitor.js
│   │
│   ├── dedup/
│   │   ├── BloomFilter.js
│   │   ├── HotCache.js
│   │   ├── FullIndex.js
│   │   ├── Deduplicator.js
│   │   └── DeltaVerifier.js
│   │
│   ├── guardian/
│   │   ├── GuardianMode.js
│   │   ├── AutoRestore.js
│   │   └── EmergencyFreeze.js
│   │
│   ├── eviction/
│   │   ├── EvictionEngine.js
│   │   ├── JobQueue.js
│   │   ├── FolderTree.js
│   │   ├── ManifestGenerator.js
│   │   ├── destinations/
│   │   │   ├── LocalDownload.js
│   │   │   ├── FTPClient.js
│   │   │   ├── S3Client.js
│   │   │   └── MetadataOnly.js
│   │   └── strategies/
│   │       ├── SingleZip.js
│   │       ├── ChunkedZips.js
│   │       └── SequentialFiles.js
│   │
│   ├── scheduler/
│   │   ├── Scheduler.js
│   │   ├── TriggerManager.js
│   │   └── CheckpointManager.js
│   │
│   ├── logger/
│   │   ├── Logger.js
│   │   ├── AuditLog.js
│   │   └── ReportGenerator.js
│   │
│   ├── notifier/
│   │   ├── Notifier.js
│   │   ├── EmailNotifier.js
│   │   └── templates/
│   │       ├── daily-digest.html
│   │       ├── alert.html
│   │       └── eviction-status.html
│   │
│   └── api/
│       ├── ApiRouter.js
│       └── ApiAuth.js
│
├── ui/
│   ├── index.html                 # صفحة الإعدادات الرئيسية
│   ├── dashboard.html             # لوحة التحكم
│   ├── folder-explorer.html       # مستكشف مجلدات التفريغ
│   ├── job-queue.html             # لوحة الطابور
│   ├── styles/
│   │   ├── main.css
│   │   ├── rtl.css
│   │   └── themes.css
│   ├── scripts/
│   │   ├── app.js
│   │   ├── folder-tree.js
│   │   └── job-monitor.js
│   └── i18n/
│       ├── ar.json
│       └── en.json
│
├── tests/
│   ├── Tests.js                   # Entry point للاختبارات
│   ├── unit/
│   │   ├── BloomFilter.test.js
│   │   ├── Deduplicator.test.js
│   │   └── ManifestGenerator.test.js
│   └── integration/
│       ├── ArchiveFlow.test.js
│       └── EvictionFlow.test.js
│
├── docs/
│   ├── DEPLOYMENT.md
│   ├── CPANEL_SETUP.md
│   ├── PHP_BRIDGE.php             # سكربت PHP جاهز للرفع
│   ├── TROUBLESHOOTING.md
│   ├── API_REFERENCE.md
│   └── SECURITY.md
│
└── .github/
    └── workflows/
        └── deploy.yml             # CI/CD تلقائي
```

---

# 🎯 CODING STANDARDS

## القواعد الصارمة

### JavaScript
- `const` و `let` فقط (لا `var`).
- `async/await` عند دعم V8.
- Arrow functions للـ callbacks.
- Destructuring حيث يناسب.
- Template literals بدلاً من concatenation.
- **Strict mode:** `'use strict';` في كل ملف.

### Naming
- Variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Functions: `camelCase`
- Classes: `PascalCase`
- Private members: `_prefixed`
- Files: `PascalCase.js` للـ classes, `camelCase.js` لغيرها

### التنسيق
- Max line length: 100 chars
- Indentation: 2 spaces
- Trailing commas في objects/arrays متعددة الأسطر

### التوثيق
- **JSDoc كامل** لكل دالة عامة:
```javascript
/**
 * وصف الدالة بالعربية أو الإنجليزية
 * @param {Type} paramName - وصف
 * @returns {Type} وصف
 * @throws {Error} متى ولماذا
 * @example
 * example usage
 */
```
- تعليقات بالعربية على المنطق الحرج.
- تعليقات بالإنجليزية على JSDoc.

### معالجة الأخطاء
- **دائماً** `try/catch` — لا Promises معلقة.
- تسجيل مفصّل مع Stack Trace.
- Errors مخصصة (`CustomError extends Error`).
- Fail-safe defaults.

### الأمان
- Sanitize كل input.
- Validate types.
- Escape HTML في القوالب.
- لا `eval()` إطلاقاً.

---

# 🚀 EXECUTION PLAN (خطة التنفيذ الإلزامية)

**اتبع هذه المراحل بالترتيب. لا تنتقل لأي مرحلة دون موافقة صريحة مني.**

## المرحلة 1: التحليل والتصميم (Analysis & Design)
- [ ] قراءة كامل `CLAUDE.md`.
- [ ] إنشاء Architecture Diagram في `ARCHITECTURE.md` (Mermaid).
- [ ] Data flow diagram.
- [ ] Sequence diagrams للعمليات الحرجة.
- [ ] اقتراح Schema لـ Sheets.
- **⏸️ توقف واطلب مراجعتي قبل الانتقال.**

## المرحلة 2: البنية الأساسية (Foundation)
- [ ] `appsscript.json` مع Scopes.
- [ ] `Config.js` بالإعدادات الافتراضية.
- [ ] `Utils.js` (helpers, validators, formatters).
- [ ] `Crypto.js` (AES-256, SHA-256, MurmurHash3).
- [ ] Unit tests للـ Utils و Crypto.
- **⏸️ توقف واطلب مراجعتي.**

## المرحلة 3: طبقة الاتصال (Connectivity)
- [ ] `CpanelConnector.js` مع 3 طرق.
- [ ] Test connection functions.
- [ ] `PHP_BRIDGE.php` للـ Option C.
- [ ] `DriveHelper.js` (create folders, upload, verify).
- **⏸️ توقف واطلب مراجعتي.**

## المرحلة 4: نظام كشف التكرار (Deduplication)
- [ ] `BloomFilter.js` مع MurmurHash3.
- [ ] `HotCache.js` عبر CacheService.
- [ ] `FullIndex.js` عبر Sheet.
- [ ] `Deduplicator.js` (الأورشستريتور).
- [ ] `DeltaVerifier.js` (الفحص الأسبوعي).
- [ ] Unit tests شاملة.
- **⏸️ توقف واطلب مراجعتي.**

## المرحلة 5: نظام الحماية (Guardian)
- [ ] `GuardianMode.js`.
- [ ] `TrashMonitor.js`.
- [ ] `AutoRestore.js`.
- [ ] `EmergencyFreeze.js`.
- [ ] Audit logging.
- **⏸️ توقف واطلب مراجعتي.**

## المرحلة 6: محرك الأرشفة (Archive Engine)
- [ ] `DriveArchiver.js` (المنطق الرئيسي).
- [ ] Batching + Checkpointing.
- [ ] Retry with exponential backoff.
- [ ] Circuit breaker.
- [ ] Integration مع Deduplicator + Guardian.
- **⏸️ توقف واطلب مراجعتي.**

## المرحلة 7: نظام التفريغ (Eviction)
- [ ] `FolderTree.js` (شجرة تفاعلية).
- [ ] `JobQueue.js` (1 نشط + 10 طابور).
- [ ] `EvictionEngine.js`.
- [ ] Strategies (SingleZip, ChunkedZips, SequentialFiles).
- [ ] Destinations (Local, FTP, S3, MetadataOnly).
- [ ] `ManifestGenerator.js`.
- [ ] Verification workflows.
- **⏸️ توقف واطلب مراجعتي.**

## المرحلة 8: الجدولة والتقارير
- [ ] `Scheduler.js` مع Triggers ديناميكية.
- [ ] `Logger.js` + Sheets.
- [ ] `ReportGenerator.js`.
- [ ] `Notifier.js` مع HTML templates RTL.
- **⏸️ توقف واطلب مراجعتي.**

## المرحلة 9: الواجهات (UI)
- [ ] Layout رئيسي RTL بـ Material Design 3.
- [ ] صفحة الإعدادات (كل التبويبات).
- [ ] Dashboard مع إحصائيات.
- [ ] Folder Explorer للتفريغ.
- [ ] Job Queue Monitor.
- [ ] i18n (AR/EN).
- **⏸️ توقف واطلب مراجعتي.**

## المرحلة 10: API + Companion Hooks
- [ ] `ApiRouter.js`.
- [ ] `ApiAuth.js` مع API Keys.
- [ ] Documentation في `API_REFERENCE.md`.
- **⏸️ توقف واطلب مراجعتي.**

## المرحلة 11: الاختبارات والتوثيق
- [ ] Feature tests شاملة.
- [ ] Integration tests.
- [ ] `README.md` كامل.
- [ ] `DEPLOYMENT.md`.
- [ ] `TROUBLESHOOTING.md`.
- [ ] `CHANGELOG.md`.
- **⏸️ تسليم نهائي.**

---

# ❓ ASK BEFORE STARTING

قبل البدء بالمرحلة 1، تحقق من هذه النقاط معي:

1. **طريقة اتصال cPanel المفضّلة:** UAPI / WebDAV / PHP Bridge؟
2. **أقصى حجم ملف متوقع** في cPanel المصدر؟
3. **حجم Drive المتاح** حالياً؟
4. **عدد الملفات التقريبي** في المصدر؟
5. **هل هناك أنواع ملفات محددة** فقط للأرشفة؟ أم كل الملفات؟
6. **جدول الأرشفة المطلوب:** يومي / أسبوعي / حسب طلبي؟

---

# 📋 DELIVERABLES (المخرجات النهائية)

عند إتمام كل المراحل، سلّم:

1. ✅ هيكل مشروع كامل يعمل مع `clasp push`.
2. ✅ كل ملفات الكود بـ JSDoc.
3. ✅ `appsscript.json` صحيح.
4. ✅ `README.md` بدليل مستخدم كامل.
5. ✅ `ARCHITECTURE.md` بـ Mermaid diagrams.
6. ✅ `DEPLOYMENT.md` خطوة بخطوة.
7. ✅ `PHP_BRIDGE.php` جاهز للاستخدام.
8. ✅ `TROUBLESHOOTING.md` مع FAQ.
9. ✅ `CHANGELOG.md`.
10. ✅ Test suite شامل.
11. ✅ `.github/workflows/deploy.yml` للـ CI/CD.

---

# ⚠️ CRITICAL CONSTRAINTS (قيود حرجة)

**لا تتجاوز هذه القيود مهما كان:**

- 🚫 **لا تُخزّن كلمات مرور كنص صريح** — تشفير AES-256 دائماً.
- 🚫 **لا تحذف من cPanel** قبل تأكيد Checksum + انتهاء `DELETE_CONFIRMATION_HOURS`.
- 🚫 **لا تُشغّل أكثر من Eviction Session واحدة** في نفس الوقت.
- 🚫 **لا تتجاوز 25 دقيقة** في جلسة واحدة — استخدم Checkpointing.
- 🚫 **لا تُنشئ Trigger** دون حذف السابق لنفس الوظيفة.
- 🚫 **لا تُعِد أرشفة الملفات ذات Status=EVICTED** (Tombstoning).
- 🚫 **لا تُشارك بيانات حساسة** في السجلات أو الإشعارات.
- 🚫 **لا تفترض** — إن كان هناك غموض، اسأل.

---

# 🎓 BEST PRACTICES REMINDERS

- ✅ Test locally قبل `clasp push`.
- ✅ استخدم `console.log` بغزارة أثناء التطوير.
- ✅ Commit في Git بعد كل مرحلة.
- ✅ فحص الـ Quotas قبل العمليات الكبيرة.
- ✅ Backup للفهرس قبل التعديلات الحرجة.
- ✅ اقرأ الأخطاء بعناية — GAS يعطي رسائل مضللة أحياناً.
- ✅ استخدم `Logger.log` للتفاصيل التقنية، `console.log` للـ Stackdriver.

---

**نهاية `CLAUDE.md`**

*هذا الملف هو المرجع الوحيد والدائم للمشروع. أي تغيير في المتطلبات يجب أن يُحدَّث هنا أولاً.*
