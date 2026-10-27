/**
 * privacyPage.test.js
 *
 * App Store Connect needs a public privacy-policy URL. <prod>/privacy is built
 * from PRIVACY.md on every build (scripts/policyPage.mjs, the plugin in
 * vite.config.js), so it can't drift from the policy the repo and the app carry.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { markdownToHtml, policyPage } from '../../scripts/policyPage.mjs';

// eslint-disable-next-line no-undef -- Node global; vitest runs from the repo root
const read = (name) => readFileSync(resolve(process.cwd(), name), 'utf8');
const doc = (html) => new DOMParser().parseFromString(html, 'text/html');

describe('the public privacy page', () => {
  const md = read('PRIVACY.md');
  const page = doc(policyPage(md));

  it('carries every section of PRIVACY.md, in order', () => {
    const headings = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings.length).toBeGreaterThan(5);
    expect([...page.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(headings);
    expect(page.querySelector('h1').textContent).toBe('Privacy Policy');
  });

  it('is plain, readable HTML: no markdown left over, no script', () => {
    const text = page.body.textContent;
    expect(text).not.toContain('**');
    expect(text).not.toMatch(/^#+ /m);
    expect(page.querySelectorAll('script')).toHaveLength(0);
    expect(page.querySelector('meta[name="viewport"]')).not.toBeNull();
  });

  it('a list item wrapped over several lines stays one item', () => {
    const list = doc(markdownToHtml('- **Account** — the email you\n  use to sign in.\n- Second'));
    expect([...list.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Account — the email you use to sign in.', 'Second']);
    expect(list.querySelector('li strong').textContent).toBe('Account');
  });

  it('a "> " note becomes one quote, and text is escaped, not run', () => {
    const html = markdownToHtml('> **Note:** one\n> two\n\nA <b>tag</b> & "quotes"');
    const parsed = doc(html);
    expect(parsed.querySelector('blockquote').textContent).toBe('Note: one two');
    expect(parsed.querySelector('b')).toBeNull();
    expect(parsed.querySelectorAll('p')[1].textContent).toBe('A <b>tag</b> & "quotes"');
  });

  it('the contact email is a link', () => {
    expect(page.querySelector('a[href^="mailto:"]')).not.toBeNull();
  });
});

describe('where it is served', () => {
  it('vercel.json sends /privacy to the file the build writes', () => {
    const vercel = JSON.parse(read('vercel.json'));
    expect(vercel.rewrites).toContainEqual({ source: '/privacy', destination: '/privacy/index.html' });
    expect(read('vite.config.js')).toContain("fileName: 'privacy/index.html'");
  });
});
