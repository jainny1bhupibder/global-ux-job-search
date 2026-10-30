import { NextResponse } from 'next/server';
import type { Job } from '@/lib/store';
import { profile } from '@/lib/profile';
import { classify } from '@/lib/matching';
import { buildDraft } from '@/lib/drafts';

// Stateless draft preview. Saving goes through /api/jobs "generate-draft", which preserves existing drafts.
export async function POST(req:Request) {
 try {
  const j=(await req.json()) as Job;
  if(!j.title||!j.company) return NextResponse.json({error:'Job title and company are required.'},{status:400});
  return NextResponse.json({ok:true,...buildDraft(j,classify(j),profile)});
 } catch { return NextResponse.json({error:'Could not create draft.'},{status:400}); }
}
