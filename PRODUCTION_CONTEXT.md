# 🚨 PRODUCTION CONTEXT — CRITICAL READ

> هذا الملف له أولوية قصوى فوق كل شيء آخر.
> يجب قراءته قبل CLAUDE.md في كل جلسة.

---

## ⚠️ تحذير حرج — نظام إنتاج حي

هذا ليس مشروعاً تطويرياً — هذا نظام إنتاج حي يخدم وزارة التربية والتعليم بسلطنة عُمان.

### حالة النظام الحقيقية (كما في 2026-07-10)

- الملفات المؤرشفة: 7,880 ملف (بيانات وزارية حقيقية)
- سجلات النشاط: 297,602 سجل (3 أشهر من النشاط)
- تاريخ البدء: 2026-04-17 (v1.0.0)
- آخر نشاط: 2026-07-10 (نظام نشط الآن)
- معدل النشاط اليومي: ~85 ملف/يوم
- حجم Dedup Index: 1.05 MB
- حجم Activity Log: 19.9 MB

### مخاطر فقدان البيانات

عمليات خطرة تكسر النظام إذا نُفّذت بالخطأ:
- forceReset() يمسح 7,880 ملف مرجعي
- حذف Dedup Index Sheet — نفس التأثير الكارثي
- تغيير schema بدون Migration — يكسر السجلات
- Push إلى Apps Script بدون clasp pull أولاً — يفقد آخر تعديلات

---

## معلومات الأصول

### Sheets في Google Drive

1. cPanel Archiver — Dedup Index
   - Tab: dedup
   - Rows: 7,881 (7,880 data + 1 header)
   - Columns: sha256, drive_file_id, drive_path, size, first_seen

2. cPanel Archiver — Activity Log
   - Tab: log
   - Rows: 297,603 (297,602 data + 1 header)
   - Columns: Timestamp, FileName, SourcePath, DrivePath, SizeBytes,
     SHA256, Status, DurationMs, ErrorMessage, RetryCount,
     ActionTaken, SessionId

### النسخ الاحتياطية (2026-07-10)

محلياً في _legacy_backup/:
- Dedup-Index-Backup-2026-07-10.xlsx (1.05 MB)
- Activity-Log-Backup-2026-07-10.xlsx (19.9 MB)

على Google Drive:
- [BACKUP-2026-07-10] cPanel Archiver — Dedup Index
- [BACKUP-2026-07-10] cPanel Archiver — Activity Log

### مشروع Apps Script

- Script ID: 1tp2_LeiO4Xlt_XkyNC7QzLgI2WvbOKwq2AZkw-Uf4r_2S6atx2fD900F
- الاسم في Drive: cPanel G-Drive Archiver
- الوصول: يجب أن يكون MYSELF فقط (حالياً غير محدد — ثغرة أمنية!)

---

## المشاكل التقنية الموثقة

### مشكلة 1 (حرجة): UTF-8 124 bytes limit

الوصف: Google Drive Custom Properties محدودة بـ 124 بايت لكل key+value في UTF-8.
النظام كان يحاول تخزين المسار الكامل هناك، والمسارات العربية تضاعف الحجم.

عينة الخطأ من Activity Log:
HTTP 403: "Properties and app properties are limited to 124 bytes in
UTF-8 encoding, counting both the key and the value."

الحلول المطروحة:
1. تخزين hash قصير للمسار في Custom Properties (SHA-1 12 حرف)
2. تخزين المسار الكامل في description بدل properties
3. تخزين reference إلى الفهرس فقط

Status: الحل مطلوب في المرحلة 1 (High Priority)

### مشكلة 2 (متوسطة): 5 دوال تشخيصية معرضة

- diagFirstFile, testDriveRoot, testDriveApiWrite, forceReset
- موقعها: src/ArchiveOrchestrator.gs سطور 19-123
- الخطر: قابلة للاستدعاء من UI
- الحل: نقل إلى src/diagnostics/ + حماية forceReset() بمعامل تأكيد

### مشكلة 3 (حرجة): appsscript.json ناقص

- timeZone: America/New_York (خطأ - يجب Asia/Muscat)
- لا webapp.access
- لا oauthScopes
- لا webapp.executeAs

التأثير: Web App قد يكون متاحاً لأي مستخدم Google!

---

## قواعد التعامل مع الإنتاج

### قواعد ذهبية

1. قبل أي تعديل: تأكد أن الـ backup موجود ومحدث
2. Migration: يجب أن يكون idempotent (قابل للتكرار بدون ضرر)
3. Testing: استخدم بيانات ملبسة (fake), ليس بيانات الإنتاج
4. Deployment: لا تُنشر تغييرات بدون قناة staging أولاً
5. Emergency Freeze: يجب إمكانية إيقاف النظام فوراً من الواجهة

### قبل أي clasp push

1. clasp pull (لو أحد عدل على الويب)
2. git status
3. clasp push --dry-run (اقرأ ما سيرفع بعناية)
4. clasp push (فعلياً)
5. اختبر الدالة الحرجة في محرر Apps Script

---

## استراتيجية Migration من v1 إلى v2.0

### Schema المطلوب في v2.0 (16 عمود)

RowId | SHA256 | FileName | SourcePath | DrivePath | DriveFileId |
SizeBytes | MimeType | ArchivedAt | Status | EvictedTo | EvictionId |
LastVerifiedAt | VersionNumber | PreviousSHA | Notes

### Mapping من v1 (5 أعمدة) إلى v2.0 (16 عمود)

- RowId: AUTO_INCREMENT (جديد)
- SHA256: sha256 (مباشر)
- FileName: استخراج من drive_path (يحتاج parsing)
- SourcePath: غير موجود في v1! (يحتاج قرار)
- DrivePath: drive_path (مباشر)
- DriveFileId: drive_file_id (مباشر)
- SizeBytes: size (مباشر)
- MimeType: استعلام Drive API (جديد)
- ArchivedAt: first_seen (مباشر)
- Status: افتراضي = ARCHIVED
- EvictedTo, EvictionId, LastVerifiedAt: NULL (جديد)
- VersionNumber: 1 (افتراضي)
- PreviousSHA, Notes: NULL (جديد)

### خطة Migration الآمنة

المرحلة أ - Preparation:
1. أنشئ Sheet جديد "cPanel Archiver — Dedup Index v2"
2. أنشئ tab باسم dedup_v2 بـ 16 عمود
3. اترك v1 كما هو (للتراجع)

المرحلة ب - Dry Run:
1. اكتب Migration Script في src/migration/MigrateV1toV2.gs
2. شغله على أول 100 صف فقط
3. تحقق يدوياً من النتائج

المرحلة ج - Full Migration:
1. Backup إضافي قبل التنفيذ
2. شغل السكربت بـ batching (500 صف كل مرة)
3. سجل التقدم في Sheet مخصص
4. تحقق random sampling (5% من الصفوف)

المرحلة د - Cutover:
1. توقف النظام مؤقتاً
2. تحديث Config ليشير إلى v2
3. اختبار مكثف
4. إعادة تشغيل النظام

المرحلة هـ - Cleanup (بعد أسبوع من الاستقرار):
1. أرشفة v1
2. حذف Migration scripts

---

## أمان البيانات الوزارية

### قواعد نشر GitHub

- لا ترفع أي بيانات فعلية (أسماء مدارس، مسارات، SHA hashes)
- لا ترفع محتوى Sheets أبداً
- لا ترفع screenshots تحوي بيانات حقيقية
- استخدم بيانات ملبسة في الاختبارات والأمثلة
- Anonymize أي عينات في التوثيق

### قواعد سجلات النظام (Logs)

- لا تسجل SHA-256 كاملاً في Cloud Logging (public)
- لا تسجل المسارات الكاملة إن كانت حساسة
- سجل fingerprints مختصرة (أول 8 أحرف من SHA فقط)
- Redact أي معلومات شخصية (PII)

---

## خط الطوارئ

في حالة أي مشكلة حرجة (فقدان بيانات، خطأ كارثي):

1. أوقف النظام فوراً (Emergency Freeze في Config)
2. لا تحاول الإصلاح فوراً — قد تفاقم المشكلة
3. راجع النسخ الاحتياطية:
   - محلياً: _legacy_backup/
   - Google Drive: [BACKUP-*] Sheets
   - Google Drive Trash (30 يوم retention)
4. وثق ما حدث في INCIDENT_LOG.md

---

نهاية PRODUCTION_CONTEXT.md — الآن اقرأ CLAUDE.md