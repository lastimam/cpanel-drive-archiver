/**
 * @fileoverview Email notifications: daily digest, weekly summary, and
 * real-time failure alerts. Sent via GmailApp (requires gmail.send
 * scope). All templates are RTL Arabic with inline styles — Gmail strips
 * most <style> blocks so we cannot rely on CSS classes.
 *
 * Quota awareness: personal Gmail allows ~100 sends/day. We expect 1
 * daily + ≤10 alerts + 1 weekly per week, comfortably within bounds.
 */

// ============================================================
// Notifier
// ============================================================

class Notifier {
  constructor() {
    /** @private */ this.email_ = getConfig(PROP_KEYS.NOTIFICATION_EMAIL);
    /** @private */ this.logger_ = getLogger();
  }

  // ---------- Public API ----------

  /** @return {{sent: boolean, error: (string|undefined)}} */
  sendDailyReport() {
    if (!this.email_) return { sent: false, error: 'no_recipient' };
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    const stats = this.logger_.getStatsBetween(from, to);
    const subject = this.buildDailySubject_(stats);
    const html = this.buildDailyHtml_(stats, from, to);
    return this.send_(subject, html);
  }

  /** @return {{sent: boolean, error: (string|undefined)}} */
  sendWeeklyReport() {
    if (!this.email_) return { sent: false, error: 'no_recipient' };
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    const stats = this.logger_.getStatsBetween(from, to);
    const html = this.buildWeeklyHtml_(stats, from, to);
    return this.send_('📈 التقرير الأسبوعي — أرشفة cPanel', html);
  }

  /**
   * @param {{title: string, detail: string, fileName?: string}} ctx
   * @return {{sent: boolean, error: (string|undefined), skipped?: boolean}}
   */
  sendFailureAlert(ctx) {
    if (!this.email_) return { sent: false, error: 'no_recipient' };
    if (getConfig(PROP_KEYS.ALERT_ON_FAILURE) !== 'true') {
      return { sent: false, skipped: true };
    }
    const html = this.buildAlertHtml_(ctx);
    const subject = '⚠️ تنبيه فشل — ' + (ctx.title || 'أرشفة cPanel');
    return this.send_(subject, html);
  }

  /** @return {{sent: boolean, error: (string|undefined)}} */
  sendTestEmail() {
    if (!this.email_) return { sent: false, error: 'no_recipient' };
    const html = this.wrapShell_('🧪 اختبار الإشعارات',
        '<p>هذه رسالة اختبار من <b>cPanel Drive Archiver</b>. ' +
        'استلامك لهذه الرسالة يعني أن نظام الإشعارات يعمل بنجاح ✅</p>' +
        '<p style="color:#5f6368;margin-top:24px;">' +
        'أُرسلت في: ' + new Date().toLocaleString('ar') + '</p>');
    return this.send_('🧪 اختبار إشعارات cPanel Archiver', html);
  }

  // ---------- Internal: send ----------

  /** @private */
  send_(subject, htmlBody) {
    try {
      GmailApp.sendEmail(this.email_, subject, this.stripHtml_(htmlBody), {
        htmlBody: htmlBody,
        name: 'cPanel Drive Archiver',
      });
      return { sent: true };
    } catch (e) {
      logError('[Notifier] send failed', String(e));
      // محاولة احتياطية عبر MailApp (حصة مختلفة)
      try {
        MailApp.sendEmail({
          to: this.email_, subject: subject, htmlBody: htmlBody,
          body: this.stripHtml_(htmlBody), name: 'cPanel Drive Archiver',
        });
        return { sent: true };
      } catch (e2) {
        return { sent: false, error: String(e2) };
      }
    }
  }

  /** @private */
  stripHtml_(html) {
    return String(html).replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ').trim();
  }

  // ---------- Internal: templates ----------

  /** @private */
  buildDailySubject_(stats) {
    const done = stats.success + stats.versioned;
    if (stats.failed > 0) {
      return '⚠️ تقرير الأرشفة اليومي — ' + done +
             ' ناجح، ' + stats.failed + ' فشل';
    }
    if (done === 0 && stats.skipped === 0) {
      return 'ℹ️ تقرير الأرشفة اليومي — لا نشاط خلال 24 ساعة';
    }
    return '✅ تقرير الأرشفة اليومي — ' + done + ' ملف مؤرشف';
  }

  /** @private */
  buildDailyHtml_(stats, from, to) {
    const dur = Math.round(stats.durationMs / 1000);
    const kpis =
      this.kpi_(stats.success, 'نجاح', '#1b5e20', '#e8f5e9') +
      this.kpi_(stats.versioned, 'إصدار جديد', '#0d47a1', '#e3f2fd') +
      this.kpi_(stats.skipped, 'مكرر (تخطّى)', '#4e342e', '#efebe9') +
      this.kpi_(stats.failed, 'فشل', '#b71c1c', '#ffebee');

    const pending = stats.pendingManual > 0
      ? '<div style="background:#fff3e0;border-right:4px solid #f57c00;' +
        'padding:12px 16px;border-radius:6px;margin-top:16px;">' +
        '<b>⚠️ طابور يدوي:</b> ' + stats.pendingManual +
        ' ملف بحاجة لتدخل يدوي. افتح الواجهة لإعادة المحاولة.' +
        '</div>'
      : '';

    const failedList = stats.failedFiles.length > 0
      ? '<h3 style="margin-top:24px;color:#b71c1c;">الملفات الفاشلة</h3>' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
        '<tr style="background:#fafafa;">' +
        '<th style="text-align:right;padding:8px;border-bottom:1px solid #e0e0e0;">الاسم</th>' +
        '<th style="text-align:right;padding:8px;border-bottom:1px solid #e0e0e0;">الحجم</th>' +
        '<th style="text-align:right;padding:8px;border-bottom:1px solid #e0e0e0;">السبب</th>' +
        '</tr>' +
        stats.failedFiles.slice(0, 20).map(function(f) {
          return '<tr>' +
            '<td style="padding:8px;border-bottom:1px solid #f1f3f4;">' +
              escapeHtml_(f.name) + '</td>' +
            '<td style="padding:8px;border-bottom:1px solid #f1f3f4;">' +
              formatBytes(f.size) + '</td>' +
            '<td style="padding:8px;border-bottom:1px solid #f1f3f4;' +
              'color:#5f6368;">' + escapeHtml_(f.error) + '</td>' +
          '</tr>';
        }).join('') +
        '</table>' +
        (stats.failedFiles.length > 20
          ? '<p style="color:#5f6368;font-size:12px;">' +
            '(+' + (stats.failedFiles.length - 20) + ' ملف إضافي)</p>'
          : '')
      : '';

    const rangeText = from.toLocaleString('ar') + ' → ' +
                      to.toLocaleString('ar');

    const body =
      '<p style="color:#5f6368;margin:0 0 16px;">' + rangeText + '</p>' +
      '<table cellpadding="0" cellspacing="0" style="width:100%;' +
      'border-collapse:separate;border-spacing:8px;">' +
      '<tr>' + kpis + '</tr></table>' +
      '<div style="background:#f8f9fa;border-radius:6px;padding:16px;' +
      'margin-top:16px;">' +
      '<div style="display:flex;justify-content:space-between;">' +
      '<span><b>إجمالي الحجم المؤرشف:</b> ' + formatBytes(stats.totalBytes) +
      '</span><span style="margin-right:24px;"><b>الوقت:</b> ' + dur +
      ' ثانية</span></div></div>' +
      pending + failedList +
      '<p style="margin-top:24px;">' +
      '<a href="' + this.logger_.getSheetUrl() +
      '" style="color:#1a73e8;">📋 عرض السجل الكامل</a></p>';

    return this.wrapShell_('📊 تقرير الأرشفة اليومي', body);
  }

  /** @private */
  buildWeeklyHtml_(stats, from, to) {
    const body =
      '<p style="color:#5f6368;margin:0 0 16px;">' +
      from.toLocaleDateString('ar') + ' → ' +
      to.toLocaleDateString('ar') + '</p>' +
      '<table cellpadding="0" cellspacing="0" style="width:100%;' +
      'border-collapse:separate;border-spacing:8px;"><tr>' +
      this.kpi_(stats.success + stats.versioned, 'ملف جديد',
                '#1b5e20', '#e8f5e9') +
      this.kpi_(stats.skipped, 'مكرر',     '#4e342e', '#efebe9') +
      this.kpi_(stats.failed,  'فشل',      '#b71c1c', '#ffebee') +
      '</tr></table>' +
      '<div style="background:#f8f9fa;border-radius:6px;padding:16px;' +
      'margin-top:16px;"><b>الحجم الإجمالي:</b> ' +
      formatBytes(stats.totalBytes) + '<br>' +
      '<b>إجمالي المحاولات:</b> ' + stats.total + '<br>' +
      '<b>الوقت الكلي:</b> ' + Math.round(stats.durationMs / 1000) +
      ' ثانية</div>' +
      '<p style="margin-top:24px;"><a href="' +
      this.logger_.getSheetUrl() + '" style="color:#1a73e8;">' +
      '📋 عرض السجل الكامل</a></p>';

    return this.wrapShell_('📈 التقرير الأسبوعي', body);
  }

  /** @private */
  buildAlertHtml_(ctx) {
    const body =
      '<div style="background:#ffebee;border-right:4px solid #c62828;' +
      'padding:16px;border-radius:6px;">' +
      '<h3 style="margin:0 0 8px;color:#b71c1c;">' +
      escapeHtml_(ctx.title || 'فشل غير متوقع') + '</h3>' +
      (ctx.fileName
        ? '<p style="margin:4px 0;"><b>الملف:</b> ' +
          escapeHtml_(ctx.fileName) + '</p>'
        : '') +
      '<p style="margin:4px 0;color:#5f6368;">' +
      escapeHtml_(ctx.detail || '') + '</p>' +
      '<p style="margin:12px 0 0;font-size:12px;color:#9e9e9e;">' +
      'وقت الحدث: ' + new Date().toLocaleString('ar') + '</p></div>' +
      '<p style="margin-top:24px;"><a href="' +
      this.logger_.getSheetUrl() + '" style="color:#1a73e8;">' +
      '📋 عرض السجل الكامل</a></p>';
    return this.wrapShell_('⚠️ تنبيه فشل', body);
  }

  /** @private */
  kpi_(value, label, fg, bg) {
    return '<td style="padding:0;width:25%;">' +
      '<div style="background:' + bg + ';padding:16px 8px;' +
      'border-radius:8px;text-align:center;">' +
      '<div style="font-size:26px;font-weight:700;color:' + fg + ';">' +
      value + '</div><div style="font-size:12px;color:' + fg +
      ';opacity:0.8;">' + label + '</div></div></td>';
  }

  /** @private */
  wrapShell_(title, bodyHtml) {
    return '<!doctype html><html dir="rtl" lang="ar"><head>' +
      '<meta charset="utf-8"><title>' + escapeHtml_(title) +
      '</title></head><body style="margin:0;background:#f1f3f4;' +
      'font-family:Segoe UI,Tahoma,Cairo,Arial,sans-serif;color:#202124;">' +
      '<div style="max-width:640px;margin:24px auto;background:#fff;' +
      'border-radius:12px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">' +
      '<h1 style="margin:0 0 16px;font-size:22px;color:#1a73e8;">' +
      escapeHtml_(title) + '</h1>' + bodyHtml +
      '<hr style="margin:24px 0;border:none;border-top:1px solid #e0e0e0;">' +
      '<p style="font-size:11px;color:#9e9e9e;margin:0;">' +
      'cPanel Drive Archiver · رسالة تلقائية</p>' +
      '</div></body></html>';
  }
}

/**
 * Minimal HTML escape for user-supplied strings in email templates.
 * @param {string} s
 * @return {string}
 */
function escapeHtml_(s) {
  return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
}

// ============================================================
// Trigger handlers (referenced by Scheduler.gs installers)
// ============================================================

/** Daily digest trigger entry point. */
function sendDailyReportTrigger() {
  try {
    const res = new Notifier().sendDailyReport();
    if (!res.sent) logWarn('[Notifier] daily not sent', res);
  } catch (e) {
    logError('[Notifier] daily trigger failed', String(e));
  }
}

/** Weekly summary trigger entry point. */
function sendWeeklyReportTrigger() {
  try {
    const res = new Notifier().sendWeeklyReport();
    if (!res.sent) logWarn('[Notifier] weekly not sent', res);
  } catch (e) {
    logError('[Notifier] weekly trigger failed', String(e));
  }
}
