import { NextResponse } from 'next/server';
import { runDiscovery } from '@/lib/discovery';
import { acquireRun, finishRun } from '@/lib/runs';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(){
 let runId: string | undefined;
 try{
  const acquired = await acquireRun('manual');
  if (!acquired.ok) {
    return NextResponse.json({ error: `Discovery is already running. ${acquired.detail}` }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
  }
  runId = acquired.runId;
  const result = await runDiscovery();
  await finishRun(runId, { status: 'succeeded', added: result.added, recommendedAdded: result.recommendedAdded, checked: result.checked, sourceErrors: result.sourceErrors });
  return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
 }catch(e: any){
  console.error('Discovery failed safely',e);
  if (runId) await finishRun(runId, { status: 'failed', error: String(e?.message || e).slice(0, 300) }).catch(err => console.error('Could not record failed run', err));
  return NextResponse.json({error:'Discovery failed safely. Existing jobs were left unchanged.'},{status:503,headers:{'Cache-Control':'no-store'}});
 }
}
