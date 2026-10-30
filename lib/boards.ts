// Direct company job boards on Greenhouse, Lever and Ashby (public, no key needed).
// To follow another company, add its board slug (the last part of its careers URL,
// e.g. boards.greenhouse.io/<slug>) to the right list. Every slug below returned HTTP 200.

export const greenhouse: { slug: string; name: string }[] = [
  ['airbnb', 'Airbnb'], ['stripe', 'Stripe'], ['figma', 'Figma'], ['gitlab', 'GitLab'], ['discord', 'Discord'],
  ['dropbox', 'Dropbox'], ['duolingo', 'Duolingo'], ['asana', 'Asana'], ['coinbase', 'Coinbase'], ['instacart', 'Instacart'],
  ['reddit', 'Reddit'], ['pinterest', 'Pinterest'], ['vercel', 'Vercel'], ['cloudflare', 'Cloudflare'], ['datadog', 'Datadog'],
  ['mongodb', 'MongoDB'], ['elastic', 'Elastic'], ['twilio', 'Twilio'], ['okta', 'Okta'], ['gusto', 'Gusto'],
  ['brex', 'Brex'], ['lyft', 'Lyft'], ['robinhood', 'Robinhood'], ['squarespace', 'Squarespace'], ['mozilla', 'Mozilla'], ['samsara', 'Samsara'],
].map(([slug, name]) => ({ slug, name }));

export const lever: { slug: string; name: string }[] = [
  ['spotify', 'Spotify'], ['outreach', 'Outreach'],
].map(([slug, name]) => ({ slug, name }));

export const ashby: { slug: string; name: string }[] = [
  ['notion', 'Notion'], ['linear', 'Linear'], ['ramp', 'Ramp'], ['openai', 'OpenAI'], ['supabase', 'Supabase'], ['vanta', 'Vanta'],
  ['clickup', 'ClickUp'], ['lemonade', 'Lemonade'], ['sentry', 'Sentry'], ['posthog', 'PostHog'], ['cohere', 'Cohere'], ['perplexity', 'Perplexity'],
].map(([slug, name]) => ({ slug, name }));

const isRemoteText = (s: unknown) => /remote|worldwide|anywhere/i.test(String(s || ''));

// Each mapper reshapes a board's job into the fields norm() in discovery.ts reads.
export const mapGreenhouse = (name: string) => (d: any) =>
  (d.jobs || []).map((j: any) => ({
    title: j.title,
    company_name: j.company_name || name,
    url: j.absolute_url,
    location: j.location?.name || '',
    remote: isRemoteText(j.location?.name),
    publication_date: j.first_published || j.updated_at,
  }));

export const mapLever = (name: string) => (d: any) =>
  (Array.isArray(d) ? d : []).map((j: any) => {
    const where = [j.categories?.location, ...(j.categories?.allLocations || [])].filter(Boolean).join(' • ');
    return {
      title: j.text,
      company_name: name,
      url: j.hostedUrl,
      location: where || j.country || '',
      remote: j.workplaceType === 'remote' || isRemoteText(where),
      publication_date: j.createdAt,
      description: j.descriptionPlain,
    };
  });

// Ashby's isRemote is also true for hybrid roles, so rely on workplaceType instead.
export const mapAshby = (name: string) => (d: any) =>
  (d.jobs || []).filter((j: any) => j.isListed !== false).map((j: any) => ({
    title: j.title,
    company_name: name,
    url: j.jobUrl,
    location: j.location || '',
    remote: String(j.workplaceType).toLowerCase() === 'remote' || isRemoteText(j.location),
    publication_date: j.publishedAt,
    description: j.descriptionPlain,
  }));
