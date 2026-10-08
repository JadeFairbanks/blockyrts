// The site's version line, and the public site's search and preview pieces
// (Patch 5: the password gate and delisting came off; deploy/README.md).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deployVersion, fromTenths, toTenths } from '../../../deploy/scripts/game-version.ts';
import file from '../../../version.json';
import { robotsTxt, SITE_DESCRIPTION, SITE_IMAGE, siteHead, sitemapXml, siteUrl } from '../site.ts';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('game version', () => {
  it('starts at version.json\'s number when nothing is tagged yet', () => {
    expect(deployVersion(file, [], [])).toEqual({ label: `${file.stage} ${file.next}`, tag: `live-${file.next}`, fresh: true });
  });

  it('ships Patch 5 as indev 1.0, after indev 0.9', () => {
    expect(file).toEqual({ stage: 'indev', next: '1.0' });
    expect(deployVersion(file, ['live-0.8', 'live-0.9'], [])).toEqual({ label: 'indev 1.0', tag: 'live-1.0', fresh: true });
  });

  it('goes up by 0.1 each deploy, through whole numbers', () => {
    expect(deployVersion({ stage: 'indev', next: '0.2' }, ['live-0.1', 'live-0.2'], []).label).toBe('indev 0.3');
    expect(deployVersion({ stage: 'indev', next: '0.2' }, ['live-0.9'], []).tag).toBe('live-1.0');
    expect(deployVersion({ stage: 'indev', next: '0.2' }, ['live-0.1', 'live-0.10', 'other', 'live-x'], []).label).toBe('indev 0.2');
  });

  it('takes a bigger step or a new stage from version.json', () => {
    expect(deployVersion({ stage: 'alpha', next: '1.0' }, ['live-0.4'], []).label).toBe('alpha 1.0');
    expect(deployVersion({ stage: 'alpha', next: '1.0' }, ['live-1.3'], []).label).toBe('alpha 1.4');
  });

  it('keeps the version when the same commit is deployed again', () => {
    expect(deployVersion({ stage: 'indev', next: '0.2' }, ['live-0.1', 'live-0.2'], ['live-0.2'])).toEqual({ label: 'indev 0.2', tag: 'live-0.2', fresh: false });
  });

  it('reads and writes tenths', () => {
    expect(toTenths('0.1')).toBe(1);
    expect(toTenths('2')).toBe(20);
    expect(fromTenths(13)).toBe('1.3');
    expect(() => toTenths('0.15')).toThrow();
    expect(() => deployVersion({ stage: ' ', next: '0.1' }, [], [])).toThrow();
  });
});

describe('public site', () => {
  it('has no password gate or delisting left', () => {
    expect(existsSync(new URL('../../../deploy/pages/functions', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../../../deploy/pages/static/_routes.json', import.meta.url))).toBe(false);
    const deploy = read('../../../.github/workflows/deploy.yml');
    expect(deploy).not.toMatch(/balance/i);
    expect(deploy).toContain('VITE_SITE_URL');
  });

  it('keeps only the pages.dev addresses out of search results', () => {
    const rules = read('../../../deploy/pages/static/_headers').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
    expect(rules).toEqual([
      'https://:project.pages.dev/*',
      '  X-Robots-Tag: noindex',
      'https://:version.:project.pages.dev/*',
      '  X-Robots-Tag: noindex',
    ]);
  });

  it('describes the game in the page for search engines and link previews', () => {
    const html = read('../index.html');
    expect(html).not.toMatch(/noindex/);
    for (const name of ['description', 'og:description', 'twitter:description']) expect(html).toContain(`"${name}" content="${SITE_DESCRIPTION}"`);
    expect(html).toContain('<noscript>');
    expect(html).toContain('href="/favicon.svg"');
    expect(existsSync(new URL(`../public${SITE_IMAGE}`, import.meta.url))).toBe(true);
    expect(existsSync(new URL('../public/favicon.svg', import.meta.url))).toBe(true);
  });

  it('opens robots.txt and lists the page in the sitemap when the address is known', () => {
    expect(siteUrl('https://play.example.com/')).toBe('https://play.example.com');
    expect(siteUrl(undefined)).toBeNull();
    expect(siteUrl('play.example.com')).toBeNull();
    expect(robotsTxt(null)).toBe('User-agent: *\nAllow: /\n');
    expect(robotsTxt('https://play.example.com')).toContain('Sitemap: https://play.example.com/sitemap.xml');
    expect(sitemapXml('https://play.example.com')).toContain('<loc>https://play.example.com/</loc>');
    const head = siteHead('https://play.example.com');
    expect(head).toContain('<link rel="canonical" href="https://play.example.com/" />');
    expect(head).toContain(`content="https://play.example.com${SITE_IMAGE}"`);
    const json = /<script type="application\/ld\+json">(.*)<\/script>/.exec(head)?.[1];
    expect(JSON.parse(json ?? '')).toMatchObject({ '@type': 'VideoGame', numberOfPlayers: { maxValue: 8 } });
  });
});
