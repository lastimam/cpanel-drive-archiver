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