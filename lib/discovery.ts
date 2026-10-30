import { updateJobs, type Job } from './store';
import { classify } from './matching';
import { greenhouse, lever, ashby, mapGreenhouse, mapLever, mapAshby } from './boards';

const relevant = /\b(ux designer|ui designer|ui\/ux designer|ux\/ui designer|ui ux designer|product designer|senior product designer|lead product designer|staff product designer|principal product designer|product design lead|product design director|director of product design|ux researcher|user researcher|design researcher|interaction designer|service designer|design systems designer|experience designer|ux lead|design lead|head of design|director of design|design manager|product design manager|design strategist|usability researcher)\b/i;
const exclude = /\b(intern(ship)?|graphic designer|illustrator|video editor|sales|account executive|recruiter|software engineer|engineer(ing)?|backend|back-end|front.?end developer|developer|data analyst|devops|marketing manager|product manager|product owner|product specialist|product engineer|agriculture)\b/i;

// Some feeds return UTF-8 text that was decoded as Latin-1 ("weâre"). Repair only when safe.
function repairText(s: string): string {
  if (!/[ÃÂâ][\u0080-ÿ]/.test(s)) return s;
  try {
    const fixed = Buffer.from(s, 'latin1').toString('utf8');
    return fixed.includes('�') ? s : fixed;
  } catch {
    return s;
  }
}

function norm(x: any, source: string, now: string): { job: Job | null; reason: string } {
 const title = repairText(String(x.title || x.jobTitle || x.position || "").trim());
 const company = repairText(String(x.company_name || x.companyName || x.company || "").trim());
 const url = String(x.url || x.apply_url || "").trim();

 if (!title) return { job: null, reason: "missing_title" };
 if (!company) return { job: null, reason: "missing_company" };
 if (!url || !/^https:\/\//i.test(url)) return { job: null, reason: "invalid_url" };
 if (!relevant.test(title)) return { job: null, reason: "title_not_relevant" };
 if (exclude.test(title)) return { job: null, reason: "excluded_title" };

 const location = repairText(String(
   x.candidate_required_location || x.jobGeo || x.location ||
   (x.remote === true ? "Remote" : "")
 ).trim());

 const remoteFlag =
   x.remote === true ||
   String(x.remote || "").toLowerCase() === "true";

 const remoteLocation = /remote|worldwide|anywhere/i.test(location);

 // Jobicy lists only remote roles; its jobGeo holds eligible countries rather than "Remote".
 if (!remoteFlag && !remoteLocation && !source.startsWith('Jobicy')) {
   return { job: null, reason: "remote_not_confirmed" };
 }

 const raw = x.publication_date || x.pubDate || x.created_at || x.date || x.epoch;
 let publishedAt: string | undefined;

 if (raw !== undefined && raw !== null && raw !== "") {
   const n = Number(raw);
   const d = typeof raw === "number" || /^\d{10}$/.test(String(raw))
     ? new Date(n < 1e12 ? n * 1000 : n)
     : new Date(raw);

   if (!Number.isNaN(d.getTime())) publishedAt = d.toISOString();
 }

 if (publishedAt && Date.now() - new Date(publishedAt).getTime() > 90 * 86400000) {
   return { job: null, reason: "older_than_90_days" };
 }

 if (publishedAt && new Date(publishedAt).getTime() > Date.now() + 2 * 86400000) {
   return { job: null, reason: "future_publication_date" };
 }

 const salary = x.salary || (
   x.salaryMin || x.salaryMax
     ? [x.salaryCurrency, x.salaryMin, x.salaryMax].filter(Boolean).join(" ")
     : (x.salary_min || x.salary_max ? ['USD', x.salary_min, x.salary_max].filter(Boolean).join(" ") : undefined)
 );

 const job: Job = {
   id: url,
   title,
   company,
   location: location || "Remote; eligibility not specified",
   salary: salary ? String(salary) : undefined,
   sourceUrl: url,
   sourceName: source,
   publishedAt,
   discoveredAt: now,
   status: "Discovered",
   verificationStatus: "Unverified",
   remote: true,
   jobType: Array.isArray(x.jobType)
     ? x.jobType.join(", ")
     : String(x.job_type || x.jobType || (Array.isArray(x.job_types) ? x.job_types.join(", ") : "Not specified")),
   description: repairText(String(x.jobExcerpt || x.description || x.jobDescription || "")
     .replace(/<[^>]*>/g, " ")
     .replace(/\s+/g, " ")
     .slice(0, 800))
 };

 return { job, reason: "matched" };
}

const feeds = [
  { name: 'Jobicy', url: 'https://jobicy.com/api/v2/remote-jobs?count=100&tag=design', map: (d: any) => d.jobs || [] },
  { name: 'Jobicy Product Designer', url: 'https://jobicy.com/api/v2/remote-jobs?count=100&tag=product%20designer', map: (d: any) => d.jobs || [] },
  { name: 'Jobicy UX Designer', url: 'https://jobicy.com/api/v2/remote-jobs?count=100&tag=ux%20designer', map: (d: any) => d.jobs || [] },
  { name: 'Jobicy APAC', url: 'https://jobicy.com/api/v2/remote-jobs?count=100&geo=apac', map: (d: any) => d.jobs || [] },
  { name: 'Remotive UX', url: 'https://remotive.com/api/remote-jobs?search=UX%20designer', map: (d: any) => d.jobs || [] },
  { name: 'Remotive Product', url: 'https://remotive.com/api/remote-jobs?search=product%20designer', map: (d: any) => d.jobs || [] },
  { name: 'Remotive UI', url: 'https://remotive.com/api/remote-jobs?search=UI%20designer', map: (d: any) => d.jobs || [] },
  { name: 'Remote OK', url: 'https://remoteok.com/api', map: (d: any) => Array.isArray(d) ? d.filter((x: any) => x && (x.position || x.title)) : [] },
  { name: 'Arbeitnow', url: 'https://www.arbeitnow.com/api/job-board-api', map: (d: any) => (d.data || []).filter((x: any) => x.remote === true) },
  ...greenhouse.map(b => ({ name: `Greenhouse: ${b.name}`, url: `https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs`, map: mapGreenhouse(b.name) })),
  ...lever.map(b => ({ name: `Lever: ${b.name}`, url: `https://api.lever.co/v0/postings/${b.slug}?mode=json`, map: mapLever(b.name) })),
  ...ashby.map(b => ({ name: `Ashby: ${b.name}`, url: `https://api.ashbyhq.com/posting-api/job-board/${b.slug}`, map: mapAshby(b.name) })),
];

export type SourceStat = { source: string; fetched: number; matched: number; rejected: Record<string, number> };
export type DiscoveryResult = {
  added: number;
  checked: number;
  total: number;
  recommendedAdded: number;
  sourceErrors: string[];
  sourceStats: SourceStat[];
  preview: Job[];
  message: string;
};

const dupKey = (j: Job) => `${j.company}|${j.title}`.toLowerCase().replace(/[^a-z0-9|]+/g, ' ').trim();

export async function runDiscovery(): Promise<DiscoveryResult> {
  const now = new Date().toISOString();
  const settled = await Promise.allSettled(feeds.map(async f => {
    const r = await fetch(f.url, { signal: AbortSignal.timeout(25000), headers: { 'User-Agent': 'Mozilla/5.0 GlobalUXJobSearch/1.3', Accept: 'application/json' }, cache: 'no-store' });
    if (!r.ok) throw new Error(`${f.name} HTTP ${r.status}`);
    const d = await r.json();
    return { name: f.name, data: f.map(d), rawCount: Array.isArray(d) ? d.length : (d.jobs || d.data || []).length };
  }));

  const candidates: Job[] = [], sourceErrors: string[] = [], sourceStats: SourceStat[] = [];
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status === 'rejected') {
      console.error(`Discovery feed failed: ${feeds[i].name}`, result.reason);
      sourceErrors.push(`${feeds[i].name}: unavailable`);
      sourceStats.push({ source: feeds[i].name, fetched: 0, matched: 0, rejected: { feed_unavailable: 1 } });
      continue;
    }
    let matched = 0;
    const rejected: Record<string, number> = {};
    for (const raw of result.value.data) {
      const outcome = norm(raw, result.value.name, now);
      if (outcome.job) { candidates.push(outcome.job); matched++; }
      else rejected[outcome.reason] = (rejected[outcome.reason] || 0) + 1;
    }
    sourceStats.push({ source: result.value.name, fetched: result.value.rawCount, matched, rejected });
  }

  if (sourceErrors.length === feeds.length) {
    throw new Error('All job feeds were unavailable.');
  }

  const seen = new Set<string>();
  const unique = candidates.filter(j => {
    const k = j.sourceUrl!.toLowerCase().replace(/\/$/, '');
    if (seen.has(k) || seen.has(dupKey(j))) return false;
    seen.add(k); seen.add(dupKey(j));
    return true;
  });

  let fresh: Job[] = [];
  const merged = await updateJobs(current => {
    const existing = new Set(current.flatMap(j => [j.id, dupKey(j)]));
    fresh = unique.filter(j => !existing.has(j.id) && !existing.has(dupKey(j)));
    return fresh.length ? [...fresh, ...current] : current;
  });

  const recommendedAdded = fresh.filter(j => classify(j).recommended).length;
  return {
    added: fresh.length,
    checked: unique.length,
    total: merged.length,
    recommendedAdded,
    sourceErrors,
    sourceStats,
    preview: fresh.slice(0, 12),
    message: fresh.length
      ? `Added ${fresh.length} new remote design roles (${recommendedAdded} recommended).`
      : unique.length
        ? 'No new roles found; matching roles may already be saved.'
        : 'No matching remote design roles passed the filters. Check feed status and try again later.',
  };
}
