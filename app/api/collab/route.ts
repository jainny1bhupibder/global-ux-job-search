import { NextResponse } from 'next/server';
import { readLeads, updateLead } from '@/lib/collab';

// Owner-only inbox (protected by the dashboard login in middleware.ts).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    return NextResponse.json({ ok: true, leads: await readLeads() }, { headers: noStore });
  } catch (error) {
    console.error('Collaboration inbox read failed', error);
    return NextResponse.json({ error: 'Could not read the collaboration inbox.' }, { status: 503, headers: noStore });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (typeof body?.id !== 'string') return NextResponse.json({ error: 'Missing lead id.' }, { status: 400, headers: noStore });
    const lead = await updateLead(body.id, { status: body.status, notes: body.notes });
    if (!lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404, headers: noStore });
    return NextResponse.json({ ok: true, leads: await readLeads() }, { headers: noStore });
  } catch (error) {
    console.error('Collaboration update failed', error);
    return NextResponse.json({ error: 'Could not update the lead.' }, { status: 503, headers: noStore });
  }
}
