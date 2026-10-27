// ── Public privacy page ──────────────────────────────────────────────────────
// App Store Connect asks for a privacy-policy URL. The policy lives in
// PRIVACY.md (and, in the same words, in src/pages/Legal.jsx), so the page at
// <prod>/privacy is built from PRIVACY.md on every `vite build` (the plugin in
// vite.config.js) rather than kept as a third copy that would drift.
//
// The converter covers what PRIVACY.md uses: # / ## headings, paragraphs,
// "- " lists (with indented continuation lines), **bold**, *italic* and a
// "> " note. Anything else comes through as plain text, escaped. The page is
// static HTML with inline styles and no script, as the site's CSP allows.

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const inline = (s) =>
  escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, (email) => `<a href="mailto:${email}">${email}</a>`);

/**
 * @param {string} md - the markdown subset PRIVACY.md is written in
 * @returns {string} HTML for the page body
 */
export function markdownToHtml(md) {
  const out = [];
  let para = [];
  let quote = [];
  let items = null; // the list's items, each an array of lines

  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    if (quote.length) out.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`);
    if (items) out.push(`<ul>${items.map((lines) => `<li>${inline(lines.join(' '))}</li>`).join('')}</ul>`);
    para = []; quote = []; items = null;
  };

  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flush(); continue; }
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      flush();
      out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      if (!quote.length) flush();
      quote.push(m[1]);
    } else if ((m = line.match(/^[-*]\s+(.*)$/))) {
      if (!items) { flush(); items = []; }
      items.push([m[1]]);
    } else if (items && /^\s+\S/.test(line)) {
      items[items.length - 1].push(line.trim()); // a wrapped list item
    } else {
      if (items || quote.length) flush();
      para.push(line.trim());
    }
  }
  flush();
  return out.join('\n');
}

/**
 * The whole page: PRIVACY.md as HTML, readable on a phone, light or dark.
 * @param {string} md
 * @returns {string}
 */
export function policyPage(md, { title = 'Keiro Privacy Policy' } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; --bg: #ffffff; --text: #1a1d24; --sub: #4b5263; --rule: #e3e6ec; --note: #f4f6fa; --accent: #4A7BF7; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0f1115; --text: #eceef3; --sub: #a8afbd; --rule: #262a33; --note: #171a21; --accent: #7aa0ff; }
  }
  html { background: var(--bg); }
  body { margin: 0 auto; max-width: 720px; padding: 32px 16px 64px; background: var(--bg); color: var(--text);
         font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         overflow-wrap: anywhere; }
  h1 { font-size: 28px; line-height: 1.25; margin: 0 0 4px; }
  h2 { font-size: 19px; margin: 32px 0 8px; padding-top: 16px; border-top: 1px solid var(--rule); }
  p, li { color: var(--sub); }
  strong { color: var(--text); }
  ul { padding-left: 20px; }
  li { margin: 6px 0; }
  blockquote { margin: 16px 0; padding: 12px 16px; background: var(--note); border-left: 3px solid var(--accent); border-radius: 8px; }
  blockquote p { margin: 0; }
  a { color: var(--accent); }
</style>
</head>
<body>
<main>
${markdownToHtml(md)}
</main>
</body>
</html>
`;
}
