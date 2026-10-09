// The site's search and link-preview pieces. The site describes itself as a
// learning project. A sign-in page stands in front of it
// (deploy/pages/functions/_middleware.ts), so search engines and link
// previews read that page, which uses the same words; index.html, behind it,
// carries the title, description, preview tags and a short no-script summary.
// This Vite plugin adds what needs the site's own address, which the Deploy
// workflow passes as VITE_SITE_URL: the canonical link, the preview's address
// and picture, the structured data, robots.txt and sitemap.xml. It also
// writes the sign-in page's copy of bcryptjs. A build without an address
// (local, CI) gets an open robots.txt and the sign-in script.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Plugin } from 'vite';

/** The site's name, as the page title and previews show it. */
export const SITE_TITLE = 'Survive and Conquer';

/** One line for search results and link previews (index.html and the sign-in page carry the same words). */
export const SITE_DESCRIPTION = 'Survive and Conquer is a learning project.';

/** The share picture, in public/ (1200 by 630, from the main menu's battle). */
export const SITE_IMAGE = '/og-image.jpg';

/** Where the sign-in page loads bcryptjs from (its browser build, which sets window.bcrypt). */
export const GATE_SCRIPT = 'gate/bcrypt.js';

/** bcryptjs's browser build, for the sign-in page. */
export function gateScript(): string {
  return readFileSync(createRequire(import.meta.url).resolve('bcryptjs'), 'utf8');
}

/** The site's address without a trailing slash, or null when none (or not a web address) is given. */
export function siteUrl(raw: string | undefined): string | null {
  const url = raw?.trim().replace(/\/+$/, '') ?? '';
  return /^https?:\/\/[^/\s]+$/.test(url) ? url : null;
}

/** robots.txt: everything open, with the sitemap when the address is known. */
export function robotsTxt(site: string | null): string {
  return `User-agent: *\nAllow: /\n${site ? `\nSitemap: ${site}/sitemap.xml\n` : ''}`;
}

/** sitemap.xml: the site is one page. */
export function sitemapXml(site: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <url><loc>${site}/</loc></url>`,
    '</urlset>',
    '',
  ].join('\n');
}

/** The head tags that need the address: canonical link, preview address and picture, and the site's structured data. */
export function siteHead(site: string): string {
  const page = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: `${site}/`,
  };
  return [
    `<link rel="canonical" href="${site}/" />`,
    `<meta property="og:url" content="${site}/" />`,
    `<meta property="og:image" content="${site}${SITE_IMAGE}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta name="twitter:image" content="${site}${SITE_IMAGE}" />`,
    `<script type="application/ld+json">${JSON.stringify(page)}</script>`,
  ]
    .map((tag) => `    ${tag}`)
    .join('\n');
}

/** The Vite plugin: the address's head tags in index.html, robots.txt and sitemap.xml beside it, and the sign-in script. Builds only. */
export function sitePlugin(site: string | null): Plugin {
  return {
    name: 'blockyrts-site',
    apply: 'build',
    transformIndexHtml(html) {
      return site ? html.replace('</head>', `${siteHead(site)}\n  </head>`) : html;
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt(site) });
      this.emitFile({ type: 'asset', fileName: GATE_SCRIPT, source: gateScript() });
      if (site) this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml(site) });
    },
  };
}
