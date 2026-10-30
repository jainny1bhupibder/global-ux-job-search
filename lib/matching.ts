// Role classification, India eligibility and transparent match scoring.
// Pure functions: results are derived on read and never written back to job records.
import type { Job } from './store';
import type { Profile } from './profile';

export type RoleTier = 'target' | 'adjacent' | 'excluded';
export type Eligibility = 'india_listed' | 'worldwide' | 'region_likely' | 'uncertain' | 'restricted';

export type Classification = {
  tier: RoleTier;
  roleLabel: string;
  seniority: 'junior' | 'mid' | 'senior' | 'lead' | 'director';
  eligibility: Eligibility;
  eligibilityNote: string;
  recommended: boolean;
  hiddenReason?: string;
};

export type ScoreLine = { factor: string; points: number; max: number; reason: string };
export type Match = { score: number; earned: number; possible: number; lines: ScoreLine[]; notScored: string[]; cautions: string[] };

const target = /\b(ux\s*\/\s*ui|ui\s*\/\s*ux|ui\s+ux|ux|ui)\s+designer\b|\bproduct\s+designer\b|\bproduct\s+design\s+lead\b|\blead\s+product\s+design\b/i;
const adjacent = /\b(product design (director|manager)|director of (product )?design|head of (product )?design|design (lead|manager|director)|ux (lead|researcher|manager)|user researcher|design researcher|interaction designer|experience designer|design systems designer|visual designer|web designer|service designer|usability researcher|design strategist)\b/i;
const nonDesign = /\b(product manager|product owner|product specialist|program manager|project manager|engineer(ing)?|developer|devops|data (analyst|scientist)|analyst|sales|account executive|recruiter|marketing|copywriter|writer|trainer|assistant|support|technical product lead|product lead)\b/i;

export function classifyRole(title: string): { tier: RoleTier; roleLabel: string; reason?: string } {
  const t = title || '';
  if (/\b(learning experience|instructional) designer\b/i.test(t)) return { tier: 'excluded', roleLabel: 'Not a design role', reason: 'Instructional/learning design, not UX or product design' };
  if (target.test(t)) return { tier: 'target', roleLabel: 'Target design role' };
  if (adjacent.test(t)) return { tier: 'adjacent', roleLabel: 'Related design role' };
  const hit = t.match(nonDesign);
  if (hit) return { tier: 'excluded', roleLabel: 'Not a design role', reason: `Title indicates a non-design role ("${hit[0]}")` };
  return { tier: 'excluded', roleLabel: 'Not a design role', reason: 'Title does not name a UX, UI or product design role' };
}

export function seniorityOf(title: string): Classification['seniority'] {
  const t = title.toLowerCase();
  if (/\b(director|head of|vp|vice president)\b/.test(t)) return 'director';
  if (/\b(lead|staff|principal)\b/.test(t)) return 'lead';
  if (/\b(senior|sr\.?)\b/.test(t)) return 'senior';
  if (/\b(junior|jr\.?|associate|entry|graduate|intern)\b/.test(t)) return 'junior';
  return 'mid';
}

const worldwide = /\b(worldwide|anywhere|global(ly)?|all countries|any location|international)\b/i;
const regionIncludingIndia = /\b(apac|asia|asia[- ]pacific|south asia|ist\b|utc\s*\+\s*5(:30)?|gmt\s*\+\s*5(:30)?)\b/i;
const unspecified = /^\s*remote\s*$|not specified|unknown|eligibility not specified/i;

export function eligibilityOf(job: Pick<Job, 'location' | 'description'>): { eligibility: Eligibility; note: string } {
  const loc = (job.location || '').trim();
  const desc = job.description || '';
  if (/\bindia\b/i.test(loc)) return { eligibility: 'india_listed', note: `Location lists India ("${loc}")` };
  if (worldwide.test(loc)) {
    return /\b(us|usa|u\.s\.|united states|europe|eu|uk)\b[^.]{0,40}\b(only|required|based|time ?zones?)\b/i.test(desc)
      ? { eligibility: 'uncertain', note: `Listed as "${loc}" but the description mentions a regional requirement — confirm before applying` }
      : { eligibility: 'worldwide', note: `Listed as "${loc}" — India not excluded, but confirm with the employer` };
  }
  if (regionIncludingIndia.test(loc)) return { eligibility: 'region_likely', note: `Region "${loc}" usually includes India — confirm` };
  if (!loc || unspecified.test(loc)) {
    if (/\bindia\b/i.test(desc)) return { eligibility: 'region_likely', note: 'Location not specified; description mentions India — confirm' };
    return { eligibility: 'uncertain', note: 'Eligible countries are not specified — confirm whether India-based candidates are accepted' };
  }
  return { eligibility: 'restricted', note: `Listed for "${loc}", which does not include India` };
}

export function classify(job: Job): Classification {
  const role = classifyRole(job.title);
  const { eligibility, note } = eligibilityOf(job);
  let hiddenReason: string | undefined = role.reason;
  if (!hiddenReason && eligibility === 'restricted') hiddenReason = note;
  return {
    tier: role.tier,
    roleLabel: role.roleLabel,
    seniority: seniorityOf(job.title),
    eligibility,
    eligibilityNote: note,
    recommended: !hiddenReason,
    hiddenReason,
  };
}

const knownTools = ['figma', 'sketch', 'adobe xd', 'framer', 'protopie', 'axure', 'miro', 'webflow', 'html', 'css', 'react'];

function parseSalaryUsd(salary?: string): number | null {
  if (!salary) return null;
  const s = salary.toLowerCase();
  if (!/(usd|\$|us\$)/.test(s) && /[€£₹]|eur|gbp|inr/.test(s)) return null;
  const nums = [...s.matchAll(/(\d[\d,.]*)\s*(k)?/g)]
    .map(m => parseFloat(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1))
    .filter(n => n >= 1000);
  return nums.length ? Math.max(...nums) : null;
}

export function scoreMatch(job: Job, c: Classification, p: Profile): Match {
  const lines: ScoreLine[] = [];
  const notScored: string[] = [];
  const cautions: string[] = [];
  const text = `${job.title} ${job.description || ''}`.toLowerCase();

  // Role fit (35)
  if (c.tier === 'target') lines.push({ factor: 'Role', points: 35, max: 35, reason: `"${job.title}" is one of your target roles` });
  else if (c.tier === 'adjacent') lines.push({ factor: 'Role', points: 18, max: 35, reason: `"${job.title}" is design-related but not a target title` });
  else lines.push({ factor: 'Role', points: 0, max: 35, reason: c.hiddenReason || 'Not a design role' });

  // Seniority (15) against verified years of experience
  const years = [...text.matchAll(/(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?years?/g)].map(m => Number(m[1])).filter(n => n > 0 && n < 30);
  const required = years.length ? Math.max(...years) : null;
  const seniorityPoints = { junior: 3, mid: 9, senior: 15, lead: 15, director: 9 }[c.seniority];
  let seniorityReason = `${c.seniority[0].toUpperCase()}${c.seniority.slice(1)}-level title; you have ${p.yearsExperience} verified years in UX/UI`;
  let sp = seniorityPoints;
  if (required !== null) {
    if (required > p.yearsExperience) { sp = Math.min(sp, 5); seniorityReason += `; listing asks for ${required}+ years`; }
    else seniorityReason += `; listing asks for ${required}+ years, which you meet`;
  }
  if (c.seniority === 'junior') seniorityReason += ' — likely below your level';
  if (c.seniority === 'director') seniorityReason += ' — management track; confirm people-leadership expectations';
  lines.push({ factor: 'Seniority', points: sp, max: 15, reason: seniorityReason });

  // Skills (25) — verified skills found in the listing text
  if ((job.description || '').trim().length < 40) {
    notScored.push('Skills: listing has no usable description');
  } else {
    const matched = p.skills.filter(s => s.keywords.some(k => text.includes(k)));
    const pts = Math.min(25, matched.length * 5);
    lines.push({
      factor: 'Skills',
      points: pts,
      max: 25,
      reason: matched.length
        ? `Listing mentions verified strengths: ${matched.map(s => s.label).join(', ')}`
        : 'Listing mentions none of your verified strengths',
    });
    const tools = knownTools.filter(t => new RegExp(`\\b${t.replace(/ /g, '\\s')}\\b`).test(text));
    if (tools.length) cautions.push(`Listing mentions ${tools.join(', ')}; tools are not recorded in your verified profile — confirm before claiming them`);
  }

  // Remote eligibility from India (20)
  const eligPoints = { india_listed: 20, worldwide: 16, region_likely: 14, uncertain: 8, restricted: 0 }[c.eligibility];
  lines.push({ factor: 'India eligibility', points: eligPoints, max: 20, reason: c.eligibilityNote });
  if (c.eligibility === 'uncertain' || c.eligibility === 'restricted') cautions.push(c.eligibilityNote);

  // Salary (5) — only when both sides are known
  const salaryUsd = parseSalaryUsd(job.salary);
  if (p.salaryMinUsd === null) notScored.push('Salary: no verified salary expectation in your profile');
  else if (salaryUsd === null) notScored.push(job.salary ? `Salary: could not compare "${job.salary}" in USD` : 'Salary: not listed');
  else lines.push({
    factor: 'Salary',
    points: salaryUsd >= p.salaryMinUsd ? 5 : 0,
    max: 5,
    reason: `Listed up to about $${Math.round(salaryUsd).toLocaleString('en-US')} vs your minimum $${p.salaryMinUsd.toLocaleString('en-US')}`,
  });

  const earned = lines.reduce((a, l) => a + l.points, 0);
  const possible = lines.reduce((a, l) => a + l.max, 0);
  return { score: possible ? Math.round((earned / possible) * 100) : 0, earned, possible, lines, notScored, cautions };
}

export type EnrichedJob = Job & { classification: Classification; match: Match };

export function enrich(jobs: Job[], p: Profile): EnrichedJob[] {
  return jobs.map(j => {
    const classification = classify(j);
    return { ...j, classification, match: scoreMatch(j, classification, p) };
  });
}

// Recommended first, then by score, then newest.
export function rank(jobs: EnrichedJob[]): EnrichedJob[] {
  return [...jobs].sort((a, b) =>
    Number(b.classification.recommended) - Number(a.classification.recommended) ||
    b.match.score - a.match.score ||
    new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
  );
}
