/**
 * The cowork prompt inlines the migration so the owner can paste one document.
 * Two copies drift; this pins the doc's ```sql block to the .sql file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// eslint-disable-next-line no-undef -- Node global; vitest runs from the repo root
const root = process.cwd();
const norm = s => s.replace(/\r\n/g, '\n').trim();

describe('shared product names SQL', () => {
  it('the cowork doc inlines exactly the .sql file (from the first create index to the end)', () => {
    const sql = readFileSync(resolve(root, 'supabase-shared-product-names.sql'), 'utf8');
    const doc = readFileSync(resolve(root, 'docs/COWORK_SHARED_PRODUCT_NAMES.md'), 'utf8');
    const start = sql.indexOf('-- Barcode lookups across accounts');
    expect(start).toBeGreaterThan(-1);
    const block = doc.match(/```sql\n([\s\S]*?)\n```/);
    expect(block).not.toBeNull();
    expect(norm(block[1])).toBe(norm(sql.slice(start)));
  });
});
