import { NextResponse } from 'next/server';
import { readJobs } from '@/lib/store';
import { profile } from '@/lib/profile';
import { buildReport } from '@/lib/report';
import { emailConfig, sendReportEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Preview of the daily report; never sends anything.
export async function GET() {
  try {
    const r = buildReport(await readJobs(), profile);
    return NextResponse.json({
      ok: true,
      subject: r.subject,
      text: r.text,
      counts: { newJobs: r.newJobs.length, topMatches: r.topMatches.length, eligibilityConcerns: r.eligibilityConcerns.length, pendingDrafts: r.pendingDrafts.length, followUps: r.followUps.length },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Report preview failed', error);
    return NextResponse.json({ error: 'Could not build the report.' }, { status: 503 });
  }
}

// Sends one test report to REPORT_EMAIL_TO, only when the owner explicitly confirms.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body.action !== 'send-test' || body.confirm !== true) {
    return NextResponse.json({ error: 'Explicit confirmation is required to send a test email.' }, { status: 400 });
  }
  const cfg = emailConfig();
  if (!cfg.configured) {
    return NextResponse.json({ error: `Email is not configured. Missing: ${cfg.missing.join(', ')}.` }, { status: 503 });
  }
  try {
    const r = buildReport(await readJobs(), profile);
    const sent = await sendReportEmail(`[Test] ${r.subject}`, r.text, r.html);
    return NextResponse.json({ ok: true, id: sent.id, to: cfg.to });
  } catch (error: any) {
    console.error('Test report email failed', error);
    return NextResponse.json({ error: String(error?.message || 'Email failed') }, { status: 502 });
  }
}
