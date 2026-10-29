import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Global UX Job Search', description: 'Find and track remote UX, UI and product design jobs.' };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
