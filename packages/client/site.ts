// The public site's search and link-preview pieces (Patch 5: the indev
// password gate and the delisting came off). index.html carries the title,
// description, preview tags and a short no-script summary; this Vite plugin
// adds what needs the site's own address, which the Deploy workflow passes as
// VITE_SITE_URL: the canonical link, the preview's address and picture, the
// game's structured data, robots.txt and sitemap.xml. A build without an
// address (local, CI) gets an open robots.txt and nothing else.

import type { Plugin } from 'vite';

/** The game's name, as the page title and previews show it. */
export const SITE_TITLE = 'Survive and Conquer';

/** One line for search results and link previews (index.html carries the same words). */
export const SITE_DESCRIPTION =
  'A free co-op survival strategy game in your browser. Build a village by day, train troops and hold your walls through endless nights of monsters, alone or with up to 8 friends.';

/** The share picture, in public/ (1200 by 630, from the main menu's battle). */
export const SITE_IMAGE = '/og-image.jpg';

/** The site's address without a trailing slash, or null when none (or not a web address) is given. */
export function siteUrl(raw: string | undefined): string | null {
  const url = raw?.trim().replace(/\/+$/, '') ?? '';
  return /^https?:\/\/[^/\s]+$/.test(url) ? url : null;
}

/** robots.txt: everything open, with the sitemap when the address is known. */
export function robotsTxt(site: string | null): string {
  return `User-agent: *\nAllow: /\n${site ? `\nSitemap: ${site}/sitemap.xml\n` : ''}`;
}

/** sitemap.xml: the game is one page. */
export function sitemapXml(site: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <url><loc>${site}/</loc></url>`,
    '</urlset>',
    '',
  ].join('\n');
}

/** The head tags that need the address: canonical link, preview address and picture, and the game's structured data. */
export function siteHead(site: string): string {
  const game = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: `${site}/`,
    image: `${site}${SITE_IMAGE}`,
    genre: ['Strategy', 'Survival', 'Real-time strategy'],
    gamePlatform: 'Web browser',
    applicationCategory: 'Game',
    operatingSystem: 'Any',
    playMode: ['SinglePlayer', 'CoOp', 'MultiPlayer'],
    numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 8 },
    isAccessibleForFree: true,
  };
  return [
    `<link rel="canonical" href="${site}/" />`,
    `<meta property="og:url" content="${site}/" />`,
    `<meta property="og:image" content="${site}${SITE_IMAGE}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta name="twitter:image" content="${site}${SITE_IMAGE}" />`,
    `<script type="application/ld+json">${JSON.stringify(game)}</script>`,
  ]
    .map((tag) => `    ${tag}`)
    .join('\n');
}

/** The Vite plugin: the address's head tags in index.html, and robots.txt and sitemap.xml beside it. Builds only. */
export function sitePlugin(site: string | null): Plugin {
  return {
    name: 'blockyrts-site',
    apply: 'build',
    transformIndexHtml(html) {
      return site ? html.replace('</head>', `${siteHead(site)}\n  </head>`) : html;
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt(site) });
      if (site) this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml(site) });
    },
  };
}
