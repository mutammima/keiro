/**
 * The cowork prompt inlines the migration so the owner can paste one document.
 * Two copies drift; this pins the doc's first ```sql block to the .sql file.
 * It also pins the parts of the prompt that keep a non-technical owner and a
 * dashboard assistant from doing damage: the account is confirmed by the owner
 * before it is made Pro, the verification can't change his row, and the
 * triggers are looked for in the real database.
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

describe('the pricing SQL keeps each shared rule in one place', () => {
  const sql = readFileSync(resolve(root, 'supabase-pricing.sql'), 'utf8');
  const code = sql.split('\n').map(line => line.replace(/--.*$/, '')).join('\n');   // comments don't count
  const times = (re) => (code.match(re) || []).length;

  it('the free cap (25) is written once', () => {
    expect(times(/\b25\b/g)).toBe(1);
  });

  it('the UTC month is worked out once', () => {
    expect(times(/date_trunc\('month'/g)).toBe(1);
    expect(times(/at time zone 'utc'/g)).toBe(1);
  });

  it('the refusal (message, error code and hint) is written once', () => {
    expect(times(/KEIRO_FREE_LIMIT/g)).toBe(1);
    expect(times(/Free plan:/g)).toBe(1);
    expect(times(/errcode/g)).toBe(1);
  });

  it('every function but my_plan is closed to the public, guests and signed-in users; my_plan is open to signed-in users only', () => {
    const functions = [...code.matchAll(/create or replace function (\w+)\(([^)]*)\)/g)].map(m => ({ name: m[1], args: m[2] }));
    expect(functions.map(f => f.name)).toEqual(expect.arrayContaining(['is_pro', 'my_plan', 'free_cap', 'utc_month', 'refuse_free_limit']));
    for (const { name, args } of functions) {
      const types = args.split(',').map(a => a.trim().split(/\s+/).pop()).filter(Boolean).join(', ');
      const signature = `${name}\\(${types.replace(/[()]/g, '\\$&')}\\)`;
      const revoke = new RegExp(`revoke execute on function ${signature} from public, anon${name === 'my_plan' ? '' : ', authenticated'};`);
      expect(code, `${name} is revoked`).toMatch(revoke);
    }
    expect(code).toMatch(/grant execute on function my_plan\(\) to authenticated;/);
  });

  it('users and guests are given reading only: every privilege is revoked first, then SELECT is granted to signed-in users', () => {
    for (const table of ['subscriptions', 'invoice_usage']) {
      expect(code).toMatch(new RegExp(`revoke all on ${table} from anon, authenticated;`));
      expect(code).toMatch(new RegExp(`grant select on ${table} to authenticated;`));
      expect(code).not.toMatch(new RegExp(`grant (?!select\\b)\\w[^;]* on ${table}`));
    }
  });
});

describe('the pricing cowork doc', () => {
  const sql = readFileSync(resolve(root, 'supabase-pricing.sql'), 'utf8');
  const doc = readFileSync(resolve(root, 'docs/COWORK_PRICING.md'), 'utf8');
  const blocks = [...doc.matchAll(/```(\w*)\n([\s\S]*?)\n```/g)].map(m => ({ lang: m[1], body: m[2] }));
  const between = (from, to) => doc.slice(doc.indexOf(from), doc.indexOf(to));
  const step2 = between('## 2.', '## 3.');
  const verify = between('## 3. Verify', '## 4.');
  const report = doc.slice(doc.indexOf('## 4. Report back'), doc.indexOf('## Later'));
  const blocksIn = (text) => blocks.filter(b => text.includes(b.body)).map(b => b.body);

  it('only the first block is ```sql (the others are plain fences)', () => {
    expect(blocks[0].lang).toBe('sql');
    expect(blocks.slice(1).every(b => b.lang === '')).toBe(true);
  });

  it('step 2 shows the account (email, created, last sign-in, invoice count) and waits for the owner\'s yes before it writes', () => {
    const [check, insert] = blocksIn(step2);
    expect(check).toMatch(/from auth\.users/);
    for (const wanted of ['u.email', 'u.created_at', 'u.last_sign_in_at', 'count(*)', 'from invoices']) expect(check).toContain(wanted);
    expect(check).not.toMatch(/\b(insert|update|delete)\b/i);       // looking, not changing
    expect(insert).toMatch(/^insert into subscriptions/);
    expect(step2.indexOf(check)).toBeLessThan(step2.indexOf(insert));  // the check comes first
    expect(step2).toMatch(/Do not go on until the owner says yes/);
    expect(blocksIn(step2)).toHaveLength(2);
  });

  it('Run 3 changes nothing even if the editor ignores the role switch', () => {
    const run3 = blocks.map(b => b.body).find(b => b.includes('update subscriptions'));
    expect(run3).toContain("update subscriptions set status = status where user_id = 'DAD_ID';");
    expect(run3).not.toMatch(/pro_until|source|now\(\)/);
    expect(blocks.filter(b => /\bupdate subscriptions\b/.test(b.body))).toHaveLength(1);
  });

  it('the verification looks for every trigger the SQL creates, and the one that was already there', () => {
    const created = [...sql.matchAll(/create trigger (\w+)/g)].map(m => m[1]);
    expect(created).toEqual(['trg_invoices_free_limit', 'trg_invoices_count_usage', 'trg_invoices_free_limit_batch']);
    const catalog = blocksIn(verify).find(b => b.includes('pg_trigger'));
    expect(catalog).toContain("tgrelid = 'public.invoices'::regclass");
    for (const name of [...created, 'trg_invoices_updated_at']) expect(verify).toContain('`' + name + '`');
  });

  it('says what to do when a run says the transaction is aborted', () => {
    expect(verify).toContain('current transaction is aborted');
    expect(verify).toMatch(/run `rollback;` on its own, then repeat the run that failed/);
  });

  it('near the top, says what the SQL changes for everyone: 25 a month for any non-Pro driver, as soon as it runs', () => {
    const top = doc.slice(0, doc.indexOf('## 1.'));
    expect(top).toMatch(/as soon as the SQL runs, any signed-in driver account that isn't Pro can upload at most (\d+) new invoices a month/);
    expect(top).toMatch(/the app itself stops at 20/);
    expect(top).toMatch(/Today that only affects test accounts/);
    // the number the owner is told is the number the SQL enforces
    const told = top.match(/can upload at most (\d+) new invoices/)[1];
    expect(sql).toMatch(new RegExp(`function free_cap\\(\\)[\\s\\S]*?select ${told};`));
  });

  it('step 2 does not expect a recent sign-in: last_sign_in_at is the last password/Google sign-in, not the last use', () => {
    expect(step2).not.toMatch(/signed in recently/);
    expect(step2).toMatch(/`last_sign_in_at` is the last time he typed his password or used Google to sign in, not the last time he opened the app/);
    expect(step2).toMatch(/an old date is normal for someone who stays signed in/);
    expect(step2).toMatch(/real warning signs are "never signed in" \(`last_sign_in_at` is empty\) and no invoices/);
  });

  describe('the owner\'s switch (kept for later)', () => {
    const later = doc.slice(doc.indexOf('## Later'));
    const [insert] = blocksIn(step2).slice(1);
    const backToFree = blocksIn(later).find(b => b.startsWith('delete from subscriptions'));

    it('switching someone clears what only a card plan describes, and leaves the Stripe ids alone', () => {
      const update = insert.match(/do update set ([^;]*?)\s*returning/s)[1];
      expect(update).toMatch(/\binterval = null\b/);
      expect(update).toMatch(/\bcancels = false\b/);
      expect(update).not.toMatch(/stripe_/);
      // the date is put in one place only: "until a date" can't leave a second null behind to be mistaken for it
      expect(update).toMatch(/\bpro_until = excluded\.pro_until\b/);
      expect(insert.match(/\bnull\b/g)).toHaveLength(2);   // the select's pro_until (where the date goes), and interval
      expect(later).toMatch(/the `null` right after `'active',`/);
      expect(later).not.toMatch(/in both places/);
    });

    it('Back to Free returns the row it removed, and says no row means stop', () => {
      expect(backToFree).toMatch(/\nreturning user_id;$/);
      expect(later).toMatch(/Expected: one result row/);
      expect(later).toMatch(/No row means nothing was removed/);
      expect(later).toMatch(/stop and tell the owner/i);
    });

    it('a card subscriber is cancelled in Stripe immediately, not at the end of the period, before the switch', () => {
      expect(later).toMatch(/\*\*immediately\*\*/);
      expect(later).toMatch(/not "at the end of the (billing )?period"/);
      expect(later).toMatch(/"subscription ended"/);
      expect(later.indexOf('immediately')).toBeLessThan(later.indexOf('**Free forever:**'));   // the warning comes before the statements
    });
  });

  it('the report asks for the user_id step 2 returned, not a row count', () => {
    expect(report).toContain('`user_id` that step 2 returned');
    expect(report).toContain('trigger check');
    expect(doc).not.toMatch(/row count/i);
  });
});
