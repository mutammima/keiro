# Supabase Setup for InvoiceGo

Complete guide to configuring the Supabase project that backs InvoiceGo.

---

## Step-by-step dashboard setup

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Wait for the project to finish provisioning (~2 minutes).
3. In **Project Settings → API**, copy:
   - **Project URL** → paste into `.env` as `VITE_SUPABASE_URL`
   - **anon / public key** → paste into `.env` as `VITE_SUPABASE_ANON_KEY`
4. Open the **SQL Editor** and run the SQL blocks below in order.
5. In **Authentication → Email**, confirm "Enable email confirmations" is set as you prefer (disable for dev, enable for production).
6. Deploy or run `npm run dev`.

---

## SQL — Full schema

Run this entire block in the Supabase SQL Editor.

```sql
-- ── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Stores ──────────────────────────────────────────────────────────────────
create table if not exists stores (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  store_phone   text not null default '',
  store_address text not null default '',
  updated_at    timestamptz not null default now(),

  unique(user_id, name)
);

-- ── Products ─────────────────────────────────────────────────────────────────
create table if not exists products (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  barcode     text not null,
  name        text not null,
  last_price  numeric(10,2) not null default 0,
  updated_at  timestamptz not null default now(),

  unique(user_id, barcode)
);

-- ── Invoices ─────────────────────────────────────────────────────────────────
create table if not exists invoices (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  invoice_number integer not null,
  store_name     text not null default '',
  store_phone    text not null default '',
  store_address  text not null default '',
  business_name  text not null default '',
  business_phone text not null default '',
  date           text not null default '',
  time           text not null default '',
  notes          text not null default '',
  payment_status text not null default 'unpaid',
  created_at     timestamptz not null default now(),

  unique(user_id, invoice_number)
);

-- ── Invoice Items ─────────────────────────────────────────────────────────────
create table if not exists invoice_items (
  id          uuid primary key default uuid_generate_v4(),
  invoice_id  uuid not null references invoices(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  qty         numeric(10,3) not null default 1,
  price       numeric(10,2) not null default 0
);
```

---

## SQL — Enable Row Level Security and policies

Run this block after creating the tables.

```sql
-- ── Enable RLS on all tables ─────────────────────────────────────────────────
alter table stores        enable row level security;
alter table products      enable row level security;
alter table invoices      enable row level security;
alter table invoice_items enable row level security;

-- ── Stores policies ──────────────────────────────────────────────────────────
create policy "stores: users own their rows" on stores
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Products policies ─────────────────────────────────────────────────────────
create policy "products: users own their rows" on products
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Invoices policies ─────────────────────────────────────────────────────────
create policy "invoices: users own their rows" on invoices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Invoice items policies ────────────────────────────────────────────────────
create policy "invoice_items: users own their rows" on invoice_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

---

## SQL — Optional performance indexes

```sql
create index if not exists idx_invoices_user_created   on invoices(user_id, created_at desc);
create index if not exists idx_invoices_user_number    on invoices(user_id, invoice_number desc);
create index if not exists idx_products_user_barcode   on products(user_id, barcode);
create index if not exists idx_products_user_name      on products(user_id, lower(name));
create index if not exists idx_stores_user_name        on stores(user_id, name);
create index if not exists idx_invoice_items_invoice   on invoice_items(invoice_id);
```

---

## Configuration checklist

- [ ] Supabase project created
- [ ] `VITE_SUPABASE_URL` set in `.env`
- [ ] `VITE_SUPABASE_ANON_KEY` set in `.env`
- [ ] `.env` is in `.gitignore` (already done)
- [ ] Schema SQL executed in SQL Editor
- [ ] RLS SQL executed in SQL Editor
- [ ] Indexes SQL executed (optional but recommended)
- [ ] Authentication → Email → "Confirm email" setting configured to your preference
- [ ] Test: open app, create account, create an invoice, check the Supabase Table Editor to confirm the row appears

---

## Table reference

| Table | Key columns | Notes |
|---|---|---|
| `stores` | `user_id`, `name` (unique pair) | Phone + address stored here |
| `products` | `user_id`, `barcode` (unique pair) | `last_price` updated on each save |
| `invoices` | `user_id`, `invoice_number` (unique pair) | Denormalised store/business fields for PDF generation |
| `invoice_items` | `invoice_id`, `user_id` | Cascade-deleted when invoice is deleted |

## Data shape notes

- The app stores `payment_status` (snake_case in DB) but reads it as both `paymentStatus` and `payment_status` — the hooks normalise both.
- `invoice_number` is an integer (not UUID) to preserve the existing 1001, 1002… sequence.
- Business name and phone are stored in `localStorage` only (device preference, not synced).
- Pinned stores are stored in `localStorage` only (UI preference, not synced).
- Product name autocomplete is a local `localStorage` cache derived from the `products` table.
