// Prints the sign-in hash for the password in SITE_PASSWORD (Deploy writes it
// to a file and gives it to the Pages project; site-login.ts). Prints nothing
// else, so neither the password nor the hash reaches the run's log.
import { loginHash, sitePassword } from './site-login.ts';

const password = sitePassword(process.env.SITE_PASSWORD);
if (!password) {
  console.error('::error::The SITE_PASSWORD secret is missing, blank or longer than 72 characters; add it in Settings > Secrets and variables > Actions (see deploy/README.md).');
  process.exit(1);
}
process.stdout.write(loginHash(password));
