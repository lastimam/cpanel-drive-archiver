<div dir="rtl">

# 🗺️ PHASE_2_PLAN — دليل ترقية Dedup Index من v1 (5 أعمدة) إلى v2 (16 عمود)

> **الغرض:** خطة تنفيذ تفصيلية للمرحلة 2 من roadmap المشروع. مصممة لتُقرأ cold — أي مطوّر (أنت أو جلسة Claude جديدة) يستطيع البدء منها بلا إعادة اكتشاف السياق.
>
> **الوضع الحالي:** v1.1.0 نشرت في 2026-07-11 (Phase 1 hardened). النظام مستقر ومنتج.
> **التاريخ المُقترَح للبدء:** بعد 24-48 ساعة من مراقبة v1.1.0 (≈ 2026-07-13 أو ما بعده).

---

## 📊 الملخص التنفيذي

| السؤال | الإجابة |
|---|---|
| **ما نُهاجر؟** | Google Sheet "cPanel Archiver — Dedup Index" (7,880 صف) |
| **إلى أين؟** | Sheet جديد "cPanel Archiver — Dedup Index v2" بـ 16 عمود مطابق لـ CLAUDE.md § 2 |
| **لماذا؟** | schema الحالي لا يدعم Bloom Filter، Guardian Mode، Eviction Engine (كلها تحتاج حقولاً غير موجودة: Status enum, MimeType, SourcePath, VersionNumber، إلخ) |
| **حجم العمل** | صغير عددياً (7,880 صف = ~5 batches × 2000)، لكن معقد قراريّاً (5 حقول من 16 تحتاج قرارات mapping) |
| **الوقت المتوقع** | جلسة تصميم + جلستان تنفيذ (~4-6 ساعات مع الفحص اليدوي) |
| **الخطر الأكبر** | فقدان بيانات المرجع إن كسر النظام أثناء cutover → تُعاد أرشفة 7,880 ملف من cPanel (يستهلك يوم كامل + bandwidth) |
| **Rollback نظيف؟** | ✅ نعم — v1 Sheet يبقى كما هو حتى تأكيد v2 (نسختان متوازيتان) |

---

## 🗂️ 1. الوضع الحالي (v1 Schema)

الملف: **cPanel Archiver — Dedup Index** · Tab: `dedup` · **7,881 صف** (7,880 data + 1 header)

| # | العمود | النوع | مثال | ملاحظات |
|---|---|---|---|---|
| 1 | `sha256` | STRING(64) | `d4735e3a...` | Primary key فعلي — يستخدمه [Deduplicator.findByHash()](src/dedup/Deduplicator.gs#L44-L47) |
| 2 | `drive_file_id` | STRING | `1abc...xyz` | معرّف Drive |
| 3 | `drive_path` | STRING | `2025/Q1/report.pdf` | المسار داخل Drive (relative) |
| 4 | `size` | LONG | `2048000` | بايتات |
| 5 | `first_seen` | ISO DateTime | `2026-04-17T14:30:00Z` | متى شوهد لأول مرة (وقت الأرشفة الأصلي) |

**Read path:** [src/dedup/Deduplicator.gs:135-153](src/dedup/Deduplicator.gs#L135-L153) — تحمّل الصفوف كاملة في `Map` واحدة.
**Write path:** [src/dedup/Deduplicator.gs:91-108](src/dedup/Deduplicator.gs#L91-L108) — `appendRow` بـ 5 قيم.

---

## 🎯 2. الوضع المستهدف (v2 Schema)

الملف الجديد المُقترَح: **cPanel Archiver — Dedup Index v2** · Tab: `dedup_v2` · حجم متوقع مماثل + قابل للنمو.

| # | العمود | النوع | Nullable | مصدر البيانات |
|---|---|---|---|---|
| 1 | `RowId` | INT (auto) | ❌ | AUTO_INCREMENT عند الإدخال |
| 2 | `SHA256` | STRING(64) | ❌ | نسخة مباشرة من v1.sha256 |
| 3 | `FileName` | STRING | ❌ | استخراج من `drive_path` (آخر segment) |
| 4 | `SourcePath` | STRING | 🟡 | ⚠️ **مفقود من v1** — قرار مطلوب (انظر § 4.1) |
| 5 | `DrivePath` | STRING | ❌ | نسخة مباشرة من v1.drive_path |
| 6 | `DriveFileId` | STRING | ❌ | نسخة مباشرة من v1.drive_file_id |
| 7 | `SizeBytes` | LONG | ❌ | نسخة مباشرة من v1.size |
| 8 | `MimeType` | STRING | 🟡 | ⚠️ **يحتاج Drive API** — قرار مطلوب (§ 4.2) |
| 9 | `ArchivedAt` | ISO DateTime | ❌ | نسخة مباشرة من v1.first_seen |
| 10 | `Status` | ENUM | ❌ | افتراضي `ARCHIVED` لكل صف مُهاجَر |
| 11 | `EvictedTo` | STRING | ✅ | NULL للجميع |
| 12 | `EvictionId` | STRING | ✅ | NULL للجميع |
| 13 | `LastVerifiedAt` | ISO DateTime | ✅ | NULL للجميع (سيُملأ لاحقاً بواسطة DeltaVerifier) |
| 14 | `VersionNumber` | INT | ❌ | `1` للجميع |
| 15 | `PreviousSHA` | STRING(64) | ✅ | NULL للجميع |
| 16 | `Notes` | TEXT | ✅ | NULL للجميع |

**Read path الجديد:** يحتاج طبقة `FullIndex` (سترثها `Deduplicator` كطبقة 3 بعد Bloom + HotCache).
**Write path الجديد:** `appendRow` بـ 16 قيمة (نصفها NULL افتراضياً).

---

## 🧩 3. جدول Mapping الكامل

| v2 Column | مصدر | كيف نُشتقّه | خطر |
|---|---|---|---|
| `RowId` | جديد | index في batch + `getLastRow()` | 🟢 |
| `SHA256` | v1.sha256 | نسخ مباشر | 🟢 |
| `FileName` | v1.drive_path | `path.split('/').pop()` | 🟢 |
| `SourcePath` | ⚠️ | راجع § 4.1 | 🟠 قرار |
| `DrivePath` | v1.drive_path | نسخ مباشر | 🟢 |
| `DriveFileId` | v1.drive_file_id | نسخ مباشر | 🟢 |
| `SizeBytes` | v1.size | `Number()` cast (نصوص للتوثيق) | 🟢 |
| `MimeType` | Drive API | راجع § 4.2 | 🟠 قرار |
| `ArchivedAt` | v1.first_seen | نسخ مباشر (تحقق شكل ISO) | 🟢 |
| `Status` | جديد | ثابت `'ARCHIVED'` | 🟢 |
| `EvictedTo` | جديد | `''` (فارغ) | 🟢 |
| `EvictionId` | جديد | `''` | 🟢 |
| `LastVerifiedAt` | جديد | `''` (يملأه DeltaVerifier مستقبلاً) | 🟢 |
| `VersionNumber` | جديد | `1` | 🟢 |
| `PreviousSHA` | جديد | `''` | 🟢 |
| `Notes` | جديد | `'migrated from v1 at <ts>'` | 🟢 |

**الخلاصة:** 14 حقلاً من 16 لها mappings آمنة. **حقلان يحتاجان قرار: `SourcePath` و `MimeType`.**

---

## ⚖️ 4. قرارات مطلوبة قبل التنفيذ

### 4.1 · `SourcePath` — كيف نسترجعه؟

**الخيار A: اتركها NULL للصفوف القديمة**
- ✅ الأبسط. لا API calls. Migration سريعة.
- ❌ نفقد المسار الأصلي لكل ملف قديم. لا يمكن كشف تكرار عبر cPanel path بعد ذلك (لكن SHA256 يكفي).
- 💰 التكلفة: قدرة تشخيصية أقل عند التحقيق في مشكلة (لا نعرف من أين جاء الملف).

**الخيار B: استخرجها من Activity Log (297,602 سجل)**
- Activity Log له عمود `SourcePath` — لكل صف dedup، نبحث عن أحدث سجل بنفس `SHA256`.
- ✅ استرجاع كامل للبيانات.
- ⚠️ 7,880 lookup × 297,602 صف = مكلف. نحتاج بناء index في الذاكرة أولاً (SHA256 → SourcePath).
- ✅ ممكن في batch واحد بذاكرة GAS.
- 🕒 وقت متوقع: 2-5 دقائق.

**الخيار C: mirror المسار من `drive_path`**
- افتراض أن المسار في Drive يعكس المسار في cPanel (غالباً صحيح إن `PRESERVE_DIRECTORY_STRUCTURE=true`).
- ✅ لا حاجة لـ Activity Log lookup.
- ❌ افتراض قد يكون خاطئاً لبعض الصفوف.

**💡 توصيتي: الخيار B** — استخدام Activity Log كمصدر حقيقة. Migration مرة واحدة، والاستفادة دائمة. نُصنّع خريطة SHA256→SourcePath من Activity Log في بداية Migration script.

### 4.2 · `MimeType` — كيف نحصل عليه؟

**الخيار A: Drive API lookup لكل صف**
- `GET files/{fileId}?fields=mimeType` × 7,880 = ~7,880 API call.
- 💰 quota: 20,000 calls/day → استهلاك 40%.
- 🕒 وقت متوقع: 20-40 دقيقة مع batching (10 files per batch).
- ✅ دقيق 100%.

**الخيار B: استنتج من extension في `drive_path`**
- `.pdf` → `application/pdf`, `.docx` → `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, إلخ.
- خريطة ثابتة في الكود.
- ✅ سريع، بلا API calls.
- ⚠️ لن نعرف mimeType الملفات بدون امتداد (~5% عادةً) أو الأنواع النادرة.

**الخيار C: اتركها NULL وحدّثها lazily**
- Migration سريعة.
- عند أول قراءة/استخدام لصف، نجلب mimeType ونحفظه.
- ✅ يوزّع الحمل زمنياً.
- ⚠️ تعقيد في الكود.

**💡 توصيتي: الخيار B مع C كـ fallback** — استنتج من extension أولاً، والصفوف التي لا نستطيع (بلا امتداد) اتركها NULL ونجلبها lazily. لا API calls في Migration.

---

## 🚨 5. سجل المخاطر (Risk Register)

| # | المخاطرة | احتمال | تأثير | التخفيف |
|---|---|---|---|---|
| R1 | v1 Sheet يُحذف بالخطأ أثناء Migration | 🟢 منخفض | 🔴 كارثي | Migration script لا يفتح v1 sheet بـ `.setValues([[]])` أبداً — read-only. + backup قبل البدء. |
| R2 | v2 Sheet ID لا يُحفظ في Config بعد الإنشاء | 🟡 متوسط | 🟠 عالٍ | كتابة الـ ID مباشرة بعد Sheet creation، مع try/catch وتحقق مزدوج. |
| R3 | Timeout في منتصف batch | 🟠 عالٍ | 🟠 متوسط | Checkpointing كل 500 صف. resume tolerant. |
| R4 | Race condition: Trigger يشغّل الأرشفة أثناء Migration | 🟡 متوسط | 🔴 كارثي (كتابة v1 أثناء قراءتها) | إيقاف Triggers قبل Migration. LockService في الكود. |
| R5 | خطأ في mapping SourcePath يُنتج قيماً خاطئة | 🟡 متوسط | 🟠 متوسط | Dry-run على 100 صف + مراجعة يدوية قبل full run. |
| R6 | Drive API quota exhaustion (إن اخترنا الخيار A لـ MimeType) | 🟡 متوسط | 🟡 منخفض | استخدام الخيار B (بدون API) — يزيل المخاطرة كلياً. |
| R7 | Cutover: نسيان تحديث `DEDUP_SHEET_ID` في Config | 🟠 عالٍ | 🔴 كارثي (النظام يكتب في القديم) | Runbook مع checklist. اختبار cutover على staging property أولاً. |
| R8 | تكرار ملف بين v1 وv2 بعد Migration | 🟢 منخفض | 🟢 منخفض | UNIQUE constraint على SHA256 في migration script. |
| R9 | Data corruption in v1 (صفوف ناقصة/مشوهة) | 🟢 منخفض | 🟡 متوسط | Migration script تسجّل كل صف مُخفق ويكمل. تقرير نهاية. |

---

## 🗺️ 6. خطة التنفيذ الخماسية

### المرحلة A — Preparation (لا كتابة على أي sheet)

**الهدف:** إعداد البنية بلا مساس ببيانات v1.

**الخطوات:**
1. **Backup إضافي** — تصدير `Dedup Index` كـ .xlsx مرة أخرى (احتياط قبل أي شيء).
2. **إنشاء `src/migration/MigrateV1toV2.gs`** يحوي:
   - `createV2Sheet()` — تنشئ Sheet جديد بـ 16 عمود + header + formatting.
   - `buildSourcePathIndex_()` — تقرأ Activity Log، تبني `Map<sha256, SourcePath>`.
   - `guessMimeType_(fileName)` — extension → mimeType.
   - `migrateBatch_(startRow, endRow)` — تنقل batch من v1 إلى v2.
   - `verifyMigration_()` — تقارن counts + عيّنة عشوائية.
3. **Config keys جديدة:**
   - `MIGRATION_STATE` — enum: NOT_STARTED / IN_PROGRESS / DRY_RUN_DONE / COMPLETE
   - `MIGRATION_LAST_ROW` — للـ checkpoint
   - `DEDUP_SHEET_V2_ID` — الـ ID الجديد
   - `DEDUP_SCHEMA_VERSION` — `"v1"` حالياً، `"v2"` بعد cutover
4. **إيقاف الـ Trigger المُجدوَل مؤقتاً:**
   ```javascript
   removeTriggersByHandler_('scheduledArchiveRun');
   ```
5. **UI toggle للـ Emergency Freeze** — يُوقف أي جلسة نشطة فوراً.
6. **Push + Redeploy.**

**⏱️ الوقت:** جلسة تصميم كاملة (2-3 ساعات).
**Rollback:** حذف الملف الجديد + استعادة Triggers.

---

### المرحلة B — Dry Run (100 صف فقط)

**الهدف:** التحقق أن الـ mapping صحيح قبل الـ full batch.

**الخطوات:**
1. **تشغيل `migrateBatch_(2, 101)`** من المحرر (100 صف = 100 batches by design).
2. **فحص يدوي:**
   - افتح `Dedup Index v2` Sheet.
   - راجع 10 صفوف عشوائية:
     - `SHA256` = v1.sha256؟ ✅
     - `FileName` = last segment of drive_path؟ ✅
     - `SourcePath` = من Activity Log؟ ✅
     - `MimeType` = صحيح للـ extension؟ ✅
     - `ArchivedAt` = v1.first_seen بلا تغيير؟ ✅
   - افتح 3 ملفات في Drive عبر `DriveFileId` — تأكد أنها موجودة.
3. **قرار:**
   - ✅ كل شيء صحيح → متابعة إلى المرحلة C.
   - ❌ خطأ في mapping → تصحيح الكود، مسح v2 sheet، إعادة dry run.

**⏱️ الوقت:** ~10 دقائق تنفيذ + 15 دقيقة مراجعة.
**Rollback:** حذف الـ 100 صف من v2 (أو حذف الـ Sheet كاملاً).

---

### المرحلة C — Full Batch Migration

**الهدف:** نقل الـ 7,880 صف بالكامل.

**الخطوات:**
1. **مسح v2 من dry-run** — نبدأ من صفر بعد التصحيح.
2. **تشغيل `migrateAll_()`** — يحلق على كامل v1 بـ batches 500 صف:
   ```
   Row 2..501    → batch 1
   Row 502..1001 → batch 2
   ...
   ```
3. **Checkpointing** — بعد كل batch:
   - `MIGRATION_LAST_ROW` = آخر صف مُهاجَر.
   - إن كان `TimeBudget.isExhausted()` → save + throw → يُستأنف من `MIGRATION_LAST_ROW` عبر resume trigger.
4. **Progress log** في sheet منفصل `MigrationLog`:
   - Batch #, StartRow, EndRow, RowsMigrated, DurationMs, ErrorMessage.

**⏱️ الوقت:** 5-10 دقائق (بلا API calls) أو 40-60 دقيقة (مع Drive API إن اخترت الخيار A).
**Rollback:** حذف v2 sheet، إعادة الـ Config keys، إعادة تشغيل Triggers.

---

### المرحلة D — Verification

**الهدف:** يقين أن v2 مطابق فعلياً لـ v1.

**الخطوات:**
1. **Count check:** `v2.getLastRow() - 1 === v1.getLastRow() - 1 === 7880`.
2. **Random sample check:** 100 صف عشوائي:
   - `v1[i].sha256` موجود في v2؟
   - `v1[i].drive_file_id` = `v2[j].DriveFileId` (لنفس sha256)؟
3. **SourcePath enrichment rate:** كم صف في v2 له `SourcePath` غير فارغ؟ (نتوقع >95% لو Activity Log تُغطي الفترة).
4. **Duplicate SHA256 check:** لا تكرار في v2.
5. **تقرير نهائي** في `MigrationLog`.

**⏱️ الوقت:** 5 دقائق.
**Rollback:** إن فشلت — حذف v2 وإعادة المرحلة C.

---

### المرحلة E — Cutover (اللحظة الحرجة)

**الهدف:** تحويل النظام إلى استخدام v2 بلا فقدان أرشفة أو تكرار.

**Runbook:**
1. **✋ لحظة الاستعداد:**
   - تأكد `MIGRATION_STATE = COMPLETE`.
   - تأكد `ARCHIVE_STATUS = IDLE` (لا جلسة نشطة).
   - تأكد `Emergency Freeze = ON` كإضافي.
2. **⏰ نافذة الصيانة (30 ثانية فقط):**
   - `setConfig(PROP_KEYS.DEDUP_SHEET_ID, getConfig(PROP_KEYS.DEDUP_SHEET_V2_ID))`
   - `setConfig(PROP_KEYS.DEDUP_SCHEMA_VERSION, 'v2')`
   - `setConfig(PROP_KEYS.DEDUP_TAB_NAME, 'dedup_v2')` (إن قررت اسم tab مختلف)
3. **🧪 اختبار فوري:**
   - شغّل `testCpanelConnection` → ✅.
   - شغّل archive على ملف اختبار واحد (رفع ملف صغير جديد إلى cPanel، ثم `runArchiveNow`).
   - تحقق أن الصف الجديد ظهر في v2 (وليس v1).
4. **✅ الإطلاق:**
   - `Emergency Freeze = OFF`.
   - إعادة تشغيل الـ Trigger المُجدوَل.
   - راقب أول جلسة كاملة.

**⏱️ الوقت:** 5-10 دقائق.
**Rollback خلال 5 دقائق:**
- `setConfig(PROP_KEYS.DEDUP_SHEET_ID, <original v1 id>)` — يعود النظام إلى v1 فوراً.
- v1 Sheet لم يُلمَس أثناء Migration → آمن.
- التسجيل في v2 خلال الاختبار → يُتجاهل، لا ضرر.

---

### المرحلة F — Cleanup (بعد أسبوع من الاستقرار)

**الهدف:** إزالة البقايا.

**الخطوات:**
1. **أرشفة v1 Sheet** — إعادة تسميته إلى "[ARCHIVED] Dedup Index v1 — pre-migration".
2. **حذف Migration scripts** من `src/migration/` (احتفظ بها في git history).
3. **مسح Config keys غير المستخدمة:**
   - `MIGRATION_STATE`, `MIGRATION_LAST_ROW`, `DEDUP_SHEET_V2_ID` (v1 ID الأصلي المسجَّل).
4. **تحديث CHANGELOG.md** بقسم `[1.2.0]` للـ migration.

**⏱️ الوقت:** 20 دقيقة.

---

## 🧪 7. استراتيجية الاختبار

### 7.1 · Unit tests جديدة (في `src/tests/Tests.gs`)

- `migration: guessMimeType returns correct type for common extensions`
- `migration: guessMimeType returns empty for unknown extensions`
- `migration: extractFileName pulls last segment from path`
- `migration: buildSourcePathIndex maps sha to sourcePath`
- `migration: mapV1RowToV2 produces 16-element array`
- `migration: mapV1RowToV2 sets Status=ARCHIVED`
- `migration: mapV1RowToV2 sets VersionNumber=1`

### 7.2 · Integration checks (يدوي)

- ✅ Cutover اختبار: أرشفة ملف اختبار بعد swap → يظهر في v2 لا v1.
- ✅ Rollback drill: swap إلى v1 مؤقتاً وعد → يعمل بلا فقدان.
- ✅ Duplicate detection: أرشفة نفس الملف مرتين بعد cutover → skip في v2.

### 7.3 · Load smoke test

- شغّل جلسة أرشفة كاملة على batch صغير بعد cutover (5-10 ملفات) — سرعة v2 مقاربة لـ v1 (رغم أن الصف صار 16 عمود بدل 5).

---

## 🚀 8. Roadmap ما بعد Migration (تكتمل قدرات v2.0)

Migration نفسها لا تُضيف ميزات مستخدم. لكنها تفتح الباب لـ 3 مكونات كبيرة تعتمد على schema v2:

### 8.1 · Bloom Filter (طبقة 1 من نظام dedup الجديد)
- سعة 100k، MurmurHash3، ~180 KB persist في ScriptProperties (Base64).
- تُهيَّأ بعد Migration من `v2.SHA256`.
- Read path: `bloom.mightContain(sha) → hotCache.has(sha) → v2.findByHash(sha)`.

### 8.2 · Hot Cache (طبقة 2)
- CacheService بـ TTL 72h (قابل للتخصيص).
- يخزّن آخر 6000 SHA256 (سعة CacheService).
- LRU eviction.

### 8.3 · Delta Verifier (طبقة 4)
- Trigger أسبوعي.
- يفحص 5% عشوائي من `v2.SHA256`:
  - يتحقق أن `DriveFileId` ما زال يفتح ملفاً موجوداً.
  - يحدّث `LastVerifiedAt`.
  - إن مفقود → تنبيه (كشف حذف يدوي).

**كل الثلاثة تعتمد على وجود schema v2** — لذلك Migration prerequisite.

---

## 🎬 9. Kickoff Prompt لجلسة قادمة

انسخ هذا كأول رسالة لـ Claude في الجلسة الجديدة:

```
مرحباً Claude Code.

نحن في مشروع cpanel-drive-archiver، نسخة v1.1.0 (Phase 1 hardened)
نشرت في 2026-07-11. النظام في إنتاج حي مع 7,880 ملف في Dedup Index
و 297,602 سجل في Activity Log.

اقرأ بالترتيب الإلزامي:
1. PRODUCTION_CONTEXT.md
2. CLAUDE.md
3. PHASE_1_REPORT.md
4. PHASE_2_PLAN.md ← هذا الملف

اليوم نبدأ المرحلة 2: ترقية Dedup Index من schema v1 (5 أعمدة) إلى
v2 (16 عمود). الخطة كاملة في PHASE_2_PLAN.md.

اتخذ القرارين في § 4:
- SourcePath: يوصي الخيار B (استخراج من Activity Log).
- MimeType: يوصي الخيار B (استنتاج من extension).

نفّذ المرحلة A فقط (Preparation) وتوقّف. لا تلمس v1 Sheet.
```

---

## ⚠️ 10. قواعد صارمة للمرحلة 2

- 🚫 **لا يُكتَب على v1 Sheet أبداً** طوال المراحل A-E. صياغة صارمة: script لا يحمل reference قابلة للكتابة لـ v1 sheet ID.
- 🚫 **لا cutover دون dry-run ناجح على 100 صف.**
- 🚫 **لا `clasp push` أثناء نافذة الصيانة** — الـ push يعيد تعيين .clasp.json state في بعض الحالات.
- ✅ **كل مرحلة commit مستقل** — لا batch commit.
- ✅ **PHASE_2_REPORT.md** في نهاية المرحلة (كما فعلنا لـ Phase 1).
- ✅ **Backup إضافي قبل كل مرحلة** — رخيصة، تنفع.

---

## 📎 11. مراجع سريعة

- **v1 Deduplicator (يبقى للـ read حتى cutover):** [src/dedup/Deduplicator.gs](src/dedup/Deduplicator.gs)
- **Config keys:** [src/Config.gs](src/Config.gs) — أضف keys جديدة هناك.
- **TimeBudget للـ checkpointing:** [src/Utils.gs](src/Utils.gs) — استعمل نفس النمط كـ Archive.
- **Activity Log columns (لبناء SourcePath index):** [src/core/Logger.gs:16-20](src/core/Logger.gs#L16-L20)
- **CLAUDE.md § schema v2:** [CLAUDE.md](CLAUDE.md) — القسم "هيكل ورقة Full Index".

---

**📅 التنفيذ المُتوقّع:** جلسة تصميم منفصلة بعد استقرار v1.1.0 لـ 48 ساعة أو أكثر.

**⏸️ نهاية PHASE_2_PLAN.md — الملف جاهز ليُستخدم كـ brief كامل في الجلسة القادمة.**

</div>
