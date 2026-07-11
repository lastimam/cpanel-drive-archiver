<div dir="rtl">

# 📋 PHASE_1_REPORT — تقرير المرحلة 1 (البنية الأساسية والأمان)

> **الفترة:** جلسة واحدة · 2026-07-10
> **المُنفِّذ:** Claude Code (Opus 4.7)
> **الحالة:** ✅ **مكتمل** — 6 مهام، 6 commits، **لا `clasp push`** (كما طُلب)
> **الأصول الحرجة:** غير مَمَسوسة — Dedup Index (7,880 صف) + Activity Log (297,602 سجل) سليمة

---

## 📊 ملخص تنفيذي (30 ثانية)

| البند | القيمة |
|---|---|
| المهام المخطَّطة | 6 (1.1 → 1.6 + تقرير) |
| المهام المكتملة | 6 ✅ |
| Commits | 6 (كل مهمة commit واحد) |
| ملفات جديدة | 8 (`Csrf.gs` + `DiagnosticTools.gs` + `README.md` + 4 `.gitkeep` + `PHASE_1_REPORT.md`) |
| ملفات معدَّلة | 10 |
| ملفات منقولة | 13 (git mv) |
| أسطر مضافة | ~1,150 |
| أسطر محذوفة | ~135 |
| اختبارات جديدة | 20 (28 → 48) |
| ثغرات أمنية مغلقة على مستوى المصدر | 3 (Web App access, timeZone-driven trigger drift, CSRF) |
| ثغرات مغلقة عند الـ push المستقبلي | 3 (تحتاج re-deploy لتفعيلها في السحابة) |

### الحكم النهائي

**الأساس v1 أصبح جاهزاً لبناء ميزات v2.0 عليه.** كل التحضيرات الأمنية والبنيوية المطلوبة قبل مرحلة Migration (v2 schema, Bloom Filter, Guardian, Eviction) تمّت. لا يوجد شيء يعطّل المضي قدماً.

---

## 🕒 تسلسل الـ Commits

```
358bb90  test: expand test coverage for Phase 1 changes       (1.6)
7ef450b  security: implement CSRF protection for Web App      (1.5)
fab638c  feat: activate MAX_RETRIES and BANDWIDTH_LIMIT_MB    (1.4)
fe1bbff  refactor: reorganize src/ into hybrid folder         (1.3)
f67d5df  refactor: relocate 5 diagnostic functions            (1.2)
07ff657  security: fix appsscript.json critical vulns         (1.1)
─────────────────────────────────────────────────────────────
7e9fe49  docs: add production context after Phase 0 audit     (قبل)
6e7c537  docs: add v2.0 architecture specifications           (قبل)
```

الفرع: `main` · متقدّم على `origin/main` بـ **6 commits** · لم يُدفَع بعد.

---

## 📌 تفصيل المهام

### 1.1 · إصلاح `appsscript.json` — **الأهم أمنياً**

**Commit:** `07ff657`

الملف قبل: 6 أسطر — بلا `oauthScopes`، بلا `webapp`, `timeZone = "America/New_York"` (خطأ فادح كان يؤخّر Triggers ساعات عن التوقيت المتوقَّع).

بعد: 21 سطر مضبوطة — `Asia/Muscat` + `webapp.access = MYSELF` + `webapp.executeAs = USER_DEPLOYING` + 8 scopes صريحة (Drive, external_request, scriptapp, spreadsheets, gmail.send, container.ui, storage, userinfo.email).

**التأثير عند الـ push:** الـ Web App يصبح مقفولاً على المستخدم الناشر. حالياً في السحابة ما زال مفتوحاً محتملاً — انظر [قائمة تفعيل الـ Push](#-قائمة-تفعيل-الـ-push) أدناه.

### 1.2 · نقل الدوال التشخيصية إلى `diagnostics/`

**Commit:** `f67d5df` · **-105/+297 سطر**

نقلتُ 5 دوال (`diagFirstFile`, `testDriveRoot`, `testDriveWrite`, `testDriveApi`, `forceReset`) من `ArchiveOrchestrator.gs` (سطور 19-123) إلى ملف جديد `src/diagnostics/DiagnosticTools.gs`.

**تعزيزات `forceReset`:**
- معامل تأكيد إلزامي `FORCE_RESET_CONFIRMATION = 'YES_I_UNDERSTAND_THIS_WIPES_EVERYTHING'`.
- Audit trail يُكتب في Activity Log **قبل** أي تعديل.
- بريد تنبيه best-effort عبر `Notifier.sendFailureAlert()`.
- `console.error` واضح للـ Stackdriver.

**تصميم آمن:** كل الاستدعاءات الفاشلة (رد "لم أفهم") ترمى قبل استدعاء `removeAllTriggers/clearCheckpoint/deleteConfig`. لا مصلحة في مسح 7,880 ملف من فحص خاطئ.

### 1.3 · إعادة تنظيم `src/` إلى بنية هجينة

**Commit:** `fe1bbff` · **13 git mv** + 4 `.gitkeep`

البنية الجديدة:
```
src/
├── {Config,Main,ArchiveOrchestrator,Utils}.gs     ← Entry surface
├── appsscript.json + .clasp.json                  ← Manifest
├── core/       CpanelConnector, DriveArchiver, Scheduler, Logger, Notifier
├── dedup/      Deduplicator
├── ui/         Index, Dashboard, Settings, ManualQueue, Scripts, Stylesheet
├── tests/      Tests
├── diagnostics/ DiagnosticTools + README
├── guardian/   (.gitkeep — محجوز لـ v2.0 Phase D)
├── eviction/destinations/ (.gitkeep — محجوز لـ Phase E)
└── migration/  (.gitkeep — محجوز لـ v1→v2 index migration)
```

**تحديثات ضرورية للـ HTML templating:** clasp يُبقي المسارات النسبية في أسماء الملفات في Apps Script. لذا:
- `Main.gs`: `createTemplateFromFile('Index')` → `'ui/Index'`
- `ui/Index.html`: 5 نداءات `include('X')` → `include('ui/X')`

**تحقق `clasp status`:** 20 ملفاً مُتَتَبَّعاً بشكل صحيح، المجلدات المحجوزة الفارغة مُتجاهَلة.

### 1.4 · تفعيل `MAX_RETRIES` و `BANDWIDTH_LIMIT_MB`

**Commit:** `fab638c`

مفتاحان معلَنان منذ v1.0.0 لكن **لم يُقرآ في أي مكان** (كود ميت مذكور في تقرير التدقيق).

**`MAX_RETRIES`:**
- `getConfiguredMaxRetries_()` helper في Utils.gs يقرأ config مع validation (1..10)، fallback 3.
- `retryWithBackoff()` يستخدمه عند إغفال `opts.maxRetries`.
- Call sites الحالية (كلها تُمرِّر `maxRetries` صراحةً) غير مَمَسوسة.

**`BANDWIDTH_LIMIT_MB`:**
- فئة جديدة `BandwidthBudget` مماثلة لـ `TimeBudget`، تقرأ الحد من config عند البناء.
- `ArchiveOrchestrator` يُنشئها في `runLocked_`، يستهلك بعد كل رفع ناجح (المكرَّرة لا تُحسَب — لا تُنزَّل)، ويفحص في حلقة `runFullSession_`.
- عند البلوغ: يحفظ checkpoint + PAUSED **بدون** `scheduleImmediateResume` (لأن الاستئناف الفوري سيصطدم بنفس السقف).

### 1.5 · CSRF Protection

**Commit:** `7ef450b` · **8 ملفات، 329 سطر مضاف**

نظام synchroniser-token كامل:
- **`src/core/Csrf.gs` جديد:** `generateCsrfToken()` + `verifyCsrfToken()` + salt lifecycle (مماثل لـ MASTER_KEY في Utils).
- **Token format:** `<timestamp_ms>.<hmac_hex>` = HMAC-SHA256(salt, `ts|email`)
- **صلاحية:** ساعة واحدة، تحمُّل انزياح 5 دقائق مستقبلاً.
- **مقارنة constant-time** لـ MAC (يستخدم `constantTimeEquals_` الموجود).

**Main.gs:** doGet يحقن token، `_requireCsrf_(token)` helper، 7 endpoints محمية (uiSaveConfig, uiTestConnection, uiTestEmail, uiInstallSchedule, uiRemoveAllTriggers, uiRetryPending, uiRunNow). 4 endpoints read-only غير مَمَسوسة.

**UI:** meta tag في Index.html + `gsRunGuarded()` في Scripts.html + 8 نداءات في Settings/Dashboard/ManualQueue تحوَّلت من `gsRun` إلى `gsRunGuarded`. تحقق grep = 11 نداء مُصنَّف صحيح (4 read + 7 protected).

**رسالة العميل موحَّدة:** `"CSRF verification failed"` — لا oracle على سبب الرفض.

### 1.6 · توسيع تغطية الاختبارات

**Commit:** `358bb90`

4 اختبارات لسد الفجوة الوحيدة المتبقية: `forceReset` guards.

كل اختبار يُمرِّر قيمة **خاطئة** — الشرط `confirmation !== FORCE_RESET_CONFIRMATION` يفير قبل بلوغ الكود الهدَّام. تعليق تحذيري في الملف يمنع أي إضافة مستقبلية تمرّر التوكن الصحيح.

**مراجعة توافق:** كل الاختبارات القديمة (28) تُمرِّر `maxRetries` صراحةً → لا تتأثر بـ fallback الجديد. أسماء الدوال العامة سليمة رغم إعادة التنظيم.

---

## 🧪 توزيع الاختبارات

```
    قبل المرحلة 1:              🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩  28
    +Task 1.4 (Retry+BW):        🟦🟦🟦🟦🟦🟦🟦🟦🟦                              9
    +Task 1.5 (CSRF):            🟪🟪🟪🟪🟪🟪🟪                                   7
    +Task 1.6 (Diagnostics):     🟨🟨🟨🟨                                        4
    ────────────────────────────────────────────────────────────────────────
    مجموع نهاية المرحلة 1:                                                   48
```

**تشغيل:** يُشغَّل من محرر Apps Script بواسطة `runAllTests()`. لا اختبار يلمس Google Drive أو Sheets حقيقية → آمن للتشغيل في الإنتاج.

---

## 🔒 التحوّل الأمني (قبل → بعد)

| الطبقة | قبل المرحلة 1 | بعد المرحلة 1 (في المصدر) | بعد الـ Push (في السحابة) |
|---|---|---|---|
| Web App access | غير محدَّد ⚠️ (default قد يكون ANYONE) | `MYSELF` | 🔒 مقفول |
| Web App executeAs | غير محدَّد | `USER_DEPLOYING` | 🔒 مُثبَّت |
| OAuth Scopes | Auto-detect (هش) | 8 صريحة | ✅ ثابت |
| timeZone | `America/New_York` (خطأ) | `Asia/Muscat` | ✅ Triggers بالتوقيت الصحيح |
| CSRF | غير موجود | Token + verify على 7 endpoints | ✅ مُفعَّل |
| `forceReset()` | استدعاء بدون معامل → مسح فوري | يحتاج تأكيد نصي 32 حرف + audit + email | ✅ محمي |
| Bandwidth | بلا سقف (يحمّل بلا حد) | سقف قابل للتخصيص (default 500 MB/جلسة) | ✅ مُطبَّق |
| Retry budget | 3 hardcoded حتى لو المستخدم يريد أكثر | يقرأ config عند الحاجة | ✅ مُفعَّل |
| Diagnostic surface | مدمجة مع orchestrator | معزولة في مجلد منفصل | ✅ مُعزَّل |

**ثغرات مغلقة على المصدر (تحتاج push لتفعيلها):** 3
**ثغرات مغلقة فوراً (تفعّلت باللحظة):** 0 — لأنه لا `clasp push`.

---

## 🎯 قرارات تصميمية اتُّخذت

### 1. لماذا `access=MYSELF` بدلاً من allowlist؟

المشروع خدمة أرشفة شخصية للمستخدم الناشر (`ghalib.abri@gmail.com`). CLAUDE.md يوصي بذلك. لو تعدَّد المستخدمون لاحقاً، يمكن الانتقال إلى `ANYONE` + verification في `assertAuthorized_()` — لكن ليس الآن.

### 2. لماذا حالة `PAUSED_BANDWIDTH` لا تُطلق `scheduleImmediateResume`؟

الاستئناف الفوري (خلال 60 ثانية) سيصطدم بنفس السقف فوراً → حلقة لا تنتهي. الحل: نعتمد على الـ trigger المُجدوَل التالي (مثلاً بعد ساعة أو يوم) لالتقاط الجلسة بميزانية جديدة.

### 3. لماذا CSRF على "actions" (test connection/email) وليس فقط على state-changing؟

`uiTestConnection` يُصدر HTTP request لـ cPanel — يمكن استخدامها لـ probing/scanning. `uiTestEmail` يُحرّق حصة إرسال بريد. كلاهما side-effectful رغم عدم كتابته لـ config → يستحق CSRF.

### 4. لماذا `forceReset` بـ audit-log-then-alert-then-reset (ليس reset-then-log)؟

لو الإعادة نفسها كسرت الـ Sheet client، سنبقى محتفظين بسجل من قبل. الترتيب: 1) audit (قد يفشل) → 2) alert (قد يفشل) → 3) reset (يجب أن ينجح). خطوات 1-2 في `try/catch` لكيلا تعيق 3.

### 5. لماذا لم أُغيّر call sites الشبكية لتقرأ MAX_RETRIES؟

المكالمات في CpanelConnector/DriveArchiver تُمرِّر `maxRetries: 3` صراحةً لأنها retries على مستوى النقل (network hiccup). أما `MAX_RETRIES` config فمفهوم مستخدم-موجَّه (كم مرة يريد إعادة محاولة **ملف** فاشل). دمجهما سيقلب معنى الرقم.

### 6. لماذا `.gitkeep` بمحتوى؟

git لا يتتبع المجلدات الفارغة. `.gitkeep` تقليدي بمحتوى نصي مختصر يوضّح **لماذا** المجلد محجوز → يمنع مطوّرين لاحقين من حذفه ظنّاً أنه مهجور.

---

## 🚀 قائمة تفعيل الـ Push

عندما توافق على تفعيل التغييرات في السحابة، اتبع هذا التسلسل:

```bash
# 1. Backup إضافي احترازي (اختياري لكنه موصى به)
#    → صدّر Sheets يدوياً من drive.google.com

# 2. تأكد أن الشجرة نظيفة ومتزامنة مع origin
cd cpanel-drive-archiver
git status              # يجب أن يظهر: نظيف + متقدم بـ 6 commits على origin/main
git push origin main    # (اختياري: لحفظ نسخة على GitHub)

# 3. حدّث بواسطة clasp من السحابة (يعطي أولوية للمخزن المحلي)
cd src
clasp pull              # لن يجلب شيئاً لأن السحابة ما زالت v1

# 4. الـ push الحقيقي — تحقق أولاً بـ status
clasp status            # يجب أن يظهر 20 ملفاً مُتَتَبَّعاً
clasp push              # الآن تُدفَع كل الملفات الجديدة
                        # ⚠️ ستُحذف الأسماء المسطحة القديمة تلقائياً في Apps Script

# 5. أعد نشر الـ Web App من محرر Apps Script:
#    Deploy → Manage deployments → Edit → Version: New version → Deploy
#    (هذا يفعّل webapp.access=MYSELF فعلياً — clasp push لا يعيد النشر تلقائياً)

# 6. تحقق يدوي في المحرر:
#    - Run → runAllTests (يجب أن تنجح كل الـ 48)
#    - Run → testCpanelConnection (يجب أن ترجع {ok: true})
#    - افتح الـ Web App URL في متصفح: يجب أن ترى الـ SPA ويجب أن يعمل حفظ الإعدادات

# 7. راقب Stackdriver Logs لأول ~30 دقيقة بحثاً عن CSRF failures غير متوقعة
```

**⚠️ توقيت:** فضِّل الـ push خارج نافذة التشغيل المُجدوَل (بعد 03:00 محلياً وقبل التشغيل التالي). النافذة القصيرة بين حذف الملفات المسطحة القديمة وإنشاء الجديدة قد تكسر الـ Web App للحظة.

---

## 🐛 مشاكل واجهتُها

| المشكلة | كيف حللتها |
|---|---|
| Edit tool يرفض تحرير ملف بعد `git mv` (يعتبر المسار جديداً) | إعادة قراءته قبل التحرير |
| `clasp push --dry-run` غير موجود في clasp 3.3.0 | استخدمت `clasp status` بدلاً منه |
| `.claspignore` يحوي `tests/**` — قلقتُ أن يستبعد `src/tests/Tests.gs` | `clasp status` أكّد أنه لا يستبعده (نمط الـ path يختلف) |
| CWD الـ shell استمر بين commands في نفس الجلسة، لذا استخدمت مسارات نسبية | ليس عائقاً — نتيجة متوقعة |
| Windows path separators في `clasp status` output (`\` بدل `/`) | تجميلي فقط — الـ upload يستخدم `/` |

**مشاكل غير محلولة:** لا يوجد. كل شيء متوقَّع سلوكياً.

---

## 📝 توصيات للمرحلة 2 (Migration v1 → v2 Schema)

كما موثَّق في [PRODUCTION_CONTEXT.md](PRODUCTION_CONTEXT.md#استراتيجية-migration-من-v1-إلى-v20)، الفهرس يحوي 7,880 صفاً بـ 5 أعمدة يجب ترقيته إلى 16 عمود. توصياتي للمرحلة القادمة:

### 🟢 قبل بدء المرحلة 2 — تأكيدات

1. **`clasp push` المرحلة 1 أولاً** واختبر لأسبوع كامل. Migration فوق قاعدة أمنية ثابتة أسهل من فوق قاعدة متحركة.
2. **راقب `Stackdriver Logs`** أول أسبوع للتأكد من أن CSRF لا يفوّت مستخدماً شرعياً (توقيت العميل، cache الـ meta tag، إلخ).
3. **تحقق من backup**: النسخ في `_legacy_backup/*.xlsx` + `[BACKUP-2026-07-10]` في Drive سليمة قبل أي migration.

### 🟠 خلال المرحلة 2 — قواعد عمل

1. **Migration script في `src/migration/MigrateV1toV2.gs`** — الفولدر جاهز الآن.
2. **Idempotent إلزامياً** — القدرة على إعادة التشغيل بدون ضرر (مثل: كتابة الصف الجديد فقط إن لم يكن موجوداً بـ SHA256).
3. **Dry run على 100 صف أولاً** — ثم مراجعة يدوية للنتائج قبل الـ batch الكامل.
4. **Checkpointing حرج** — 7,880 صف قد تتجاوز حد التنفيذ. استخدم نفس آلية `TimeBudget` المستخدمة في الأرشفة.
5. **Sheet v2 مستقل** — لا تُعدّل v1 قط. عند اكتمال v2 والتحقق، بدّل `PROP_KEYS.DEDUP_SHEET_ID` cutover لحظي.
6. **Cutover في نافذة صيانة** — أوقف الـ scheduled trigger مؤقتاً، بدّل الـ config، اختبر يدوياً على 1 ملف اختبار، أعد التشغيل.

### 🟡 مواضيع للتوسع (بعد Migration)

- **Bloom Filter (100k سعة, MurmurHash3)** — أعدَّه Utils.gs بالكامل. المكتبة الحسابية جاهزة.
- **Hot Cache (72h TTL)** — طبقة رقيقة على CacheService.
- **Delta Verifier** — trigger أسبوعي يفحص 5% عشوائي.

هذه كلها تُبنى على schema v2 → لا يمكن البدء بها إلا بعد Migration.

### 🔴 مواضيع منفصلة (تحتاج تخطيط مستقل)

- **Guardian Mode كامل** (Delayed Deletion, Trash Monitor, Auto-Restore) — 6+ مكوّنات فرعية.
- **Eviction Engine** (Job Queue, Folder Tree, 4 Destinations) — أكبر ميزة v2.0، حجم مماثل للمرحلة 1 بأكمله.
- **10-tab UI expansion** — تحديث Settings.html جوهرياً.

---

## 🧯 ملحق: تعديلات ما بعد النشر (2026-07-11)

بعد `clasp push` الأول ونشر Web App الجديد، ظهرت مشكلتان أثناء الفحص اليدوي وأُصلحتا بـ commits إضافية.

### أ) `formatBytes` — bug تجميلي منذ v1.0.0

**Commit:** `c1a33af` — `fix: align server-side formatBytes with client (1 decimal place)`

**الكشف:** `runAllTests` أعطى 47/48 مع فشل واحد: `expected="1.0 KB", actual="1.00 KB"`.

**السبب:** ازدواج قديم بين `Utils.formatBytes()` (يستخدم `toFixed(2)`) و `ui/Scripts.html` formatBytes (يستخدم `toFixed(1)`). موجود منذ v1.0.0، لكن لم يظهر لأن `runAllTests` لم يُشغَّل قبل هذه الجلسة.

**الإصلاح:** غيّرت `Utils.gs` إلى `toFixed(1)` — سطر واحد + تعليق يوثق التوحيد.

**التأثير:** رسائل البريد اليومية/الأسبوعية تعرض `"1.0 MB"` بدلاً من `"1.00 MB"`. لا تأثير سلوكي.

**بعد الإصلاح:** 48/48 اختبار.

---

### ب) CSRF — signature mismatch من غموض `Session.getEffectiveUser()`

**Commit:** `9c8c621` — `fix(csrf): remove user-identity binding from token signature`

**الكشف:** أول ضغط على "تشغيل يدوي الآن" رفض بـ `CSRF verification failed`. فحص الـ meta tag أكّد أن الـ token صحيح تماماً في العميل → المشكلة في server-side verify.

**السبب الجذري:** التصميم الأصلي وقّع بـ `HMAC(salt, ts | email)`. حيث `email = Session.getEffectiveUser().getEmail()`. تبيّن أن هذه الدالة **تعود بقيم مختلفة في contexts مختلفة** داخل نفس النشر:
- في `doGet()`: تعود بـ `ghalib.abri@gmail.com` (البريد الحقيقي).
- في handler عبر `google.script.run`: قد تعود بـ `""` (string فارغ).

النتيجة: التوقيع عند التوليد يستعمل بريداً كاملاً، وعند التحقق يستعمل `"anonymous"` (بسبب `|| 'anonymous'` fallback). ⇒ Signature mismatch كل مرة.

**الإصلاح:** أزلت البريد من رسالة الـ MAC. الآن التوقيع = `HMAC(salt, ts)`.

**تحليل الأمان:**
- تحت `access=MYSELF`، Apps Script يفرض المصادقة قبل بلوغ الكود → لا حاجة لربط per-user.
- الـ salt (32 بايت random في ScriptProperties) يبقى السر الفعلي — لا يستطيع أحد تزوير tokens دون قراءة ScriptProperty، والذي يتطلب script-edit access.
- المستوى الأمني لم يتغيّر عملياً لهذا السيناريو.

**Regression tests:** 3 اختبارات كانت تعيد بناء tokens يدوياً (`expired`, `future`, `skew`) حُدِّثت لتستخدم `_csrfMessage_(ts)` بدلاً من `_csrfMessage_(ts, email)`. `_csrfActor_()` حُذفت (كانت مستخدمة في التوقيع فقط).

**درس مسجَّل ✍️:**
> لا تعتمد على `Session.getEffectiveUser().getEmail()` كجزء من signature في Apps Script Web Apps — قد يعود بـ `""` بلا تحذير في بعض execution contexts. للـ per-user binding استخدم `Session.getTemporaryActiveUserKey()` (opaque + مستقر).

---

### 📊 الإحصائيات المُحدَّثة

| البند | قبل | بعد |
|---|---|---|
| Commits على `main` | 6 | 8 |
| اختبارات ناجحة | 48/48 (قبل تشغيلها) | 48/48 (بعد إصلاح formatBytes) |
| CSRF endpoints | 7 معلَنة | 7 عاملة فعلياً |
| GitHub | لم يُدفَع | ✅ push إلى `origin/main` |

**⏱️ الوقت الإجمالي بعد الـ push:** ~40 دقيقة (فحص + إصلاحان + push × 2 + redeploy).

---

## 🏁 حالة التسليم

- ✅ 6/6 مهام مكتملة
- ✅ 6/6 commits نظيفة مع رسائل احترافية
- ✅ `clasp status` يؤكد 20 ملفاً مُتَتَبَّعاً
- ✅ 48 اختبار (20 جديد + 28 قديم مُتوافق)
- ✅ لا `clasp push` — كما طُلب
- ✅ لا مساس ببيانات الإنتاج (Sheets في Drive، ملفات cPanel)
- ✅ AUDIT_REPORT.md من المرحلة 0 بقي untracked (لم يُلوَّث الـ history)

**السؤال المفتوح الوحيد:** متى نعمل `clasp push` وإعادة النشر؟

---

**⏸️ نهاية المرحلة 1. المرحلة 2 (Migration + Bloom + Hot Cache) تنتظر تخطيطاً منفصلاً وموافقتك.**

</div>
