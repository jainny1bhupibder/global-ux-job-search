import { NextResponse } from 'next/server';
import { readJobs, writeJobs, type Job } from '@/lib/store';
export const runtime = 'nodejs';
export async function GET() {
  try { return NextResponse.json({ ok: true, jobs: await readJobs() }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (e) { console.error(e); return NextResponse.json({ error: 'Could not read local job storage safely.' }, { status: 500 }); }
}
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const jobs = await readJobs();
    if (body.action === 'upsert' && body.job) {
      const j = body.job as Job; const idx = jobs.findIndex(x => x.id === j.id);
      const next = idx >= 0 ? jobs.map((x,i)=>i===idx?{...x,...j}:x) : [j,...jobs];
      await writeJobs(next); return NextResponse.json({ ok:true, jobs:next });
    }
    if (body.action === 'update' && body.id && body.patch) {
      const next = jobs.map(j => j.id === body.id ? { ...j, ...body.patch, updatedAt: new Date().toISOString() } : j);
      if (!next.some(j=>j.id===body.id)) return NextResponse.json({error:'Job not found.'},{status:404});
      await writeJobs(next); return NextResponse.json({ok:true,jobs:next});
    }
    if (body.action === 'delete' && body.id) {
      const next = jobs.filter(j=>j.id!==body.id); await writeJobs(next); return NextResponse.json({ok:true,jobs:next});
    }
    return NextResponse.json({error:'Unsupported action.'},{status:400});
  } catch(e) { console.error(e); return NextResponse.json({error:'Could not safely update local job storage.'},{status:500}); }
}
