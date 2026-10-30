import { NextResponse } from 'next/server';
import { readJobs, updateJobs, type Job } from '@/lib/store';
import { profile } from '@/lib/profile';
import { classify, enrich, rank } from '@/lib/matching';
import { buildDraft } from '@/lib/drafts';

export const runtime = 'nodejs';

// Set only by the dedicated actions below so approval and application history stay trustworthy.
const protectedFields = ['id', 'approvedAt', 'appliedAt', 'draftHistory', 'handoff', 'discoveredAt'];
const handoffReasons = ['CAPTCHA', 'Login required', 'Unsupported form', 'External portal', 'Other'];
const preSubmitStatuses = new Set([undefined, '', 'Discovered', 'Shortlisted', 'Draft ready for review', 'Approved to apply']);
const dupKey = (j: Job) => `${j.company}|${j.title}`.toLowerCase().replace(/[^a-z0-9|]+/g, ' ').trim();
const noStore = { 'Cache-Control': 'no-store' };

class ActionError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

// Keep the previous draft whenever its text is replaced; any change also withdraws approval.
function withDraft(job: Job, draft: string, at: string): Job {
  if (job.draft === draft) return job;
  const history = job.draft ? [{ draft: job.draft, savedAt: job.updatedAt || at }, ...(job.draftHistory || [])].slice(0, 20) : job.draftHistory;
  return {
    ...job,
    draft,
    draftHistory: history,
    approvedAt: undefined,
    status: job.status === 'Approved to apply' ? 'Draft ready for review' : job.status,
  };
}

function recordApplied(current: Job[], job: Job, confirmDuplicate: boolean, at: string): Job {
  if (job.appliedAt) {
    throw new ActionError(`Already recorded as applied on ${job.appliedAt.slice(0, 10)}.`, 409, 'already_applied');
  }
  const twin = current.find(j => j.id !== job.id && j.appliedAt && dupKey(j) === dupKey(job));
  if (twin && !confirmDuplicate) {
    throw new ActionError(`You already applied to "${twin.title}" at ${twin.company} on ${twin.appliedAt!.slice(0, 10)}.`, 409, 'possible_duplicate');
  }
  return {
    ...job,
    appliedAt: at,
    status: 'Applied',
    followUpAt: job.followUpAt || new Date(Date.parse(at) + 7 * 86400000).toISOString().slice(0, 10),
  };
}

async function mutateOne(id: string, fn: (job: Job, current: Job[]) => Job): Promise<Job[]> {
  let found = false;
  const at = new Date().toISOString();
  const jobs = await updateJobs(current => current.map(item => {
    if (item.id !== id) return item;
    found = true;
    return { ...fn(item, current), updatedAt: at };
  }));
  if (!found) throw new ActionError('Job not found.', 404);
  return jobs;
}

const respond = (jobs: Job[], extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: true, jobs: rank(enrich(jobs, profile)), ...extra }, { headers: noStore });

export async function GET() {
  try {
    return NextResponse.json(
      { ok: true, jobs: rank(enrich(await readJobs(), profile)), profile: { name: profile.name, location: profile.location, yearsExperience: profile.yearsExperience, source: profile.source, salaryScored: profile.salaryMinUsd !== null } },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Job read failed safely', error);
    return NextResponse.json(
      { error: 'Could not read job storage. Check configuration and initialization.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function POST(req: Request) {
  let body: any;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request.' }, { status: 400 });
  }

  try {
    if (body.action === 'upsert' && body.job) {
      const job = body.job as Job;

      if (
        typeof job.id !== 'string' || !job.id.trim() ||
        typeof job.title !== 'string' ||
        typeof job.company !== 'string'
      ) {
        return NextResponse.json(
          { error: 'A valid job ID, title, and company are required.' },
          { status: 400 }
        );
      }

      const jobs = await updateJobs(current => {
        const index = current.findIndex(item => item.id === job.id);
        return index >= 0
          ? current.map((item, i) => i === index ? { ...item, ...job } : item)
          : [job, ...current];
      });

      return respond(jobs);
    }

    if (body.action === 'update' && body.id && body.patch &&
        typeof body.patch === 'object' && !Array.isArray(body.patch)) {
      if (Object.prototype.hasOwnProperty.call(body.patch, 'id')) {
        return NextResponse.json({ error: 'Job IDs cannot be changed.' }, { status: 400 });
      }
      const blocked = protectedFields.filter(f => Object.prototype.hasOwnProperty.call(body.patch, f));
      if (blocked.length) {
        return NextResponse.json({ error: `These fields are set by dedicated actions: ${blocked.join(', ')}.` }, { status: 400 });
      }

      const { draft, ...rest } = body.patch;
      const at = new Date().toISOString();
      const jobs = await mutateOne(body.id, (item, current) => {
        let next: Job = typeof draft === 'string' ? withDraft(item, draft, at) : item;
        const { status, ...fields } = rest;
        next = { ...next, ...fields };
        if (status === 'Applied' && !next.appliedAt) return recordApplied(current, next, body.confirmDuplicate === true, at);
        return status === undefined ? next : { ...next, status };
      });

      return respond(jobs);
    }

    if (body.action === 'generate-draft' && typeof body.id === 'string') {
      let result: ReturnType<typeof buildDraft> | undefined;
      const at = new Date().toISOString();
      const jobs = await mutateOne(body.id, item => {
        if (item.draft && body.replace !== true) {
          throw new ActionError('A draft already exists. Confirm to replace it; the current draft will be kept in history.', 409, 'draft_exists');
        }
        result = buildDraft(item, classify(item), profile);
        const next = withDraft(item, result.draft, at);
        return preSubmitStatuses.has(next.status) ? { ...next, status: 'Draft ready for review' } : next;
      });
      return respond(jobs, { factsUsed: result!.factsUsed, reviewChecklist: result!.reviewChecklist });
    }

    if (body.action === 'approve' && typeof body.id === 'string') {
      const jobs = await mutateOne(body.id, item => {
        if (!item.draft?.trim()) throw new ActionError('Generate and review a draft before approving.', 400);
        if (item.appliedAt) throw new ActionError('This application is already recorded as submitted.', 409, 'already_applied');
        return { ...item, approvedAt: new Date().toISOString(), status: 'Approved to apply' };
      });
      return respond(jobs);
    }

    if (body.action === 'mark-applied' && typeof body.id === 'string') {
      const at = new Date().toISOString();
      const jobs = await mutateOne(body.id, (item, current) => {
        if (!item.approvedAt) throw new ActionError('Approve the draft before recording the application as submitted.', 400, 'not_approved');
        return { ...recordApplied(current, item, body.confirmDuplicate === true, at), handoff: undefined };
      });
      return respond(jobs);
    }

    if (body.action === 'handoff' && typeof body.id === 'string') {
      if (!handoffReasons.includes(body.reason)) {
        return NextResponse.json({ error: `Reason must be one of: ${handoffReasons.join(', ')}.` }, { status: 400 });
      }
      const jobs = await mutateOne(body.id, item => ({
        ...item,
        handoff: body.clear ? undefined : { reason: body.reason, note: typeof body.note === 'string' ? body.note.slice(0, 500) : undefined, at: new Date().toISOString() },
      }));
      return respond(jobs);
    }

    if (body.action === 'delete' && typeof body.id === 'string' && body.id) {
      let found = false;
      const jobs = await updateJobs(current => {
        found = current.some(item => item.id === body.id);
        return current.filter(item => item.id !== body.id);
      });

      if (!found) {
        return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
      }

      return respond(jobs);
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch (error) {
    if (error instanceof ActionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: noStore });
    }
    console.error('Job update failed safely', error);
    return NextResponse.json(
      { error: 'Could not safely update job storage. Please retry.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
