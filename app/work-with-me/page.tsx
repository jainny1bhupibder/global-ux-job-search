import type { Metadata } from 'next';
import { profile } from '@/lib/profile';
import CollabForm from './CollabForm';

export const metadata: Metadata = {
  title: 'Work with Bhupinder Kumar',
  description: 'Product designer open to collaborating on products: paid, equity, revenue share or co-founding.',
  robots: { index: true, follow: true },
};

// Public page. Every fact comes from lib/profile.ts, which is copied from the portfolio.
export default function WorkWithMe() {
  return (
    <main className="wrap" style={{ maxWidth: 760 }}>
      <header style={{ marginBottom: 24 }}>
        <div className="eyebrow">Open to collaboration</div>
        <h1 style={{ fontSize: 'clamp(30px,5vw,44px)', letterSpacing: '-.04em', margin: '8px 0' }}>Let’s build your product together</h1>
        <p className="sub">
          I’m {profile.name}, a product designer in {profile.location} with {profile.yearsExperience} years in UX/UI. If you have a product or an idea and
          need a designer, or a partner to build it with, I’d like to hear about it. I’m open to paid work, full-time roles, equity, revenue share or co-founding.
        </p>
        <div className="actions">
          <a className="btn" href={`mailto:${profile.email}`}>{profile.email}</a>
          {profile.portfolioUrl && <a className="btn" href={profile.portfolioUrl} target="_blank" rel="noreferrer">Portfolio ↗</a>}
        </div>
      </header>

      <section className="panel">
        <h2>Recent product work</h2>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, color: '#c0cbe0' }}>
          {profile.projects.map(p => <li key={p.title}><b>{p.title}</b>: {p.summary}</li>)}
        </ul>
      </section>

      <section className="panel">
        <h2>Tell me about your product</h2>
        <CollabForm />
      </section>
      <footer>Messages go to {profile.name} only and are not shared.</footer>
    </main>
  );
}
