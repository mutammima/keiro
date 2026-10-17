/**
 * The cowork prompt inlines the migration so the owner can paste one document.
 * Two copies drift; this pins the doc's first ```sql block to the .sql file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// eslint-disable-next-line no-undef -- Node global; vitest runs from the repo root
const root = process.cwd();
const norm = s => s.replace(/\r\n/g, '\n').trim();

describe('pricing SQL', () => {
  it('the cowork doc inlines exactly the .sql file (from the first table to the end)', () => {
    const sql = readFileSync(resolve(root, 'supabase-pricing.sql'), 'utf8');
    const doc = readFileSync(resolve(root, 'docs/COWORK_PRICING.md'), 'utf8');
    const start = sql.indexOf('-- Pricing: who is Pro.');
    expect(start).toBeGreaterThan(-1);
    const block = doc.match(/```sql\n([\s\S]*?)\n```/);
    expect(block).not.toBeNull();
    expect(norm(block[1])).toBe(norm(sql.slice(start)));
  });
});
