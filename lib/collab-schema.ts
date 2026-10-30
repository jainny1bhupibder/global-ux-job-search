// Collaboration lead types and form validation (no storage access, so it can be unit tested).

export const COLLAB_STAGES = ['New', 'Interested', 'Talking', 'Working together', 'Passed'] as const;
export const COLLAB_DEALS = ['Paid contract', 'Full-time', 'Equity', 'Revenue share', 'Co-founding', 'Not sure yet'] as const;

export type CollabStage = (typeof COLLAB_STAGES)[number];

export type CollabLead = {
  id: string;
  receivedAt: string;
  name: string;
  email: string;
  product: string;
  link?: string;
  stage: string;
  need: string;
  deal: string;
  message: string;
  status: CollabStage;
  notes?: string;
  updatedAt?: string;
};

export const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

export type Submission = Omit<CollabLead, 'id' | 'receivedAt' | 'status' | 'notes' | 'updatedAt'>;

// Returns the cleaned submission or a message the visitor can act on.
export function parseSubmission(body: any): { ok: true; value: Submission } | { ok: false; error: string } {
  const value: Submission = {
    name: clean(body?.name, 100),
    email: clean(body?.email, 200).toLowerCase(),
    product: clean(body?.product, 150),
    link: clean(body?.link, 300) || undefined,
    stage: clean(body?.stage, 60),
    need: clean(body?.need, 200),
    deal: (COLLAB_DEALS as readonly string[]).includes(body?.deal) ? body.deal : 'Not sure yet',
    message: clean(body?.message, 3000),
  };
  if (!value.name) return { ok: false, error: 'Please enter your name.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.email)) return { ok: false, error: 'Please enter a valid email address.' };
  if (!value.product) return { ok: false, error: 'Please tell me what your product is.' };
  if (value.message.length < 20) return { ok: false, error: 'Please add a few sentences about what you want to build together.' };
  if (value.link && !/^https?:\/\//i.test(value.link)) return { ok: false, error: 'The product link must start with http:// or https://.' };
  return { ok: true, value };
}
