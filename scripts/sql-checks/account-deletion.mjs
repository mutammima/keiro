// SQL check for supabase-account-deletion.sql: runs it on PGlite (a real Postgres
// in-process) against tables whose foreign keys copy the live database's delete
// rules, queried 2026-10-26, then checks what docs/specs/2026-10-26-account-deletion.md
// requires. Not part of npm test (PGlite isn't a dependency). To run:
//   mkdir /tmp/pglite && cd /tmp/pglite && npm i @electric-sql/pglite
//   node scripts/sql-checks/account-deletion.mjs /tmp/pglite supabase-account-deletion.sql
import { readFileSync } from 'node:fs';
const [pgliteDir, sqlFile] = process.argv.slice(2);
const { PGlite } = await import(`${pgliteDir}/node_modules/@electric-sql/pglite/dist/index.js`);
const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-0000000000${n}`;
const D = id('d1'), S = id('51'), D2 = id('d2'), O = id('0f');
const USERS = { D, S, D2, O };

const userTables = ['invoices', 'invoice_items', 'invoice_payments', 'invoice_signatures', 'invoice_usage',
  'subscriptions', 'marketplace_listings', 'marketplace_demand', 'products', 'so_bridge_requests',
  'so_drivers', 'so_orders', 'stores'];

await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;

  -- Worst case for profiles: a key that does NOT cascade (the live rule was not queried).
  create table profiles (id uuid primary key references auth.users(id), first_name text);
  -- As live: SET NULL on both sides, CASCADE on invited_by.
  create table connections (
    id text primary key,
    driver_user_id uuid references auth.users(id) on delete set null,
    store_user_id  uuid references auth.users(id) on delete set null,
    invited_by     uuid not null references auth.users(id) on delete cascade,
    status text not null default 'active');
  create table connection_orders (
    id text primary key,
    connection_id  text not null references connections(id) on delete cascade,
    store_user_id  uuid not null references auth.users(id) on delete cascade,
    driver_user_id uuid not null references auth.users(id) on delete cascade);
  create table invoices (
    id serial primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    store_user_id uuid references auth.users(id) on delete set null,
    invoice_number int not null, unique (user_id, invoice_number));
`);
for (const t of userTables.filter((t) => t !== 'invoices')) {
  await db.exec(`create table ${t} (id serial primary key, user_id uuid not null references auth.users(id) on delete cascade)`);
}
for (const [name, u] of Object.entries(USERS)) {
  await db.query('insert into auth.users (id, email) values ($1, $2)', [u, `${name}@test`]);
  await db.query('insert into profiles (id, first_name) values ($1, $2)', [u, name]);
  for (const t of userTables.filter((t) => t !== 'invoices')) await db.query(`insert into ${t} (user_id) values ($1)`, [u]);
}
await db.exec(`
  insert into connections values
    ('c1', '${D}',  '${S}', '${S}',  'active'),    -- S invited D: D is NOT the inviter
    ('c2', '${D2}', '${S}', '${D2}', 'active'),
    ('c3', '${D}',  '${O}', '${O}',  'pending');   -- O asked D to connect
  insert into connection_orders values ('o1', 'c1', '${S}', '${D}'), ('o2', 'c2', '${S}', '${D2}');
  insert into invoices (user_id, store_user_id, invoice_number) values
    ('${D}', '${S}', 1001), ('${D}', null, 1002), ('${D2}', '${S}', 1001), ('${O}', null, 1001);
`);

const sql = readFileSync(sqlFile, 'utf8');
await db.exec(sql);
await db.exec(sql); // safe to re-run

async function as(role, sub, q) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub || ''}', false); set role ${role};`);
  try { return { rows: (await db.query(q)).rows }; }
  catch (e) { return { error: e.message }; }
  finally { await db.exec('reset role;'); }
}
const one = async (q, p = []) => Object.values((await db.query(q, p)).rows[0])[0];
async function rowsOf(u) {
  let n = await one('select count(*)::int from auth.users where id = $1', [u]);
  n += await one('select count(*)::int from profiles where id = $1', [u]);
  for (const t of userTables) n += await one(`select count(*)::int from ${t} where user_id = $1`, [u]);
  n += await one('select count(*)::int from connections where $1 in (driver_user_id, store_user_id, invited_by)', [u]);
  n += await one('select count(*)::int from connection_orders where $1 in (driver_user_id, store_user_id)', [u]);
  return n;
}
let fails = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: ${JSON.stringify(got)}${ok ? '' : ` (want ${JSON.stringify(want)})`}`);
};

const before = { S: await rowsOf(S), D2: await rowsOf(D2), O: await rowsOf(O) };
check('anon cannot call it', /permission denied/.test((await as('anon', '', 'select delete_my_account()')).error || ''), true);
check('signed in with no user id: refused, nothing deleted', [/not signed in/.test((await as('authenticated', '', 'select delete_my_account()')).error || ''), await one('select count(*)::int from auth.users')], [true, 4]);

check('driver D deletes their account: no error', (await as('authenticated', D, 'select delete_my_account()')).error ?? null, null);
check('every row of D is gone (auth, profile, 13 tables, connections, orders)', await rowsOf(D), 0);
check('the connection S made to D is gone, not left pointing at nobody', await one(`select count(*)::int from connections where id = 'c1'`), 0);
check('no connection anywhere is left with a missing side', await one('select count(*)::int from connections where driver_user_id is null or store_user_id is null'), 0);
check('the pending request O sent D is gone', await one(`select count(*)::int from connections where id = 'c3'`), 0);
check('the order on that connection is gone', await one(`select count(*)::int from connection_orders where id = 'o1'`), 0);
check('the invoice D sent store S is gone (owner decision 1)', await one(`select count(*)::int from invoices where store_user_id = '${S}' and invoice_number = 1001 and user_id <> '${D2}'`), 0);
check('store S keeps all its own rows except the D connection and order',
  await rowsOf(S), before.S - 2);
check('driver D2 untouched', await rowsOf(D2), before.D2);
check('O untouched except the request it sent D', await rowsOf(O), before.O - 1);

check('calling it again with the old session does nothing and does not fail', [(await as('authenticated', D, 'select delete_my_account()')).error ?? null, await one('select count(*)::int from auth.users')], [null, 3]);

check('store S deletes its account: no error', (await as('authenticated', S, 'select delete_my_account()')).error ?? null, null);
check('every row of S is gone', await rowsOf(S), 0);
check("D2's invoice to S stays with D2, no longer addressed to anyone",
  (await db.query(`select user_id, store_user_id from invoices where user_id = '${D2}'`)).rows, [{ user_id: D2, store_user_id: null }]);
check('D2 keeps everything except the connection and order with S', await rowsOf(D2), before.D2 - 2);
check('O still untouched', await rowsOf(O), before.O - 1);

console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
