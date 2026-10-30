import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { readJobs } from '@/lib/store';
import { profile } from '@/lib/profile';
import { runDiscovery } from '@/lib/discovery';
import { acquireRun, finishRun, logSkipped, slotFor, isDigestSlot, type RunRecord } from '@/lib/runs';
import { buildReport } from '@/lib/report';
import { emailConfig, sendReportEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const noStore = { 'Cache-Control': 'no-store' };

// Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set.
function authorized(req: Request): 'ok' | 'unconfigured' | 'denied' {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return 'unconfigured';
  const given = Buffer.from(req.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected) ? 'ok' : 'denied';
}

export async function GET(req: Request) {
  const auth = authorized(req);
  if (auth === 'unconfigured') {
    console.error('Scheduled discovery refused: CRON_SECRET is not configured.');
    return NextResponse.json({ error: 'Scheduled discovery is not configured.' }, { status: 503, headers: noStore });
  }
  if (auth === 'denied') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers: noStore });
  }

  const slot = slotFor();
  let acquired: Awaited<ReturnType<typeof acquireRun>>;
  try {
    acquired = await acquireRun('cron', slot);
  } catch (error) {
    console.error('Scheduled discovery could not read run state', error);
    return NextResponse.json({ error: 'Run state unavailable; nothing was changed.' }, { status: 503, headers: noStore });
  }

  if (!acquired.ok) {
    console.warn(`Scheduled discovery skipped: ${acquired.detail}`);
    await logSkipped('cron', slot, acquired.detail).catch(e => console.error('Could not log skipped run', e));
    return NextResponse.json({ ok: true, skipped: acquired.reason, detail: acquired.detail }, { status: 409, headers: noStore });
  }

  const runId = acquired.runId;
  try {
    const result = await runDiscovery();
    const patch: Partial<RunRecord> = {
      status: 'succeeded',
      added: result.added,
      recommendedAdded: result.recommendedAdded,
      checked: result.checked,
      sourceErrors: result.sourceErrors,
    };

    const cfg = emailConfig();
    if (!isDigestSlot(slot)) patch.email = { status: 'disabled', detail: 'Email digest is sent by the first run of each day only' };
    else if (!cfg.enabled) patch.email = { status: 'disabled', detail: 'EMAIL_REPORTS_ENABLED is not true' };
    else if (!cfg.configured) patch.email = { status: 'not_configured', detail: `Missing ${cfg.missing.join(', ')}` };
    else {
      try {
        const report = buildReport(await readJobs(), profile);
        const sent = await sendReportEmail(report.subject, report.text, report.html);
        patch.email = { status: 'sent', detail: `Resend id ${sent.id}` };
      } catch (error: any) {
        // Discovery already succeeded; record the email failure without failing the run.
        console.error('Daily report email failed', error);
        patch.email = { status: 'failed', detail: String(error?.message || error).slice(0, 300) };
      }
    }

    await finishRun(runId, patch);
    return NextResponse.json({ ok: true, runId, ...patch }, { headers: noStore });
  } catch (error: any) {
    console.error('Scheduled discovery failed', error);
    await finishRun(runId, { status: 'failed', error: String(error?.message || error).slice(0, 300) })
      .catch(e => console.error('Could not record failed run', e));
    return NextResponse.json({ error: 'Scheduled discovery failed; existing jobs were left unchanged.', runId }, { status: 500, headers: noStore });
  }
}
