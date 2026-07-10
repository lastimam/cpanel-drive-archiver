<div dir="rtl">

# 🔧 src/diagnostics/ — أدوات التشخيص

هذا المجلد يحوي دوال تُستدعى **يدوياً فقط** من محرر Apps Script أو `clasp run` — **لا** توجد نقاط دخول UI (`ui*`) تشير إليها. الهدف من العزل: منع التسريب العرضي إلى Web App وحصر الاستخدام في السيناريوهات التشخيصية.

---

## 📋 قائمة الدوال

| الدالة | النوع | يعدّل حالة؟ | متى تُستخدم |
|---|---|---|---|
| `testDriveApi()` | Read-only | ❌ | فحص سريع لصلاحية OAuth token وتوفر Drive API |
| `testDriveRoot()` | Read-only | ❌ | فحص metadata مجلد الجذر (owners, permissions) عند وقوع 403 غير متوقع |
| `testDriveWrite()` | Write (test folder) | ⚠️ يترك مجلد `_test_write_<epoch>` | التحقق من صلاحية الكتابة في الجذر |
| `diagFirstFile()` | Read + Write | ⚠️ يترك مجلد `_archiver_test_<epoch>` | فحص شامل: metadata + list + write test |
| `forceReset(confirmation)` | 🚨 Destructive | ✅ يمسح Triggers + Checkpoint + Queue | حالات stuck لا تُحلّ إلا بإعادة تهيئة كاملة |

---

## 🚨 forceReset — قراءة إلزامية قبل الاستخدام

### ما لا تمسه أبداً

- ✅ **Dedup Index Sheet** (7,880 ملف) — سليم بعد التنفيذ
- ✅ **Activity Log Sheet** (297,602 سجل) — سليم بعد التنفيذ
- ✅ **ملفات Drive المؤرشفة** — سليمة بعد التنفيذ
- ✅ **إعدادات ScriptProperties عدا 3 مفاتيح** (انظر أدناه)

### ما تمسحه

- ❌ كل Triggers المُثبَّتة (المُجدولة + resume + reports)
- ❌ `PROP_KEYS.CHECKPOINT_FILE_ID` + ملف الـ checkpoint في Drive
- ❌ `PROP_KEYS.PENDING_RETRY_PATHS` (طابور الفاشلين)
- 🔁 تعيد `PROP_KEYS.ARCHIVE_STATUS` إلى `IDLE`

### قواعد الاستدعاء

```javascript
// ❌ خطأ — سيرمى Error فوراً:
forceReset();
forceReset('yes');
forceReset(true);

// ✅ الصيغة الوحيدة المقبولة:
forceReset('YES_I_UNDERSTAND_THIS_WIPES_EVERYTHING');
```

### ما يحدث تلقائياً عند الاستدعاء الصحيح

1. **Audit row** يُكتب في Activity Log بـ `Status=FAILED` و `SourcePath=forceReset` قبل أي تعديل.
2. **بريد تنبيه** يُرسَل إلى `NOTIFICATION_EMAIL` عبر `Notifier.sendFailureAlert()`.
3. **console.error** يظهر في Stackdriver Logs.
4. ثم يُنفَّذ الإعادة الفعلية.

الخطوات 1-3 تُلفّ بـ `try/catch` — إن فشل التسجيل أو الإرسال، تستمر عملية الإعادة (فلسفة: fail-open لا fail-closed لأن الحالة العالقة قد تكون سبب فشل التسجيل ذاته).

### متى **لا** تستخدمها

- ❌ عندما تكون هناك جلسة أرشفة نشطة (سيؤدي إلى فقدان تقدم).
- ❌ للتخلص من رسالة خطأ عابرة — جرّب `retryFailedArchives()` أولاً.
- ❌ لإعادة تعيين إعدادات — استخدم UI أو `deleteConfig()` انتقائياً.

---

## 🔍 توصية

قبل استدعاء أي دالة من هنا:
1. تحقق من `PROP_KEYS.ARCHIVE_STATUS` — إن كان `ACTIVE`، انتظر أو أوقف الجلسة أولاً.
2. راجع Activity Log لآخر ~30 سجل لفهم السياق.
3. إن كانت مشكلتك أن Triggers تكاثرت، `removeAllTriggers()` (في Scheduler.gs) أقل خطراً وأدق.

</div>
