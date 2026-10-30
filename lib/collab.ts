// Collaboration inbox: people with a product who want to work with the designer.
// Stored as a small JSON document beside jobs.json (same conditional-write protection).
import { updateDoc, readDoc } from './store';
import { COLLAB_STAGES, clean, type CollabLead, type CollabStage, type Submission } from './collab-schema';

export { COLLAB_STAGES, COLLAB_DEALS, parseSubmission, type CollabLead, type CollabStage, type Submission } from './collab-schema';

type CollabDoc = { leads: CollabLead[] };
const DOC = 'collab';
const empty: CollabDoc = { leads: [] };
const MAX_LEADS = 500;
const MAX_PER_HOUR = 10;

export type AddResult = { status: 'added' | 'duplicate' | 'rate_limited'; lead?: CollabLead };

export async function addLead(sub: Submission): Promise<AddResult> {
  let result: AddResult = { status: 'added' };
  const now = Date.now();
  await updateDoc<CollabDoc>(DOC, empty, current => {
    const leads = current.leads || [];
    const recent = leads.filter(l => now - new Date(l.receivedAt).getTime() < 3600_000);
    if (recent.some(l => l.email === sub.email && l.message === sub.message)) {
      result = { status: 'duplicate' };
      return current;
    }
    if (recent.length >= MAX_PER_HOUR) {
      result = { status: 'rate_limited' };
      return current;
    }
    const lead: CollabLead = {
      ...sub,
      id: `lead-${now}-${Math.random().toString(36).slice(2, 8)}`,
      receivedAt: new Date(now).toISOString(),
      status: 'New',
    };
    result = { status: 'added', lead };
    return { leads: [lead, ...leads].slice(0, MAX_LEADS) };
  });
  return result;
}

export async function readLeads(): Promise<CollabLead[]> {
  return (await readDoc<CollabDoc>(DOC, empty)).leads || [];
}

export async function updateLead(id: string, patch: { status?: string; notes?: string }): Promise<CollabLead | null> {
  let found: CollabLead | null = null;
  await updateDoc<CollabDoc>(DOC, empty, current => ({
    leads: (current.leads || []).map(l => {
      if (l.id !== id) return l;
      found = {
        ...l,
        ...(patch.status && (COLLAB_STAGES as readonly string[]).includes(patch.status) ? { status: patch.status as CollabStage } : {}),
        ...(patch.notes !== undefined ? { notes: clean(patch.notes, 2000) } : {}),
        updatedAt: new Date().toISOString(),
      };
      return found;
    }),
  }));
  return found;
}
