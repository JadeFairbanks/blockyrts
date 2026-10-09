// The sign-in page's login hash (deploy/pages/functions/_middleware.ts), made
// by the Deploy workflow from the password in the SITE_PASSWORD Actions secret
// (deploy/README.md). The salt is fixed, not drawn from the password, so the
// page that shows it gives nothing away about the password, and the hash, with
// everyone's sign-in cookie, stays the same from one deploy to the next.

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

// bcryptjs is the client's (packages/client/site.ts gives the same copy to the
// sign-in page), so it is loaded from there; these are the two parts used.
interface Bcrypt {
  hashSync(password: string, salt: string): string;
  encodeBase64(bytes: ArrayLike<number>, length: number): string;
}
const bcrypt = createRequire(new URL('../../packages/client/package.json', import.meta.url))('bcryptjs') as Bcrypt;

/** bcrypt's cost, the same as before: about 0.3 s in the browser on sign-in. */
export const COST = 10;

/** The password without surrounding spaces, or null when there is none or it is longer than bcrypt reads (72 bytes). */
export function sitePassword(raw: string | undefined): string | null {
  const password = raw?.trim() ?? '';
  return password && new TextEncoder().encode(password).length <= 72 ? password : null;
}

/** The bcrypt hash the middleware checks sign-ins against. */
export function loginHash(password: string): string {
  const salt = createHash('sha256').update('Survive and Conquer site login').digest().subarray(0, 16);
  return bcrypt.hashSync(password, `$2b$${COST}$${bcrypt.encodeBase64(salt, 16)}`);
}
