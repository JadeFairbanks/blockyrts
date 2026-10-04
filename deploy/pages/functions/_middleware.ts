// Cloudflare Pages middleware for the indev site: a basic-auth gate and
// search-engine delisting on every page of the Pages project (the play
// domain, the pages.dev mirror and /balance/). It is a deterrent, not
// security. The game's data files (/assets/, /models/, /audio/) skip it, see
// deploy/pages/static/_routes.json. When the gate comes off, remove the
// delisting at the same time and add SEO (deploy/README.md).

/** SHA-256 of "<username>:<password>", so the words are not in the repository as text. */
export const LOGIN_SHA256 = 'ff6c293959ec3f658134edc2e4f8b484229f6b39aea759defbe2c3aa162c45de';
export const NOINDEX = 'noindex, nofollow, noarchive';
const REALM = 'Survive and Conquer (indev)';

interface PagesContext {
  request: Request;
  next: () => Promise<Response>;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** True when an Authorization header carries the indev login. */
export async function loginOk(header: string | null): Promise<boolean> {
  const m = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(header ?? '');
  if (!m) return false;
  let pair: string;
  try {
    pair = atob(m[1]!);
  } catch {
    return false;
  }
  return (await sha256Hex(pair)) === LOGIN_SHA256;
}

export async function onRequest({ request, next }: PagesContext): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === '/robots.txt') {
    return new Response('User-agent: *\nDisallow: /\n', {
      headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': NOINDEX },
    });
  }
  if (!(await loginOk(request.headers.get('authorization')))) {
    return new Response('<!doctype html><title>Survive and Conquer</title><p>This test build is private.</p>\n', {
      status: 401,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'www-authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
        'cache-control': 'no-store',
        'x-robots-tag': NOINDEX,
      },
    });
  }
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set('x-robots-tag', NOINDEX);
  return out;
}
