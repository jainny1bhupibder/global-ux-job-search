import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classify, classifyRole, eligibilityOf, enrich, rank, scoreMatch } from '../lib/matching.ts';
import { buildDraft } from '../lib/drafts.ts';
import { profile } from '../lib/profile.ts';

const job = (title: string, location = 'Worldwide', description = '') => ({ id: title, title, company: 'Acme', location, description });

test('target, adjacent and excluded roles', () => {
  for (const t of ['UX/UI Designer', 'UI UX Designer', 'Product Designer', 'Senior Product Designer', 'Lead Product Designer', 'Product Design Lead', 'UI Designer'])
    assert.equal(classifyRole(t).tier, 'target', t);
  for (const t of ['Product Design Director', 'UX Researcher', 'Head of Design'])
    assert.equal(classifyRole(t).tier, 'adjacent', t);
  for (const t of ['Principal Product Manager Strategic Initiatives', 'Product Engineering Lead', 'Technical Product Lead AI Finance App', 'Product Specialist, Agriculture - Australia', 'Senior Software Engineer', 'Graphic Designer', 'Learning Experience Designer'])
    assert.equal(classifyRole(t).tier, 'excluded', t);
});

test('India eligibility', () => {
  assert.equal(eligibilityOf({ location: 'India' }).eligibility, 'india_listed');
  assert.equal(eligibilityOf({ location: 'USA, India, UK' }).eligibility, 'india_listed');
  assert.equal(eligibilityOf({ location: 'Worldwide' }).eligibility, 'worldwide');
  assert.equal(eligibilityOf({ location: 'APAC' }).eligibility, 'region_likely');
  assert.equal(eligibilityOf({ location: 'Remote; eligible countries not specified' }).eligibility, 'uncertain');
  assert.equal(eligibilityOf({ location: 'Remote' }).eligibility, 'uncertain');
  assert.equal(eligibilityOf({ location: 'United Kingdom' }).eligibility, 'restricted');
  assert.equal(eligibilityOf({ location: 'Worldwide', description: 'Candidates must be US based only.' }).eligibility, 'uncertain');
});

test('restricted locations and non-design roles are hidden, not removed', () => {
  assert.equal(classify(job('Product Designer', 'Germany')).recommended, false);
  assert.equal(classify(job('Product Manager', 'India')).recommended, false);
  assert.equal(classify(job('Product Designer', 'India')).recommended, true);
});

test('score explains every factor and never scores unknown salary', () => {
  const j = job('Senior Product Designer', 'India', 'We need a senior designer with 8+ years for our healthcare SaaS dashboard. Figma required. User research a plus.');
  const m = scoreMatch(j, classify(j), profile);
  assert.deepEqual(m.lines.map(l => l.factor), ['Role', 'Seniority', 'Skills', 'India eligibility']);
  assert.ok(m.notScored.some(n => n.startsWith('Salary')));
  assert.ok(m.cautions.some(c => c.includes('figma')), 'unverified tools are flagged');
  assert.ok(m.score >= 85, `score ${m.score}`);
  for (const l of m.lines) assert.ok(l.reason.length > 0);
});

test('years above verified experience lower seniority', () => {
  const j = job('Lead Product Designer', 'India', 'Requires 15+ years of product design experience in a SaaS environment.');
  const line = scoreMatch(j, classify(j), profile).lines.find(l => l.factor === 'Seniority')!;
  assert.equal(line.points, 5);
});

test('stored jobs rank recommended design roles first', () => {
  const jobs = JSON.parse(readFileSync(new URL('../data/jobs.json', import.meta.url), 'utf8'));
  const ranked = rank(enrich(jobs, profile));
  assert.equal(ranked.length, jobs.length, 'no records dropped');
  assert.equal(ranked[0].title, 'Lead Product Designer');
  const recommended = ranked.filter(j => j.classification.recommended).map(j => j.title);
  assert.deepEqual(recommended, ['Lead Product Designer', 'Product Design Lead']);
});

test('draft uses only verified facts and asks about eligibility when unsure', () => {
  const j = job('Product Designer', 'Remote', 'Design our e-commerce checkout and retail storefront.');
  const d = buildDraft(j, classify(j), profile);
  assert.match(d.draft, /12 years/);
  assert.match(d.draft, /Freshco Farms|GL Lighting/);
  assert.match(d.draft, /open to candidates based in India\?/);
  assert.match(d.draft, /Portfolio: https:\/\/bhupinder-portfolio-inky\.vercel\.app/);
  assert.doesNotMatch(d.draft, /figma/i);
  const india = buildDraft(job('Product Designer', 'India'), classify(job('Product Designer', 'India')), profile);
  assert.doesNotMatch(india.draft, /confirm that this role is open/);
});
