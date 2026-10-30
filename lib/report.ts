import type { Job } from './store';
import type { Profile } from './profile';
import { enrich, rank, type EnrichedJob } from './matching';

export type Report = {
  generatedAt: string;
  subject: string;
  newJobs: EnrichedJob[];
  topMatches: EnrichedJob[];
  eligibilityConcerns: EnrichedJob[];
  pendingDrafts: EnrichedJob[];
  followUps: EnrichedJob[];
  text: string;
  html: string;
};

const DAY = 86400000;
const active = new Set(['Applied', 'Interview']);

export function buildReport(jobs: Job[], p: Profile, now = new Date()): Report {
  const all = rank(enrich(jobs, p));
  const recommended = all.filter(j => j.classification.recommended);
  const since = now.getTime() - DAY;

  const newJobs = recommended.filter(j => j.discoveredAt && new Date(j.discoveredAt).getTime() >= since);
  const topMatches = recommended.filter(j => !['Applied', 'Interview', 'Offer', 'Rejected', 'Withdrawn'].includes(j.status || '')).slice(0, 5);
  const eligibilityConcerns = recommended.filter(j => j.classification.eligibility === 'uncertain').slice(0, 10);
  const pendingDrafts = all.filter(j => j.draft && !j.appliedAt && j.status !== 'Applied');
  const followUps = all
    .filter(j => j.followUpAt && (active.has(j.status || '') || j.appliedAt) && new Date(j.followUpAt).getTime() <= now.getTime() + 7 * DAY)
    .sort((a, b) => new Date(a.followUpAt!).getTime() - new Date(b.followUpAt!).getTime());

  const date = now.toISOString().slice(0, 10);
  const subject = `UX job report ${date}: ${newJobs.length} new, ${pendingDrafts.length} drafts to review`;

  const line = (j: EnrichedJob) =>
    `${j.title} — ${j.company} (${j.location || 'location not specified'}) · match ${j.match.score}%${j.sourceUrl ? ` · ${j.sourceUrl}` : ''}`;
  const section = (title: string, items: EnrichedJob[], fmt: (j: EnrichedJob) => string, empty: string) =>
    [title, ...(items.length ? items.map(j => `• ${fmt(j)}`) : [`• ${empty}`]), ''];

  const text = [
    subject,
    '',
    ...section('NEW RECOMMENDED JOBS (last 24 hours)', newJobs, line, 'No new recommended roles.'),
    ...section('TOP MATCHES', topMatches, j => `${line(j)}\n    ${j.match.lines.map(l => `${l.factor} ${l.points}/${l.max}: ${l.reason}`).join('\n    ')}`, 'No open recommended roles.'),
    ...section('ELIGIBILITY CONCERNS', eligibilityConcerns, j => `${j.title} — ${j.company}: ${j.classification.eligibilityNote}`, 'None.'),
    ...section('DRAFTS AWAITING YOUR REVIEW', pendingDrafts, j => `${j.title} — ${j.company} (${j.approvedAt ? 'approved, not yet submitted' : 'not yet approved'})`, 'None.'),
    ...section('FOLLOW-UPS DUE IN THE NEXT 7 DAYS', followUps, j => `${j.followUpAt!.slice(0, 10)} — ${j.title} at ${j.company} (${j.status})`, 'None.'),
    'Nothing has been submitted or sent to employers. Review each listing on the employer site before applying.',
  ].join('\n');

  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const htmlItem = (j: EnrichedJob, extra = '') =>
    `<li><strong>${esc(j.title)}</strong> — ${esc(j.company)} · ${esc(j.location || 'location not specified')} · match ${j.match.score}%${j.sourceUrl ? ` · <a href="${esc(j.sourceUrl)}">listing</a>` : ''}${extra}</li>`;
  const htmlSection = (title: string, items: string[], empty: string) =>
    `<h3>${title}</h3><ul>${items.length ? items.join('') : `<li>${empty}</li>`}</ul>`;

  const html = `<div style="font-family:system-ui,sans-serif;max-width:640px">
<h2>${esc(subject)}</h2>
${htmlSection('New recommended jobs (last 24 hours)', newJobs.map(j => htmlItem(j)), 'No new recommended roles.')}
${htmlSection('Top matches', topMatches.map(j => htmlItem(j, `<br><small>${j.match.lines.map(l => esc(`${l.factor} ${l.points}/${l.max}: ${l.reason}`)).join('<br>')}</small>`)), 'No open recommended roles.')}
${htmlSection('Eligibility concerns', eligibilityConcerns.map(j => `<li>${esc(j.title)} — ${esc(j.company)}: ${esc(j.classification.eligibilityNote)}</li>`), 'None.')}
${htmlSection('Drafts awaiting your review', pendingDrafts.map(j => `<li>${esc(j.title)} — ${esc(j.company)} (${j.approvedAt ? 'approved, not yet submitted' : 'not yet approved'})</li>`), 'None.')}
${htmlSection('Follow-ups due in the next 7 days', followUps.map(j => `<li>${j.followUpAt!.slice(0, 10)} — ${esc(j.title)} at ${esc(j.company)} (${esc(j.status || '')})</li>`), 'None.')}
<p style="color:#666">Nothing has been submitted or sent to employers. Review each listing on the employer site before applying.</p>
</div>`;

  return { generatedAt: now.toISOString(), subject, newJobs, topMatches, eligibilityConcerns, pendingDrafts, followUps, text, html };
}
