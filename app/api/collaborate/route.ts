import { NextResponse } from 'next/server';
import { addLead, parseSubmission } from '@/lib/collab';
import { emailConfig, sendReportEmail } from '@/lib/email';

// Public endpoint behind the "Work with me" page. It only stores the message and
// notifies the owner; it never replies to the sender.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: noStore });
  }

  // Hidden field that real visitors never fill in; pretend success so bots move on.
  if (body?.website) return NextResponse.json({ ok: true }, { headers: noStore });

  const parsed = parseSubmission(body);
  if (parsed.ok === false) return NextResponse.json({ error: parsed.error }, { status: 400, headers: noStore });

  try {
    const result = await addLead(parsed.value);
    if (result.status === 'rate_limited') {
      return NextResponse.json({ error: 'Too many messages right now. Please email directly instead.' }, { status: 429, headers: noStore });
    }
    if (result.status === 'added' && result.lead) {
      const l = result.lead;
      const cfg = emailConfig();
      if (cfg.enabled && cfg.configured) {
        const text = `New collaboration message\n\nFrom: ${l.name} <${l.email}>\nProduct: ${l.product}${l.link ? ` (${l.link})` : ''}\nStage: ${l.stage || '-'}\nNeeds: ${l.need || '-'}\nDeal: ${l.deal}\n\n${l.message}`;
        await sendReportEmail(`Collaboration: ${l.product} (${l.name})`, text, `<pre style="font-family:inherit;white-space:pre-wrap">${esc(text)}</pre>`)
          .catch(e => console.error('Collaboration notification failed', e));
      }
    }
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (error) {
    console.error('Collaboration message could not be saved', error);
    return NextResponse.json({ error: 'Could not send your message. Please email directly instead.' }, { status: 503, headers: noStore });
  }
}
