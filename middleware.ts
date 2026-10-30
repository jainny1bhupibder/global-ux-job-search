import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

// Basic auth for the dashboard and API when DASHBOARD_USER and DASHBOARD_PASSWORD are set.
// /api/cron is excluded because it authenticates with CRON_SECRET instead.
// /work-with-me and /api/collaborate are the public collaboration page and its form endpoint.
export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!api/cron/|api/collaborate|work-with-me|_next/static|_next/image|favicon.ico).*)'],
};

function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function middleware(req: NextRequest) {
  const user = process.env.DASHBOARD_USER;
  const pass = process.env.DASHBOARD_PASSWORD;
  if (!user || !pass) return NextResponse.next();

  const header = req.headers.get('authorization') || '';
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const i = decoded.indexOf(':');
    if (i >= 0 && same(decoded.slice(0, i), user) && same(decoded.slice(i + 1), pass)) {
      return NextResponse.next();
    }
  }

  return new NextResponse('Authentication required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Global UX Job Search", charset="UTF-8"' },
  });
}
