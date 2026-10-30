'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';

type ScoreLine={factor:string;points:number;max:number;reason:string};
type Job={id:string;title:string;company:string;location?:string;salary?:string;sourceUrl?:string;sourceName?:string;publishedAt?:string;discoveredAt?:string;status?:string;verificationStatus?:string;remote?:boolean;jobType?:string;description?:string;notes?:string;draft?:string;draftHistory?:{draft:string;savedAt:string}[];deadline?:string;followUpAt?:string;approvedAt?:string;appliedAt?:string;updatedAt?:string;handoff?:{reason:string;note?:string;at:string};
 classification?:{tier:string;roleLabel:string;seniority:string;eligibility:string;eligibilityNote:string;recommended:boolean;hiddenReason?:string};
 match?:{score:number;earned:number;possible:number;lines:ScoreLine[];notScored:string[];cautions:string[]}};
type Run={runId:string;trigger:string;startedAt:string;finishedAt?:string;status:string;added?:number;recommendedAdded?:number;checked?:number;sourceErrors?:string[];error?:string;email?:{status:string;detail?:string}};
type Status={schedule:{description:string;nextRunAt:string;cronSecretConfigured:boolean;deployedOnVercel:boolean};running:any;lastRun:Run|null;lastScheduledRun:Run|null;recentErrors:Run[];runs:Run[];email:{enabled:boolean;configured:boolean;missing:string[]}};

type Lead={id:string;receivedAt:string;name:string;email:string;product:string;link?:string;stage:string;need:string;deal:string;message:string;status:string;notes?:string};
const leadStages=['New','Interested','Talking','Working together','Passed'];
const stages=['Discovered','Shortlisted','Draft ready for review','Approved to apply','Applied','Interview','Offer','Rejected','Withdrawn'];
const handoffReasons=['CAPTCHA','Login required','Unsupported form','External portal','Other'];
const views=['Recommended','All saved','Hidden'] as const;
const eligLabel:Record<string,string>={india_listed:'India listed',worldwide:'Worldwide',region_likely:'Region likely incl. India',uncertain:'Eligibility uncertain',restricted:'Not open to India'};
const DAY=86400000;

class ApiError extends Error{constructor(m:string,public code?:string,public status?:number){super(m);}}
async function api(path:string,body?:any){const r=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store'});const d=await r.json().catch(()=>({error:'Unreadable server response'}));if(!r.ok)throw new ApiError(d.error||`Request failed (${r.status})`,d.code,r.status);return d;}
const fmt=(iso?:string|null)=>iso?new Date(iso).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'—';
const isNew=(j:Job)=>!!j.discoveredAt&&Date.now()-new Date(j.discoveredAt).getTime()<DAY;
const followUpDue=(j:Job)=>!!j.followUpAt&&!!j.appliedAt&&new Date(j.followUpAt).getTime()<=Date.now()+7*DAY&&['Applied','Interview'].includes(j.status||'');

export default function Home(){
 const [jobs,setJobs]=useState<Job[]>([]),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState('');
 const [status,setStatus]=useState<Status|null>(null),[statusError,setStatusError]=useState('');
 const [search,setSearch]=useState(''),[stage,setStage]=useState('All stages'),[view,setView]=useState<typeof views[number]>('Recommended');
 const [busy,setBusy]=useState(''),[notice,setNotice]=useState<{text:string;error?:boolean}|null>(null),[disc,setDisc]=useState<any>(null);
 const [selectedId,setSelectedId]=useState<string|null>(null),[adding,setAdding]=useState(false),[openScore,setOpenScore]=useState<string|null>(null);
 const [draftText,setDraftText]=useState(''),[fields,setFields]=useState({notes:'',deadline:'',followUpAt:''}),[handoff,setHandoff]=useState({reason:'Login required',note:''}),[checklist,setChecklist]=useState<string[]>([]);
 const [report,setReport]=useState<any>(null);
 const [leads,setLeads]=useState<Lead[]>([]),[leadsError,setLeadsError]=useState('');
 const [form,setForm]=useState({title:'',company:'',location:'Remote eligibility unknown',salary:'',sourceUrl:'',notes:''});
 const selected=jobs.find(j=>j.id===selectedId)||null;
 const say=(text:string,error=false)=>setNotice({text,error});

 const refresh=useCallback(async()=>{
  try{const d=await api('/api/jobs');setJobs(d.jobs||[]);setLoadError('');}catch(e:any){setLoadError(e.message||'Could not load jobs');}finally{setLoading(false);}
  try{setStatus(await api('/api/status'));setStatusError('');}catch(e:any){setStatusError(e.message||'Could not load discovery status');}
 try{setLeads((await api('/api/collab')).leads||[]);setLeadsError('');}catch(e:any){setLeadsError(e.message||'Could not load collaboration inbox');}
 },[]);
 useEffect(()=>{refresh();},[refresh]);
 useEffect(()=>{if(selected){setDraftText(selected.draft||'');setFields({notes:selected.notes||'',deadline:selected.deadline||'',followUpAt:selected.followUpAt||''});}
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[selectedId,selected?.draft,selected?.updatedAt]);

 async function act(label:string,body:any,ok:string){setBusy(label);try{const d=await api('/api/jobs',body);setJobs(d.jobs||[]);say(ok);return d;}catch(e:any){if(e.code==='possible_duplicate'&&confirm(`${e.message}\n\nRecord this application anyway?`))return act(label,{...body,confirmDuplicate:true},ok);if(e.code==='draft_exists'&&confirm(`${e.message}`))return act(label,{...body,replace:true},ok);say(e.message||'Save failed',true);}finally{setBusy('');}}
 async function discover(){setBusy('discover');say('Searching live job feeds… this can take up to a minute.');setDisc(null);try{const d=await api('/api/discover',{});setDisc(d);say(d.message||`Search complete: ${d.added} new jobs added.`);await refresh();}catch(e:any){say(e.message||'Discovery failed',true);await refresh();}finally{setBusy('');}}
 async function generate(j:Job){const d=await act('draft',{action:'generate-draft',id:j.id},'Draft saved for your review. Nothing has been sent.');if(d){setSelectedId(j.id);setChecklist(d.reviewChecklist||[]);}}
 async function setLead(id:string,patch:{status?:string;notes?:string}){try{const d=await api('/api/collab',{id,...patch});setLeads(d.leads||[]);}catch(e:any){say(e.message,true);}}
 async function loadReport(){setBusy('report');try{setReport(await api('/api/report'));}catch(e:any){say(e.message,true);}finally{setBusy('');}}
 async function sendTest(){if(!confirm(`Send one test report email to the configured REPORT_EMAIL_TO address?`))return;setBusy('email');try{const d=await api('/api/report',{action:'send-test',confirm:true});say(`Test email accepted by Resend (id ${d.id}). Check your inbox to confirm delivery.`);}catch(e:any){say(e.message,true);}finally{setBusy('');}}

 const recommended=jobs.filter(j=>j.classification?.recommended);
 const filtered=useMemo(()=>jobs.filter(j=>(view==='All saved'||(view==='Recommended')===!!j.classification?.recommended)&&(stage==='All stages'||(j.status||'Discovered')===stage)&&[j.title,j.company,j.location,j.description,j.sourceName].join(' ').toLowerCase().includes(search.toLowerCase())),[jobs,view,stage,search]);
 const count=(s:string)=>jobs.filter(j=>(j.status||'Discovered')===s).length;
 const pending=jobs.filter(j=>j.draft&&!j.appliedAt);
 const followUps=jobs.filter(followUpDue);
 const best=recommended.filter(j=>!j.appliedAt).slice(0,3);

 return <main className="wrap">
  <header className="head"><div><div className="eyebrow">Personal job-search workspace</div><h1>Global UX Job Search</h1><p className="sub">Remote UX/UI and product-design roles, ranked for India-based eligibility. Nothing is submitted or sent without your approval.</p></div><div className="actions"><button onClick={()=>{setLoading(true);refresh();}} disabled={!!busy}>Refresh</button><button className="primary" onClick={discover} disabled={!!busy||!!status?.running}>{busy==='discover'?'Searching…':status?.running?'Run in progress…':'↻ Discover new jobs'}</button></div></header>

  <section className="panel status" aria-live="polite"><h2>Discovery status</h2>
   {statusError?<div className="error">Status unavailable: {statusError}</div>:!status?<div className="skeleton">Loading status…</div>:<div className="grid3">
    <div><span className="label">Last run</span>{status.lastRun?<><strong className={`run-${status.lastRun.status}`}>{status.lastRun.status}</strong> · {status.lastRun.trigger} · {fmt(status.lastRun.finishedAt||status.lastRun.startedAt)}{status.lastRun.added!==undefined&&<div className="meta">{status.lastRun.added} added ({status.lastRun.recommendedAdded??0} recommended) of {status.lastRun.checked} checked</div>}</>:<span className="meta">No runs recorded yet</span>}{status.running&&<div className="meta">Running now (started {fmt(status.running.startedAt)})</div>}</div>
    <div><span className="label">Next scheduled run</span><strong>{fmt(status.schedule.nextRunAt)}</strong><div className="meta">{status.schedule.description}{!status.schedule.deployedOnVercel?' · runs only on the Vercel deployment':''}</div>{!status.schedule.cronSecretConfigured&&<div className="warn">CRON_SECRET is not set — scheduled runs will be refused.</div>}</div>
    <div><span className="label">Daily email</span>{status.email.enabled&&status.email.configured?<strong>Enabled</strong>:<strong>Off</strong>}<div className="meta">{status.email.configured?'Resend configured':`Missing: ${status.email.missing.join(', ')}`}{!status.email.enabled&&' · EMAIL_REPORTS_ENABLED not true'}</div>{status.lastScheduledRun?.email&&<div className="meta">Last report: {status.lastScheduledRun.email.status}{status.lastScheduledRun.email.detail?` — ${status.lastScheduledRun.email.detail}`:''}</div>}</div>
   </div>}
   {status?.recentErrors?.length?<details className="errors"><summary>{status.recentErrors.length} recent problem{status.recentErrors.length>1?'s':''}</summary>{status.recentErrors.map(r=><div className="feed" key={r.runId}>{fmt(r.startedAt)} · {r.trigger}: {r.error||''}{r.sourceErrors?.length?` Feeds unavailable: ${r.sourceErrors.join(', ')}.`:''}{r.email?.status==='failed'?` Email failed: ${r.email.detail}`:''}</div>)}</details>:null}
  </section>

  <div className="stats">
   <div className="stat"><span>Recommended</span><strong>{loading?'…':recommended.length}</strong></div>
   <div className="stat"><span>New (24h)</span><strong>{loading?'…':recommended.filter(isNew).length}</strong></div>
   <div className="stat"><span>Drafts to review</span><strong>{loading?'…':pending.length}</strong></div>
   <div className="stat"><span>Applied</span><strong>{loading?'…':count('Applied')}</strong></div>
   <div className="stat"><span>Interviews</span><strong>{loading?'…':count('Interview')}</strong></div>
   <div className="stat"><span>Follow-ups due</span><strong>{loading?'…':followUps.length}</strong></div>
  </div>
  {notice&&<div className={`notice ${notice.error?'is-error':''}`} role="status">{notice.text}</div>}
  {loadError&&<div className="notice is-error" role="alert">Could not load jobs: {loadError}. Existing data has not been changed. <button onClick={refresh}>Retry</button></div>}

  {!loading&&!loadError&&(best.length>0||pending.length>0||followUps.length>0)&&<section className="panel grid3">
   <div><h2>Best matches</h2>{best.length?best.map(j=><button className="linkish" key={j.id} onClick={()=>setSelectedId(j.id)}>{j.match?.score}% · {j.title} — {j.company}</button>):<p className="meta">No open recommended roles.</p>}</div>
   <div><h2>Drafts awaiting review</h2>{pending.length?pending.map(j=><button className="linkish" key={j.id} onClick={()=>setSelectedId(j.id)}>{j.title} — {j.company} · {j.approvedAt?'approved':'not approved'}</button>):<p className="meta">None.</p>}</div>
   <div><h2>Follow-ups (7 days)</h2>{followUps.length?followUps.map(j=><button className="linkish" key={j.id} onClick={()=>setSelectedId(j.id)}>{j.followUpAt} · {j.company}</button>):<p className="meta">None due.</p>}</div>
  </section>}

  {disc&&<section className="panel"><h2>Latest discovery results</h2><p className="sub">Checked {disc.checked} matching listings; added {disc.added} ({disc.recommendedAdded} recommended). Total saved: {disc.total}. {disc.sourceErrors?.length?`Unavailable feeds: ${disc.sourceErrors.join(', ')}`:'All feed requests completed.'}</p>{disc.sourceStats?.map((x:any,i:number)=><div className="feed" key={i}>{x.source}: {x.matched} matches from {x.fetched} listings</div>)}</section>}

  <section className="panel"><div className="toolbar">
   <div className="tabs" role="tablist">{views.map(v=><button key={v} role="tab" aria-selected={view===v} className={view===v?'active':''} onClick={()=>setView(v)}>{v} ({v==='All saved'?jobs.length:v==='Recommended'?recommended.length:jobs.length-recommended.length})</button>)}</div>
   <input placeholder="Search title, company or location…" value={search} onChange={e=>setSearch(e.target.value)}/>
   <select value={stage} onChange={e=>setStage(e.target.value)}><option>All stages</option>{stages.map(s=><option key={s}>{s}</option>)}</select>
   <button onClick={()=>{setAdding(true);setSelectedId(null);setForm({title:'',company:'',location:'Remote eligibility unknown',salary:'',sourceUrl:'',notes:''});}}>+ Add job manually</button>
  </div>{view==='Hidden'&&<p className="meta">Hidden roles are kept in storage; they are excluded from recommendations because they are not design roles or are not open to India.</p>}</section>

  {adding&&<section className="panel"><h2>Add a job</h2><form className="edit" onSubmit={e=>{e.preventDefault();act('upsert',{action:'upsert',job:{...form,id:form.sourceUrl||'manual-'+Date.now(),status:'Discovered',discoveredAt:new Date().toISOString()}},'Job saved.');setAdding(false);}}><input required placeholder="Job title" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><input required placeholder="Company" value={form.company} onChange={e=>setForm({...form,company:e.target.value})}/><input placeholder="Location / remote eligibility" value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/><input placeholder="Salary" value={form.salary} onChange={e=>setForm({...form,salary:e.target.value})}/><input placeholder="Application URL (https://…)" value={form.sourceUrl} onChange={e=>setForm({...form,sourceUrl:e.target.value})}/><input placeholder="Notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/><button className="primary" type="submit">Save job</button><button type="button" onClick={()=>setAdding(false)}>Cancel</button></form></section>}

  {selected&&<section className="panel workspace"><div className="jobhead"><div><h2>Application workspace · {selected.title}</h2><div className="meta">{selected.company} · {selected.location}{selected.match?` · match ${selected.match.score}%`:''}</div></div><button onClick={()=>{setSelectedId(null);setChecklist([]);}}>Close</button></div>
   {selected.classification&&selected.classification.eligibility!=='india_listed'&&<div className="warn">{selected.classification.eligibilityNote}</div>}
   <div className="edit">
    <label>Status<select value={selected.status||'Discovered'} onChange={e=>act('status',{action:'update',id:selected.id,patch:{status:e.target.value}},'Status updated.')}>{stages.map(s=><option key={s}>{s}</option>)}</select></label>
    <label>Deadline<input type="date" value={fields.deadline} onChange={e=>setFields({...fields,deadline:e.target.value})}/></label>
    <label>Follow-up date<input type="date" value={fields.followUpAt} onChange={e=>setFields({...fields,followUpAt:e.target.value})}/></label>
    <label>Notes<input value={fields.notes} onChange={e=>setFields({...fields,notes:e.target.value})} placeholder="Recruiter name, referral, interview notes…"/></label>
   </div>
   <div className="actions"><button onClick={()=>act('fields',{action:'update',id:selected.id,patch:fields},'Details saved.')} disabled={!!busy}>Save details</button></div>

   <h3>Application draft</h3>
   {selected.draft?<>
    <textarea value={draftText} onChange={e=>setDraftText(e.target.value)} aria-label="Draft text"/>
    {checklist.length>0&&<ul className="checklist">{checklist.map(c=><li key={c}>{c}</li>)}</ul>}
    <div className="meta">{selected.approvedAt?`Approved ${fmt(selected.approvedAt)}. Editing the text withdraws approval.`:'Not approved yet.'}{selected.draftHistory?.length?` · ${selected.draftHistory.length} earlier version${selected.draftHistory.length>1?'s':''} kept`:''}</div>
    <div className="actions">
     <button onClick={()=>act('draft-save',{action:'update',id:selected.id,patch:{draft:draftText}},'Draft saved; previous version kept in history.')} disabled={!!busy||draftText===selected.draft}>Save edits</button>
     <button onClick={()=>navigator.clipboard.writeText(draftText)}>Copy draft</button>
     <button onClick={()=>generate(selected)} disabled={!!busy}>Regenerate</button>
     {!selected.approvedAt&&!selected.appliedAt&&<button className="primary" disabled={!!busy||draftText!==selected.draft} onClick={()=>confirm('Approve this draft? You will still submit the application yourself on the employer site.')&&act('approve',{action:'approve',id:selected.id},'Draft approved. Open the listing and submit it yourself, then record it here.')}>Approve draft</button>}
    </div>
   </>:<div className="actions"><button className="primary" onClick={()=>generate(selected)} disabled={!!busy}>{busy==='draft'?'Preparing…':'Prepare tailored draft'}</button><span className="meta">Uses only verified portfolio facts.</span></div>}

   <h3>Submit (you do this)</h3>
   {selected.appliedAt?<p className="meta">Recorded as applied on {fmt(selected.appliedAt)}. Follow-up: {selected.followUpAt||'not set'}.</p>:<>
    <p className="meta">This app never submits applications or contacts employers. Open the listing, complete any CAPTCHA, login or form yourself, then record it.</p>
    <div className="actions">
     {selected.sourceUrl&&<a className="btn" href={selected.sourceUrl} target="_blank" rel="noreferrer">Open listing ↗</a>}
     <button disabled={!!busy||!selected.approvedAt} title={selected.approvedAt?'':'Approve the draft first'} onClick={()=>confirm(`Confirm you have submitted the application for ${selected.title} at ${selected.company}?`)&&act('applied',{action:'mark-applied',id:selected.id},'Application recorded. Follow-up set for 7 days unless you chose a date.')}>I submitted it</button>
    </div>
    <div className="handoff"><span className="label">Needs manual handling</span>
     {selected.handoff?<div className="warn">{selected.handoff.reason}{selected.handoff.note?` — ${selected.handoff.note}`:''} (since {fmt(selected.handoff.at)}) <button onClick={()=>act('handoff',{action:'handoff',id:selected.id,reason:selected.handoff!.reason,clear:true},'Handoff cleared.')}>Clear</button></div>:
     <div className="actions"><select value={handoff.reason} onChange={e=>setHandoff({...handoff,reason:e.target.value})}>{handoffReasons.map(r=><option key={r}>{r}</option>)}</select><input placeholder="What needs doing?" value={handoff.note} onChange={e=>setHandoff({...handoff,note:e.target.value})}/><button onClick={()=>act('handoff',{action:'handoff',id:selected.id,...handoff},'Marked for manual handling.')}>Flag</button></div>}
    </div>
   </>}
  </section>}

  <section className="list">
   {loading&&<div className="empty"><div className="skeleton">Loading saved jobs…</div></div>}
   {!loading&&filtered.map(j=><article className={`job ${j.classification?.recommended?'':'muted'}`} key={j.id}>
    <div className="jobhead"><div><h3>{j.title}{isNew(j)&&<span className="pill new">New</span>}</h3><div>{j.company}</div></div><div className="pills">{j.match&&<button className="score" aria-expanded={openScore===j.id} onClick={()=>setOpenScore(openScore===j.id?null:j.id)}>{j.match.score}% match</button>}<span className="pill">{j.status||'Discovered'}</span></div></div>
    <div className="meta">{j.location||'Location not specified'} · {j.jobType||'Type not specified'}{j.publishedAt?` · ${new Date(j.publishedAt).toLocaleDateString()}`:''}{j.sourceName?` · ${j.sourceName}`:''}</div>
    {j.classification&&<div className="meta"><span className={`elig elig-${j.classification.eligibility}`}>{eligLabel[j.classification.eligibility]}</span>{' '}{j.classification.roleLabel}{j.classification.hiddenReason?` — hidden: ${j.classification.hiddenReason}`:''}</div>}
    {j.salary&&<div className="meta">Salary: {j.salary}</div>}
    {j.deadline&&<div className="meta">Deadline: {j.deadline}</div>}
    {j.handoff&&!j.appliedAt&&<div className="warn">Needs you: {j.handoff.reason}</div>}
    {openScore===j.id&&j.match&&<div className="why"><strong>Why {j.match.score}%</strong> ({j.match.earned}/{j.match.possible} points scored)<ul>{j.match.lines.map(l=><li key={l.factor}><b>{l.factor} {l.points}/{l.max}</b> — {l.reason}</li>)}{j.match.notScored.map(n=><li key={n} className="meta">Not scored · {n}</li>)}{j.match.cautions.map(c=><li key={c} className="warn-text">⚠ {c}</li>)}</ul></div>}
    {j.description&&<p>{j.description}</p>}
    <div className="actions">{j.sourceUrl&&<a href={j.sourceUrl} target="_blank" rel="noreferrer">View listing ↗</a>}<button onClick={()=>{setSelectedId(j.id);setAdding(false);setChecklist([]);}}>Open workspace</button>{!j.draft&&<button onClick={()=>generate(j)} disabled={!!busy}>Prepare draft</button>}<button onClick={()=>confirm(`Delete "${j.title}" at ${j.company}? This cannot be undone.`)&&act('delete',{action:'delete',id:j.id},'Job deleted.')}>Delete</button></div>
   </article>)}
   {!loading&&!loadError&&!filtered.length&&<div className="empty"><h2>{jobs.length?view==='Recommended'?'No recommended jobs match these filters':'No jobs match these filters':'No saved jobs yet'}</h2><p>{jobs.length&&view==='Recommended'?'Try “All saved”, clear the search, or run discovery for new roles.':'Choose Discover new jobs to search live feeds, or add a role manually.'}</p></div>}
  </section>

  <section className="panel"><div className="jobhead"><h2>Collaboration inbox ({leads.filter(l=>l.status==='New').length} new)</h2><a className="btn" href="/work-with-me" target="_blank" rel="noreferrer">Public “Work with me” page ↗</a></div>
   {leadsError?<div className="error">Inbox unavailable: {leadsError}</div>:!leads.length?<p className="meta">No messages yet. Share the public page link to start receiving them.</p>:leads.map(l=><article className="job" key={l.id} style={{marginTop:10}}>
    <div className="jobhead"><div><h3>{l.product}{l.status==='New'&&<span className="pill new">New</span>}</h3><div>{l.name} · <a href={`mailto:${l.email}`}>{l.email}</a></div></div><select value={l.status} onChange={e=>setLead(l.id,{status:e.target.value})} aria-label="Lead status">{leadStages.map(s=><option key={s}>{s}</option>)}</select></div>
    <div className="meta">{fmt(l.receivedAt)} · {l.deal}{l.stage?` · ${l.stage}`:''}{l.need?` · needs: ${l.need}`:''}{l.link?<> · <a href={l.link} target="_blank" rel="noreferrer">product ↗</a></>:null}</div>
    <p style={{whiteSpace:'pre-wrap'}}>{l.message}</p>
    <input defaultValue={l.notes||''} placeholder="Private notes…" aria-label="Notes" onBlur={e=>e.target.value!==(l.notes||'')&&setLead(l.id,{notes:e.target.value})} style={{width:'100%'}}/>
   </article>)}
  </section>

  <section className="panel"><div className="jobhead"><h2>Daily email report</h2><div className="actions"><button onClick={loadReport} disabled={!!busy}>{busy==='report'?'Building…':report?'Rebuild preview':'Preview report'}</button>{status?.email.configured&&<button onClick={sendTest} disabled={!!busy}>Send test email…</button>}</div></div>
   {report?<pre className="report">{report.text}</pre>:<p className="meta">Preview what the daily email will contain. Previewing never sends anything.</p>}
  </section>
  <footer>Matches use verified portfolio facts only · Verify every listing on the employer site before applying.</footer>
 </main>;
}
