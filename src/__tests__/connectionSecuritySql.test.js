// @vitest-environment node
/**
 * supabase-connection-security.sql, run on a real Postgres (PGlite) on top of
 * the repo's schema, then exercised as signed-in users through RLS.
 *
 * The holes it closes (found 2026-11-07 from the live pg_policies):
 *   1. connections — the sender of a request could accept it themselves, or
 *      insert a connection that was already active, so anyone could connect to
 *      any driver whose id they had (marketplace rows show it) and send orders.
 *   2. marketplace_demand — "claim" let the claimer rewrite every column of an
 *      open request, including who owns it.
 *   3. connection_orders — either side could rewrite the whole order (a driver
 *      could change what the store ordered, or who it was for).
 *
 * Each "still works" test is something the app does today (src/services/db.js);
 * each "can't" test failed before the fix.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { supabaseDb, addUsers, asUser } from './helpers/supabaseDb';

const FILES = [
  'supabase-schema.sql',
  'supabase-marketplace.sql',
  'supabase-connection-orders-updated-at.sql',
  'supabase-connection-security.sql',
];

const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const DRIVER = uid(1), STORE = uid(2), STRANGER = uid(3), OTHER_DRIVER = uid(4);

let db;
let seq = 0;
const nextId = (p) => `${p}-${++seq}`;

beforeAll(async () => {
  db = await supabaseDb(FILES);
  await addUsers(db, DRIVER, STORE, STRANGER, OTHER_DRIVER);
}, 30000);

// ── helpers that mirror the app's own calls ─────────────────────────────────

/** db.requestConnection: the sender fills both sides, status pending. */
function requestConnection(sender, { role, target, status = 'pending', id = nextId('conn') }) {
  return asUser(db, sender, `
    insert into connections (id, invite_code, inviter_role, invited_by, status, driver_user_id, store_user_id)
    values ($1, $2, $3, $4, $5, $6, $7) returning *`,
  [id, id.toUpperCase(), role, sender, status,
    role === 'driver' ? sender : target,
    role === 'store_owner' ? sender : target]);
}

/** db.setConnectionStatus: answer a pending request. */
function setConnectionStatus(who, id, status) {
  return asUser(db, who, `
    update connections set status = $2, activated_at = case when $2 = 'active' then now() end
    where id = $1 and status = 'pending' returning *`, [id, status]);
}

/** A live connection + one order on it, made as the superuser. */
async function seedOrder() {
  const conn = nextId('conn'), order = nextId('order');
  await db.query(`insert into connections (id, invite_code, inviter_role, invited_by, status, driver_user_id, store_user_id)
                  values ($1, $2, 'store_owner', $3, 'active', $4, $3)`, [conn, conn.toUpperCase(), STORE, DRIVER]);
  await db.query(`insert into connection_orders (id, connection_id, store_user_id, driver_user_id, product_name, quantity, price)
                  values ($1, $2, $3, $4, 'Chips', 10, 2.5)`, [order, conn, STORE, DRIVER]);
  return order;
}

/** An open marketplace request by the store, made as the superuser. */
async function seedDemand() {
  const id = nextId('demand');
  await db.query(`insert into marketplace_demand (id, user_id, store_name, product_name, quantity, target_price)
                  values ($1, $2, 'Corner Store', 'Ice', 5, 3)`, [id, STORE]);
  return id;
}

/** RLS refusals and the guard triggers both raise insufficient_privilege. */
const REFUSED = { code: '42501' };

const row = async (table, id) => (await db.query(`select * from ${table} where id = $1`, [id])).rows[0];

// ── 1. connections ───────────────────────────────────────────────────────────

describe('connections', () => {
  it('still works: a driver sends a store a request, and the store accepts it', async () => {
    const [c] = await requestConnection(DRIVER, { role: 'driver', target: STORE });
    expect(c.status).toBe('pending');
    const [accepted] = await setConnectionStatus(STORE, c.id, 'active');
    expect(accepted.status).toBe('active');
  });

  it('still works: the store declines a request', async () => {
    const [c] = await requestConnection(DRIVER, { role: 'driver', target: STORE });
    const [declined] = await setConnectionStatus(STORE, c.id, 'declined');
    expect(declined.status).toBe('declined');
  });

  it('still works: an invite code is made with only the sender on it, and redeemed by code', async () => {
    const id = nextId('conn');
    await asUser(db, DRIVER, `
      insert into connections (id, invite_code, inviter_role, invited_by, status, driver_user_id, store_user_id)
      values ($1, $2, 'driver', $3, 'pending', $3, null)`, [id, id.toUpperCase(), DRIVER]);
    const [redeemed] = await asUser(db, STORE, 'select * from redeem_connection($1, $2)', [id.toUpperCase(), 'Corner Store']);
    expect(redeemed.status).toBe('active');
    expect(redeemed.store_user_id).toBe(STORE);
  });

  it("can't: the sender accepts their own request", async () => {
    const [c] = await requestConnection(STRANGER, { role: 'store_owner', target: DRIVER });
    await expect(setConnectionStatus(STRANGER, c.id, 'active')).rejects.toMatchObject(REFUSED);
    expect((await row('connections', c.id)).status).toBe('pending');
  });

  it("can't: someone creates a connection that is already active", async () => {
    await expect(requestConnection(STRANGER, { role: 'store_owner', target: DRIVER, status: 'active' }))
      .rejects.toMatchObject(REFUSED);
  });

  it("can't: someone sends a request on another account's behalf", async () => {
    const id = nextId('conn');
    await expect(asUser(db, STRANGER, `
      insert into connections (id, invite_code, inviter_role, invited_by, status, driver_user_id, store_user_id)
      values ($1, $2, 'store_owner', $3, 'pending', $4, $5)`, [id, id.toUpperCase(), STRANGER, DRIVER, STORE]))
      .rejects.toMatchObject(REFUSED);
  });

  it("can't: the receiver swaps who is on the connection while answering", async () => {
    const [c] = await requestConnection(DRIVER, { role: 'driver', target: STORE });
    await expect(asUser(db, STORE, `update connections set status = 'active', driver_user_id = $2 where id = $1`,
      [c.id, OTHER_DRIVER])).rejects.toMatchObject(REFUSED);
    expect((await row('connections', c.id)).driver_user_id).toBe(DRIVER);
  });

  it("can't: an answered request is changed again", async () => {
    const [c] = await requestConnection(DRIVER, { role: 'driver', target: STORE });
    await setConnectionStatus(STORE, c.id, 'declined');
    await expect(asUser(db, STORE, `update connections set status = 'active' where id = $1`, [c.id]))
      .rejects.toMatchObject(REFUSED);
    expect((await row('connections', c.id)).status).toBe('declined');
  });
});

// ── 2. connection orders ────────────────────────────────────────────────────

/** db.updateConnectionOrder: the only columns the app ever patches. */
function patchOrder(who, id, patch) {
  const cols = Object.keys(patch);
  const set = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
  return asUser(db, who, `update connection_orders set ${set}, updated_at = now() where id = $1 returning *`,
    [id, ...cols.map(c => patch[c])]);
}

describe('connection orders', () => {
  it('still works: the driver accepts, then delivers with the invoice number', async () => {
    const id = await seedOrder();
    await patchOrder(DRIVER, id, { status: 'accepted' });
    const [o] = await patchOrder(DRIVER, id, { status: 'delivered', invoice_number: 1042 });
    expect(o.status).toBe('delivered');
    expect(Number(o.invoice_number)).toBe(1042);
  });

  it('still works: the store cancels, and confirms what it received', async () => {
    const id = await seedOrder();
    await patchOrder(STORE, id, { received_confirmed: true, received_quantity: 9, receiving_notes: 'one bag torn' });
    const [o] = await patchOrder(STORE, id, { status: 'cancelled' });
    expect(o.status).toBe('cancelled');
    expect(o.received_quantity).toBe(9);
  });

  it("can't: the driver changes what the store ordered", async () => {
    const id = await seedOrder();
    await expect(patchOrder(DRIVER, id, { quantity: 100 })).rejects.toMatchObject(REFUSED);
    await expect(patchOrder(DRIVER, id, { price: 99 })).rejects.toMatchObject(REFUSED);
    const o = await row('connection_orders', id);
    expect(Number(o.quantity)).toBe(10);
    expect(Number(o.price)).toBe(2.5);
  });

  it("can't: the store hands the order to a different driver", async () => {
    const id = await seedOrder();
    await expect(patchOrder(STORE, id, { driver_user_id: OTHER_DRIVER })).rejects.toMatchObject(REFUSED);
    expect((await row('connection_orders', id)).driver_user_id).toBe(DRIVER);
  });

  it("can't: the store stamps the driver's invoice number", async () => {
    const id = await seedOrder();
    await expect(patchOrder(STORE, id, { invoice_number: 7 })).rejects.toMatchObject(REFUSED);
  });

  it("can't: the driver confirms receiving for the store", async () => {
    const id = await seedOrder();
    await expect(patchOrder(DRIVER, id, { received_confirmed: true })).rejects.toMatchObject(REFUSED);
  });
});

// ── 3. marketplace requests ─────────────────────────────────────────────────

/** db.claimMarketplaceDemand. */
function claim(who, id, extra = '') {
  return asUser(db, who, `
    update marketplace_demand set status = 'claimed', claimed_by = $2, claimed_name = 'Dan', updated_at = now() ${extra}
    where id = $1 and status = 'open' returning *`, [id, who]);
}

describe('marketplace requests', () => {
  it('still works: a driver claims an open request', async () => {
    const id = await seedDemand();
    const [d] = await claim(DRIVER, id);
    expect(d.status).toBe('claimed');
    expect(d.claimed_by).toBe(DRIVER);
  });

  it('still works: the store edits its own request', async () => {
    const id = await seedDemand();
    const [d] = await asUser(db, STORE, `update marketplace_demand set quantity = 8 where id = $1 returning *`, [id]);
    expect(d.quantity).toBe(8);
  });

  it("can't: the claimer takes ownership of the request", async () => {
    const id = await seedDemand();
    await expect(claim(STRANGER, id, `, user_id = '${STRANGER}'`)).rejects.toMatchObject(REFUSED);
    expect((await row('marketplace_demand', id)).user_id).toBe(STORE);
  });

  it("can't: the claimer changes the request's details", async () => {
    const id = await seedDemand();
    await expect(claim(STRANGER, id, ', target_price = 0')).rejects.toMatchObject(REFUSED);
    expect(Number((await row('marketplace_demand', id)).target_price)).toBe(3);
  });

  it("can't: someone who isn't claiming it edits an open request", async () => {
    const id = await seedDemand();
    await expect(asUser(db, STRANGER, `update marketplace_demand set notes = 'spam', claimed_by = $2 where id = $1`,
      [id, STRANGER])).rejects.toMatchObject(REFUSED);
  });
});

// ── running it ──────────────────────────────────────────────────────────────

describe('the migration', () => {
  it('is safe to run twice, and the rules still hold after', async () => {
    const twice = await supabaseDb([...FILES, 'supabase-connection-security.sql']);
    await addUsers(twice, DRIVER, STORE);
    await twice.query(`insert into connections (id, invite_code, inviter_role, invited_by, status, driver_user_id, store_user_id)
                       values ('c', 'C', 'driver', $1, 'pending', $1, $2)`, [DRIVER, STORE]);
    await expect(asUser(twice, DRIVER, `update connections set status = 'active' where id = 'c'`))
      .rejects.toMatchObject(REFUSED);
    const { rows } = await twice.query(
      `select count(*)::int n from pg_trigger where tgname = 'trg_connections_guard'`);
    expect(rows[0].n).toBe(1);
  });
});

// ── the dashboard (superuser) is never blocked ──────────────────────────────

describe('the owner in the Supabase dashboard', () => {
  it('can still fix any row directly', async () => {
    const id = await seedOrder();
    await db.query(`update connection_orders set quantity = 3, driver_user_id = $2 where id = $1`, [id, OTHER_DRIVER]);
    expect(Number((await row('connection_orders', id)).quantity)).toBe(3);
  });
});
