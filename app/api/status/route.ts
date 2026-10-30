import { NextResponse } from 'next/server';
import { readRunState, nextScheduledRun, CRON_DESCRIPTION } from '@/lib/runs';
import { emailConfig } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const state = await readRunState();
    const lockActive = !!state.lock && new Date(state.lock.expiresAt).getTime() > Date.now();
    const finished = state.runs.filter(r => r.status !== 'running');
    const email = emailConfig();
    return NextResponse.json({
      ok: true,
      schedule: {
        description: CRON_DESCRIPTION,
        nextRunAt: nextScheduledRun(),
        // Booleans only; secret values are never returned.
        cronSecretConfigured: (process.env.CRON_SECRET || '').length >= 16,
        deployedOnVercel: process.env.VERCEL === '1',
      },
      running: lockActive ? state.lock : null,
      lastRun: finished[0] || null,
      lastScheduledRun: finished.find(r => r.trigger === 'cron') || null,
      recentErrors: state.runs.filter(r => r.status === 'failed' || (r.sourceErrors?.length ?? 0) > 0 || r.email?.status === 'failed').slice(0, 5),
      runs: state.runs.slice(0, 10),
      email: { enabled: email.enabled, configured: email.configured, missing: email.missing },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Status read failed', error);
    return NextResponse.json({ error: 'Could not read discovery status.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
