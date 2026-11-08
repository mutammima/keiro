/**
 * A real Postgres (PGlite, in-process) dressed up like a Supabase project, so
 * tests can run the repo's .sql files and then act as signed-in users through
 * the same row-level security the live database applies.
 *
 * What it imitates:
 *   - the anon / authenticated / service_role roles, with Supabase's default
 *     "every table is granted to anon and authenticated" privileges, so RLS and
 *     triggers are the only thing standing between a user and a row;
 *   - auth.users, auth.uid() and auth.role(), read from request.jwt.claims the
 *     way PostgREST sets them;
 *   - the base invoices / invoice_items tables, which the live project created
 *     before the repo's SQL files existed (supabase-schema.sql ALTERs them).
 *
 * Statements run as the superuser unless wrapped in asUser(), which plays the
 * role a REST call from the app would.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// eslint-disable-next-line no-undef -- Node global; vitest runs from the repo root
const root = process.cwd();

const PRELUDE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
  $$;
  create function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'anon')
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

  -- Base invoicing tables (made by the original app setup, not by the repo SQL).
  create table invoices (
    id             text primary key,
    user_id        uuid not null references auth.users(id) on delete cascade,
    invoice_number bigint,
    created_at     timestamptz not null default now()
  );
  create table invoice_items (
    id         text primary key,
    invoice_id text not null references invoices(id) on delete cascade,
    user_id    uuid not null references auth.users(id) on delete cascade
  );
  alter table invoices      enable row level security;
  alter table invoice_items enable row level security;
`;

/** A fresh database with the prelude and then each repo .sql file, in order. */
export async function supabaseDb(files) {
  const db = new PGlite();
  await db.exec(PRELUDE);
  for (const file of files) {
    await db.exec(readFileSync(resolve(root, file), 'utf8'));
  }
  return db;
}

/** Adds rows to auth.users (as the superuser). */
export async function addUsers(db, ...ids) {
  for (const id of ids) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
  }
}

/**
 * Runs one statement as a signed-in user, the way a REST call from the app
 * would: role authenticated, JWT claims carrying the user's id. Rolls back on
 * error and rethrows it. Returns the result rows.
 */
export async function asUser(db, uid, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await tx.exec('set local role authenticated');
    const { rows } = await tx.query(sql, params);
    return rows;
  });
}
