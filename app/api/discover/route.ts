import { NextResponse } from 'next/server';
import { readJobs, writeJobs, type Job } from '@/lib/store';
export const runtime = 'nodejs';
export const maxDuration = 60;

const relevant = /\b(ux designer|ui designer|ui\/ux designer|product designer|senior product designer|lead product designer|staff product designer|principal product designer|product design director|director of product design|ux researcher|user researcher|design researcher|interaction designer|service designer|design systems designer|experience designer|ux lead|design lead|head of design|director of design|design manager|product design manager|design strategist|usability researcher)\b/i;
const exclude = /\b(intern(ship)?|graphic designer|illustrator|video editor|sales|account executive|recruiter|software engineer|backend|back-end|front.?end developer|data analyst|devops|marketing manager|product manager|product specialist|product engineer|engineering lead|agriculture)\b/i;

function norm(x: any, source: string): { job: Job | null; reason: string } {
 const title = String(x.title || x.jobTitle || x.position || "").trim();
 const company = String(x.company_name || x.companyName || x.company || "").trim();
 const url = String(x.url || x.apply_url || "").trim();

 if (!title) return { job: null, reason: "missing_title" };
 if (!company) return { job: null, reason: "missing_company" };
 if (!url || !/^https:\/\//i.test(url)) return { job: null, reason: "invalid_url" };
 if (!relevant.test(title)) return { job: null, reason: "title_not_relevant" };
 if (exclude.test(title)) return { job: null, reason: "excluded_title" };

 const location = String(
   x.candidate_required_location || x.jobGeo || x.location ||
   (x.remote === true ? "Remote" : "")
 ).trim();

 const remoteFlag =
   x.remote === true ||
   String(x.remote || "").toLowerCase() === "true";

 const remoteLocation = /remote|worldwide|anywhere/i.test(location);

 if (!remoteFlag && !remoteLocation) {
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
     : undefined
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
   status: "Discovered",
   verificationStatus: "Unverified",
   remote: true,
   jobType: Array.isArray(x.jobType)
     ? x.jobType.join(", ")
     : String(x.job_type || x.jobType || (Array.isArray(x.job_types) ? x.job_types.join(", ") : "Not specified")),
   description: String(x.jobExcerpt || x.description || x.jobDescription || "")
     .replace(/<[^>]*>/g, " ")
     .replace(/\s+/g, " ")
     .slice(0, 800)
 };

 return { job, reason: "matched" };
}

export async function POST(){
 try{
  const old=await readJobs();
  const feeds=[
   {name:'Jobicy',url:'https://jobicy.com/api/v2/remote-jobs?count=100&tag=design',map:(d:any)=>d.jobs||[]},
   {name:'Remotive UX',url:'https://remotive.com/api/remote-jobs?search=UX%20designer',map:(d:any)=>d.jobs||[]},
   {name:'Remotive Product',url:'https://remotive.com/api/remote-jobs?search=product%20designer',map:(d:any)=>d.jobs||[]},
   {name:'Remotive UI',url:'https://remotive.com/api/remote-jobs?search=UI%20designer',map:(d:any)=>d.jobs||[]},
   {name:'Remote OK',url:'https://remoteok.com/api',map:(d:any)=>Array.isArray(d)?d.filter((x:any)=>x&&(x.position||x.title)):[]},
   {name:'Arbeitnow',url:'https://www.arbeitnow.com/api/job-board-api',map:(d:any)=>(d.data||[]).filter((x:any)=>x.remote===true)}
  ];
  const settled=await Promise.allSettled(feeds.map(async f=>{const r=await fetch(f.url,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'Mozilla/5.0 GlobalUXJobSearch/1.2',Accept:'application/json'},cache:'no-store'});if(!r.ok)throw new Error(`${f.name} HTTP ${r.status}`);const d=await r.json();return {name:f.name,data:f.map(d),rawCount:Array.isArray(d)?d.length:(d.jobs||d.data||[]).length};}));
  const candidates:Job[]=[],sourceErrors:string[]=[],sourceStats:any[]=[];
  for(let i=0;i<settled.length;i++){
   const result=settled[i];
   if(result.status==='rejected'){
    sourceErrors.push(`${feeds[i].name}: unavailable`);
    sourceStats.push({source:feeds[i].name,fetched:0,matched:0,rejected:{feed_unavailable:1}});
    continue;
   }
   let matched=0;
   const rejected:Record<string,number>={};
   for(const raw of result.value.data){
    const outcome=norm(raw,result.value.name);
    if(outcome.job){candidates.push(outcome.job);matched++;}
    else rejected[outcome.reason]=(rejected[outcome.reason]||0)+1;
   }
   sourceStats.push({source:result.value.name,fetched:result.value.rawCount,matched,rejected});
  }
  const seen=new Set<string>(),unique=candidates.filter(j=>{const k=j.sourceUrl!.toLowerCase().replace(/\/$/,'');if(seen.has(k))return false;seen.add(k);return true;});
  const existing=new Set(old.map(j=>j.id)),fresh=unique.filter(j=>!existing.has(j.id)),merged=[...fresh,...old];
  if(fresh.length)await writeJobs(merged);
  return NextResponse.json({ok:true,added:fresh.length,checked:unique.length,total:merged.length,sourceErrors,sourceStats,preview:fresh.slice(0,12),message:fresh.length?`Added ${fresh.length} new remote design roles.`:unique.length?'No new roles found; matching roles may already be saved.':'No matching remote design roles passed the filters. Check feed status and try again later.'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('Discovery failed safely',e);return NextResponse.json({error:'Discovery failed safely. Existing local jobs were left unchanged.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
