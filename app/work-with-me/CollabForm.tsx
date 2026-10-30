'use client';
import { useState } from 'react';

const deals = ['Paid contract', 'Full-time', 'Equity', 'Revenue share', 'Co-founding', 'Not sure yet'];

export default function CollabForm() {
  const [form, setForm] = useState({ name: '', email: '', product: '', link: '', stage: '', need: '', deal: 'Not sure yet', message: '', website: '' });
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    setError('');
    try {
      const r = await fetch('/api/collaborate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Something went wrong. Please try again.');
      setState('sent');
    } catch (err: any) {
      setError(err.message);
      setState('idle');
    }
  }

  if (state === 'sent') return <div className="notice" role="status">Thanks, your message has been received. I will read it and reply by email.</div>;

  return (
    <form className="edit" onSubmit={submit}>
      <label>Your name<input required maxLength={100} value={form.name} onChange={set('name')} autoComplete="name" /></label>
      <label>Your email<input required type="email" maxLength={200} value={form.email} onChange={set('email')} autoComplete="email" /></label>
      <label>Product name<input required maxLength={150} value={form.product} onChange={set('product')} /></label>
      <label>Product link (optional)<input type="url" maxLength={300} placeholder="https://" value={form.link} onChange={set('link')} /></label>
      <label>Stage<input maxLength={60} placeholder="Idea, prototype, live, growing…" value={form.stage} onChange={set('stage')} /></label>
      <label>What you need<input maxLength={200} placeholder="UX audit, full design, co-founder…" value={form.need} onChange={set('need')} /></label>
      <label>How you would like to work together<select value={form.deal} onChange={set('deal')}>{deals.map(d => <option key={d}>{d}</option>)}</select></label>
      <label style={{ gridColumn: '1 / -1' }}>Tell me about it<textarea required minLength={20} maxLength={3000} value={form.message} onChange={set('message')} placeholder="What are you building, who is it for, and what would you like help with?" /></label>
      {/* Honeypot: hidden from people, filled in by bots. */}
      <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={set('website')} style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
      {error && <div className="notice is-error" role="alert" style={{ gridColumn: '1 / -1' }}>{error}</div>}
      <button className="primary" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send message'}</button>
    </form>
  );
}
