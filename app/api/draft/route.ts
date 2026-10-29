import { NextResponse } from 'next/server';
import type { Job } from '@/lib/store';
export async function POST(req:Request) {
 try {
  const j=(await req.json()) as Job;
  if(!j.title||!j.company) return NextResponse.json({error:'Job title and company are required.'},{status:400});
  const draft=`Hi ${j.company} team,\n\nI came across your ${j.title} opportunity and would love to learn more. My background is in UX/UI design, user-focused digital experiences, and translating business needs into clear product journeys.\n\nI’d be glad to share relevant work and discuss how I could contribute to your team.\n\nThank you for your time.`;
  return NextResponse.json({ok:true,draft});
 } catch { return NextResponse.json({error:'Could not create draft.'},{status:400}); }
}
