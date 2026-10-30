// Tailored application drafts built only from verified profile facts and the job listing.
// Drafts are always saved for human review; nothing here sends or submits anything.
import type { Job } from './store';
import type { Profile } from './profile';
import type { Classification } from './matching';

export type DraftResult = { draft: string; factsUsed: string[]; reviewChecklist: string[] };

export function buildDraft(job: Job, c: Classification, p: Profile): DraftResult {
  const text = `${job.title} ${job.description || ''}`.toLowerCase();
  const skills = p.skills.filter(s => s.keywords.some(k => text.includes(k)));
  const domains = new Set(skills.map(s => s.label));
  const projects = p.projects.filter(pr => pr.domains.some(d => domains.has(d))).slice(0, 2);
  const shownProjects = projects.length ? projects : p.projects.slice(0, 2);

  const factsUsed = [
    `${p.yearsExperience} years in UX/UI design (${p.source})`,
    `Based in ${p.location}`,
    ...skills.map(s => `${s.label} — ${s.evidence}`),
    ...shownProjects.map(pr => `Project: ${pr.title}`),
  ];

  const strengths = skills.length
    ? skills.slice(0, 3).map(s => s.label.toLowerCase()).join(', ')
    : 'UX research, UI/visual design and end-to-end product design';

  const projectLines = shownProjects.map(pr => `• ${pr.title}: ${pr.summary}.`).join('\n');

  const eligibilityLine =
    c.eligibility === 'india_listed'
      ? `I am based in ${p.location} and available to work remotely.`
      : `I am based in ${p.location} and work remotely. Could you confirm that this role is open to candidates based in India?`;

  const draft = [
    `Hi ${job.company} team,`,
    '',
    `I'm applying for the ${job.title} role. I'm a product designer with ${p.yearsExperience} years of UX/UI experience, and my work centres on ${strengths}.`,
    '',
    'Relevant work:',
    projectLines,
    '',
    eligibilityLine,
    '',
    `Portfolio: ${p.portfolioUrl || '[add portfolio link]'}`,
    ...(p.cvUrl ? [`CV: ${p.cvUrl}`] : []),
    '',
    'Thank you for considering my application.',
    '',
    p.name,
    p.email,
  ].join('\n');

  const reviewChecklist = [
    'Read the full listing on the employer site and confirm requirements',
    'Confirm India eligibility, time-zone and contract type with the employer',
    p.portfolioUrl ? 'Check that the portfolio link opens' : 'Replace [add portfolio link] with your portfolio URL',
    'Edit tone and details; add anything verified the listing asks for',
  ];

  return { draft, factsUsed, reviewChecklist };
}
