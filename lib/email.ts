// Daily report delivery through Resend's HTTP API.
// Sending is off unless EMAIL_REPORTS_ENABLED=true is set — that flag is the owner's
// standing approval to send the daily report to REPORT_EMAIL_TO only. This module never
// emails employers or recruiters.

export type EmailConfig = {
  enabled: boolean;
  configured: boolean;
  missing: string[];
  to?: string;
};

export function emailConfig(): EmailConfig {
  const missing = ['RESEND_API_KEY', 'REPORT_EMAIL_TO', 'REPORT_EMAIL_FROM'].filter(k => !process.env[k]);
  return {
    enabled: process.env.EMAIL_REPORTS_ENABLED === 'true',
    configured: missing.length === 0,
    missing,
    to: process.env.REPORT_EMAIL_TO,
  };
}

export async function sendReportEmail(subject: string, text: string, html: string): Promise<{ id: string }> {
  const cfg = emailConfig();
  if (!cfg.configured) throw new Error(`Email is not configured; missing ${cfg.missing.join(', ')}.`);

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.REPORT_EMAIL_FROM,
      to: [process.env.REPORT_EMAIL_TO],
      subject,
      text,
      html,
    }),
    signal: AbortSignal.timeout(15000),
  });

  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Resend rejected the email (HTTP ${r.status}): ${body?.message || body?.name || 'unknown error'}`);
  return { id: String(body.id || '') };
}
