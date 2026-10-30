// Verified candidate profile used for matching and drafts.
// Every fact here is copied from the portfolio source
// (~/Documents/Bhupinder-Portfolio/src/app/portfolio/content.ts).
// Do not add skills, tools, employers or salary figures that are not verified there.
// Fields set to null are unknown and are reported as "not scored" rather than guessed.

export type Skill = { label: string; keywords: string[]; evidence: string };
export type ProjectRef = { title: string; summary: string; domains: string[] };

export type Profile = {
  name: string;
  location: string;
  country: string;
  yearsExperience: number;
  email: string;
  portfolioUrl: string | null;
  targetRoles: string[];
  skills: Skill[];
  projects: ProjectRef[];
  // Minimum acceptable annual salary in USD. Not stated in the portfolio, so salary is not scored.
  salaryMinUsd: number | null;
  source: string;
};

export const profile: Profile = {
  name: 'Bhupinder Kumar',
  location: 'Chandigarh, India',
  country: 'India',
  yearsExperience: 12,
  email: 'bhupinder3kumar@gmail.com',
  portfolioUrl: 'https://bhupinder-portfolio-inky.vercel.app/',
  targetRoles: ['UX/UI Designer', 'Product Designer', 'Senior Product Designer', 'Lead Product Designer'],
  skills: [
    { label: 'UX design & research', keywords: ['ux research', 'user research', 'usability', 'ux design', 'user experience', 'research'], evidence: 'Portfolio strength: UX DESIGN & RESEARCH' },
    { label: 'UI / visual design', keywords: ['ui design', 'visual design', 'user interface', 'interface design', 'ui/ux', 'ux/ui'], evidence: 'Portfolio strength: UI / VISUAL DESIGN' },
    { label: 'Web design', keywords: ['web design', 'website', 'responsive', 'web app'], evidence: 'Portfolio strength: WEB DESIGN' },
    { label: 'E-commerce', keywords: ['e-commerce', 'ecommerce', 'retail', 'storefront', 'checkout', 'shopping'], evidence: 'Portfolio strength: E-COMMERCE (Freshco Farms, GL Lighting)' },
    { label: 'Healthcare SaaS', keywords: ['healthcare', 'health care', 'clinic', 'medical', 'patient', 'health tech', 'healthtech'], evidence: 'Portfolio strength: HEALTHCARE SAAS (Docze)' },
    { label: 'SaaS / B2B workflows', keywords: ['saas', 'b2b', 'workflow', 'dashboard', 'enterprise'], evidence: 'Portfolio projects: Hisab, Docze, Mehman' },
    { label: 'Finance products', keywords: ['fintech', 'finance', 'invoice', 'invoicing', 'payments', 'accounting'], evidence: 'Portfolio project: Hisab (finance SaaS)' },
    { label: 'Hospitality operations', keywords: ['hotel', 'hospitality', 'property management', 'booking'], evidence: 'Portfolio project: Mehman (hotel PMS)' },
    { label: 'End-to-end product design', keywords: ['end-to-end', 'end to end', 'prototype', 'prototyping', 'discovery'], evidence: 'Portfolio: end-to-end UX/UI design; process Discover → Validate' },
  ],
  projects: [
    { title: 'Freshco Farms', summary: 'end-to-end UX/UI for an orchard e-commerce storefront with delivery checks and variety comparison', domains: ['E-commerce'] },
    { title: 'Hisab', summary: 'UX/UI for a business finance workspace covering onboarding, dashboards, invoices and payments', domains: ['Finance products', 'SaaS / B2B workflows'] },
    { title: 'Docze', summary: 'end-to-end UX/UI for healthcare practice-management software spanning booking, scheduling and patient records', domains: ['Healthcare SaaS', 'SaaS / B2B workflows'] },
    { title: 'GL Lighting', summary: 'UX/UI for a visual lighting and décor storefront', domains: ['E-commerce'] },
    { title: 'Mehman', summary: 'UX/UI for a hotel property-management operations dashboard', domains: ['Hospitality operations', 'SaaS / B2B workflows'] },
  ],
  salaryMinUsd: null,
  source: 'Portfolio content.ts (verified by candidate)',
};
