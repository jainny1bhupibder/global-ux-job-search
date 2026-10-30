// Discovery run state: a lock shared by manual and scheduled runs, a record of
// completed scheduled slots (so duplicate cron deliveries are skipped) and a run log.
import { readDoc, updateDoc } from './store';
import { slotFor } from './schedule';

export { CRON_SCHEDULE, CRON_DESCRIPTION, slotFor, isDigestSlot, nextScheduledRun } from './schedule';

export type RunRecord = {
  runId: string;
  trigger: 'cron' | 'manual';
  slot?: string;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'succeeded' | 'failed' | 'skipped';
  added?: number;
  recommendedAdded?: number;
  checked?: number;
  sourceErrors?: string[];
  error?: string;
  email?: { status: 'sent' | 'disabled' | 'not_configured' | 'failed'; detail?: string };
};

export type RunState = {
  lock: { runId: string; trigger: RunRecord['trigger']; startedAt: string; expiresAt: string } | null;
  completedSlots: string[];
  runs: RunRecord[];
};

const DOC = 'runs';
const empty: RunState = { lock: null, completedSlots: [], runs: [] };
const LOCK_MS = 10 * 60 * 1000;

export const readRunState = () => readDoc<RunState>(DOC, empty);

// A single shape: discriminated unions do not narrow with strict mode off (tsconfig).
export type Acquire = { ok: boolean; runId?: string; reason?: 'locked' | 'already_completed'; detail?: string };

export async function acquireRun(trigger: RunRecord['trigger'], slot?: string): Promise<Acquire> {
  const runId = `${trigger}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  let outcome: Acquire = { ok: true, runId };

  await updateDoc<RunState>(DOC, empty, state => {
    const s = { ...empty, ...state };
    if (s.lock && new Date(s.lock.expiresAt).getTime() > now.getTime()) {
      outcome = { ok: false, reason: 'locked', detail: `Run ${s.lock.runId} (${s.lock.trigger}) started at ${s.lock.startedAt} is still in progress.` };
      return s;
    }
    if (slot && s.completedSlots.includes(slot)) {
      outcome = { ok: false, reason: 'already_completed', detail: `Scheduled run for ${slot} already completed.` };
      return s;
    }
    outcome = { ok: true, runId };
    return {
      ...s,
      lock: { runId, trigger, startedAt: now.toISOString(), expiresAt: new Date(now.getTime() + LOCK_MS).toISOString() },
      runs: [{ runId, trigger, slot, startedAt: now.toISOString(), status: 'running' as const }, ...s.runs].slice(0, 50),
    };
  });

  return outcome;
}

export async function finishRun(runId: string, patch: Partial<RunRecord>): Promise<void> {
  await updateDoc<RunState>(DOC, empty, state => {
    const s = { ...empty, ...state };
    const run = s.runs.find(r => r.runId === runId);
    const done = { ...run, ...patch, finishedAt: new Date().toISOString() } as RunRecord;
    return {
      lock: s.lock?.runId === runId ? null : s.lock,
      completedSlots:
        done.status === 'succeeded' && done.slot && !s.completedSlots.includes(done.slot)
          ? [done.slot, ...s.completedSlots].slice(0, 60)
          : s.completedSlots,
      runs: s.runs.map(r => (r.runId === runId ? done : r)),
    };
  });
}

export async function logSkipped(trigger: RunRecord['trigger'], slot: string | undefined, detail: string): Promise<void> {
  const at = new Date().toISOString();
  await updateDoc<RunState>(DOC, empty, state => {
    const s = { ...empty, ...state };
    return {
      ...s,
      runs: [{ runId: `${trigger}-skip-${Date.now()}`, trigger, slot, startedAt: at, finishedAt: at, status: 'skipped' as const, error: detail }, ...s.runs].slice(0, 50),
    };
  });
}
