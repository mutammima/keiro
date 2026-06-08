/**
 * db.js — ALL raw Supabase database calls live here.
 *
 * Every function returns { data, error } for consistency.
 * RLS policies on each table ensure users only see their own rows —
 * the authenticated Supabase client passes the JWT automatically.
 *
 * Table schema: see SUPABASE_SETUP.md
 */

import { supabase } from './supabase';
import { INVOICE_NUMBER_START } from '../utils/constants';

// ── Auth cache ────────────────────────────────────────────────────────────────
// Cache the user ID so we don't hit supabase.auth.getUser() on every query.
// The auth state listener invalidates it on sign-in / sign-out / token refresh
// so the cached value is always consistent with the current session.

let _cachedUserId = null;

supabase.auth.onAuthStateChange((event, session) => {
  _cachedUserId = session?.user?.id ?? null;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the user id of the currently authenticated user, or null.
 * Uses the module-level cache to avoid a round-trip on every DB call.
 * @returns {Promise<string|null>}
 */
async function getCurrentUserId() {
  if (_cachedUserId !== null) return _cachedUserId;
  const { data } = await supabase.auth.getUser();
  _cachedUserId = data?.user?.id ?? null;
  return _cachedUserId;
}

/**
 * Returns true if there is no real Supabase session,
 * so callers fall back to localStorage gracefully.
 */
async function noSession() {
  const id = await getCurrentUserId();
  return !id;
}

// ── Invoices ──────────────────────────────────────────────────────────────────

/**
 * Fetch all invoices for the current user, newest first, with their line items.
 * Items are stored in a separate `invoice_items` table and joined here.
 * @returns {Promise<{ data: object[]|null, error: object|null }>}
 */
export async function getInvoices() {
  if (await noSession()) return { data: null, error: new Error('no session') };
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        invoice_items (*)
      `)
      .order('created_at', { ascending: false });

    if (error) return { data: null, error };

    // Reshape to match existing app shape: { items: [...], number, ... }
    const shaped = (data || []).map(inv => ({
      ...inv,
      number: inv.invoice_number,
      customerName: inv.customer_name || '',
      paymentMethod: inv.payment_method || 'cash',
      items: (inv.invoice_items || []).map(item => ({
        id: item.id,
        name: item.name,
        qty: item.qty,
        price: item.price,
      })),
      invoice_items: undefined,
    }));

    return { data: shaped, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Save an invoice and its line items.
 * Inserts the invoice row first, then batch-inserts items.
 * @param {object} invoice - Full invoice object from useInvoiceForm.
 * @returns {Promise<{ data: object|null, error: object|null }>}
 */
export async function saveInvoice(invoice) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { data: null, error: new Error('Not authenticated') };

    // Upsert the invoice header. Using upsert (not a plain insert) so that a
    // retried save — after a transient cloud failure, or a re-run migration —
    // converges instead of colliding on the unique(user_id, invoice_number)
    // constraint and erroring out as a duplicate.
    const { data: invRow, error: invErr } = await supabase
      .from('invoices')
      .upsert({
        user_id: userId,
        invoice_number: invoice.number,
        store_name: invoice.storeName,
        customer_name: invoice.customerName || '',
        store_phone: invoice.storePhone || '',
        store_address: invoice.storeAddress || '',
        business_name: invoice.businessName || '',
        business_phone: invoice.businessPhone || '',
        date: invoice.date,
        time: invoice.time || '',
        notes: invoice.notes || '',
        payment_method: invoice.paymentMethod || 'cash',
        payment_status: invoice.paymentStatus || 'unpaid',
        created_at: invoice.createdAt || new Date().toISOString(),
      }, { onConflict: 'user_id,invoice_number' })
      .select()
      .single();

    if (invErr) return { data: null, error: invErr };

    // Replace line items. On an upsert that updated an existing invoice, the
    // old item rows are still attached to invRow.id — clear them first so a
    // re-save doesn't accumulate duplicate line items.
    const { error: clearErr } = await supabase
      .from('invoice_items')
      .delete()
      .eq('invoice_id', invRow.id);

    if (clearErr) return { data: invRow, error: clearErr };

    // Batch-insert the current line items
    if (invoice.items && invoice.items.length > 0) {
      const itemRows = invoice.items.map(item => ({
        invoice_id: invRow.id,
        user_id: userId,
        name: item.name,
        qty: item.qty,
        price: item.price,
      }));

      const { error: itemsErr } = await supabase
        .from('invoice_items')
        .insert(itemRows);

      if (itemsErr) return { data: invRow, error: itemsErr };
    }

    return { data: invRow, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Delete an invoice and its items (cascade handled by FK in DB, or manually here).
 * @param {number} number - Invoice number to delete.
 * @returns {Promise<{ data: null, error: object|null }>}
 */
export async function deleteInvoice(number) {
  try {
    // Delete items first (if no CASCADE defined)
    const { data: invRow } = await supabase
      .from('invoices')
      .select('id')
      .eq('invoice_number', number)
      .single();

    if (invRow?.id) {
      await supabase.from('invoice_items').delete().eq('invoice_id', invRow.id);
    }

    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('invoice_number', number);

    return { data: null, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Update the payment_status of a single invoice.
 * @param {number} number - Invoice number.
 * @param {string} status - 'unpaid' | 'paid' | 'partial'
 * @returns {Promise<{ data: object|null, error: object|null }>}
 */
export async function updateInvoicePaymentStatus(number, status) {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .update({ payment_status: status })
      .eq('invoice_number', number)
      .select()
      .single();

    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Returns the next invoice number for the current user (max + 1, min 1001).
 * @returns {Promise<{ data: number, error: object|null }>}
 */
export async function getNextInvoiceNumber() {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('invoice_number')
      .order('invoice_number', { ascending: false })
      .limit(1);

    if (error) return { data: INVOICE_NUMBER_START + 1, error };
    const max = data?.[0]?.invoice_number ?? INVOICE_NUMBER_START;
    return { data: max + 1, error: null };
  } catch (err) {
    return { data: INVOICE_NUMBER_START + 1, error: err };
  }
}

// ── Products ──────────────────────────────────────────────────────────────────

/**
 * Returns all products as a barcode-keyed object: { barcode: { name, lastPrice } }
 * Matches the shape previously returned by getAllProducts() in storage.js.
 * @returns {Promise<{ data: Object.<string,{name:string,lastPrice:number}>|null, error: object|null }>}
 */
export async function getAllProducts() {
  if (await noSession()) return { data: null, error: new Error('no session') };
  try {
    const { data, error } = await supabase
      .from('products')
      .select('barcode, name, last_price');

    if (error) return { data: null, error };

    const catalog = {};
    (data || []).forEach(row => {
      catalog[row.barcode] = { name: row.name, lastPrice: row.last_price };
    });

    return { data: catalog, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Look up a single product by barcode.
 * @param {string} barcode
 * @returns {Promise<{ data: {name:string,lastPrice:number}|null, error: object|null }>}
 */
export async function getProductByBarcode(barcode) {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('barcode, name, last_price')
      .eq('barcode', barcode)
      .maybeSingle();

    if (error) return { data: null, error };
    if (!data) return { data: null, error: null };
    return { data: { name: data.name, lastPrice: data.last_price }, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Case-insensitive product name search.
 * @param {string} name
 * @returns {Promise<{ data: {name:string,lastPrice:number}|null, error: object|null }>}
 */
export async function getProductByName(name) {
  if (!name?.trim()) return { data: null, error: null };
  try {
    const { data, error } = await supabase
      .from('products')
      .select('barcode, name, last_price')
      .ilike('name', name.trim())
      .limit(1)
      .maybeSingle();

    if (error) return { data: null, error };
    if (!data) return { data: null, error: null };
    return { data: { name: data.name, lastPrice: data.last_price }, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Upsert (insert or update) a product by barcode.
 * @param {string} barcode
 * @param {string} name
 * @param {number} price
 * @returns {Promise<{ data: object|null, error: object|null }>}
 */
export async function saveProductBarcode(barcode, name, price) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { data: null, error: new Error('Not authenticated') };

    const { data, error } = await supabase
      .from('products')
      .upsert(
        { user_id: userId, barcode, name, last_price: Number(price) },
        { onConflict: 'user_id,barcode' }
      )
      .select()
      .single();

    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Update an existing product's name and price.
 * @param {string} barcode
 * @param {string} name
 * @param {number|string} price
 * @returns {Promise<{ data: object|null, error: object|null }>}
 */
export async function updateProduct(barcode, name, price) {
  try {
    const { data, error } = await supabase
      .from('products')
      .update({ name, last_price: Number(price) })
      .eq('barcode', barcode)
      .select()
      .single();

    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Delete a product by barcode.
 * @param {string} barcode
 * @returns {Promise<{ data: null, error: object|null }>}
 */
export async function deleteProduct(barcode) {
  try {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('barcode', barcode);

    return { data: null, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Delete all products for the current user.
 * @returns {Promise<{ data: null, error: object|null }>}
 */
export async function clearAllProducts() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { data: null, error: new Error('Not authenticated') };

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('user_id', userId);

    return { data: null, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

// ── Stores ────────────────────────────────────────────────────────────────────

/**
 * Returns an array of store names for the current user.
 * @returns {Promise<{ data: string[]|null, error: object|null }>}
 */
export async function getStoreNames() {
  if (await noSession()) return { data: null, error: new Error('no session') };
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('name')
      .order('updated_at', { ascending: false });

    if (error) return { data: null, error };
    return { data: (data || []).map(r => r.name), error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Upsert a store name (creates row if it doesn't exist yet).
 * @param {string} name
 * @returns {Promise<{ data: object|null, error: object|null }>}
 */
export async function saveStoreName(name) {
  if (!name?.trim()) return { data: null, error: null };
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { data: null, error: new Error('Not authenticated') };

    const { data, error } = await supabase
      .from('stores')
      .upsert(
        { user_id: userId, name: name.trim(), updated_at: new Date().toISOString() },
        { onConflict: 'user_id,name' }
      )
      .select()
      .single();

    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Returns the phone number for a store.
 * @param {string} storeName
 * @returns {Promise<{ data: string, error: object|null }>}
 */
export async function getStorePhone(storeName) {
  if (!storeName?.trim()) return { data: '', error: null };
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('store_phone')
      .eq('name', storeName.trim())
      .maybeSingle();

    if (error) return { data: '', error };
    return { data: data?.store_phone || '', error: null };
  } catch (err) {
    return { data: '', error: err };
  }
}

/**
 * Upsert store phone (creates store row if needed).
 * @param {string} storeName
 * @param {string} phone
 * @returns {Promise<{ data: object|null, error: object|null }>}
 */
export async function saveStorePhone(storeName, phone) {
  if (!storeName?.trim()) return { data: null, error: null };
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { data: null, error: new Error('Not authenticated') };

    const { data, error } = await supabase
      .from('stores')
      .upsert(
        { user_id: userId, name: storeName.trim(), store_phone: phone.trim(), updated_at: new Date().toISOString() },
        { onConflict: 'user_id,name' }
      )
      .select()
      .single();

    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Returns the address for a store.
 * @param {string} storeName
 * @returns {Promise<{ data: string, error: object|null }>}
 */
export async function getStoreAddress(storeName) {
  if (!storeName?.trim()) return { data: '', error: null };
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('store_address')
      .eq('name', storeName.trim())
      .maybeSingle();

    if (error) return { data: '', error };
    return { data: data?.store_address || '', error: null };
  } catch (err) {
    return { data: '', error: err };
  }
}

/**
 * Upsert store address (creates store row if needed).
 * @param {string} storeName
 * @param {string} address
 * @returns {Promise<{ data: object|null, error: object|null }>}
 */
export async function saveStoreAddress(storeName, address) {
  if (!storeName?.trim()) return { data: null, error: null };
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { data: null, error: new Error('Not authenticated') };

    const { data, error } = await supabase
      .from('stores')
      .upsert(
        { user_id: userId, name: storeName.trim(), store_address: address.trim(), updated_at: new Date().toISOString() },
        { onConflict: 'user_id,name' }
      )
      .select()
      .single();

    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Fetch both phone and address for a store in a single query.
 * Replaces two separate getStorePhone + getStoreAddress calls.
 * @param {string} storeName
 * @returns {Promise<{ data: {phone:string, address:string}, error: object|null }>}
 */
export async function getStoreDetails(storeName) {
  if (!storeName?.trim()) return { data: { phone: '', address: '' }, error: null };
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('store_phone, store_address')
      .eq('name', storeName.trim())
      .maybeSingle();

    if (error) return { data: { phone: '', address: '' }, error };
    return {
      data: { phone: data?.store_phone || '', address: data?.store_address || '' },
      error: null,
    };
  } catch (err) {
    return { data: { phone: '', address: '' }, error: err };
  }
}

/**
 * Upsert both phone and address for a store in a single query.
 * Replaces two separate saveStorePhone + saveStoreAddress calls.
 * @param {string} storeName
 * @param {string} phone
 * @param {string} address
 * @returns {Promise<{ data: object|null, error: object|null }>}
 */
export async function saveStoreDetails(storeName, phone, address) {
  if (!storeName?.trim()) return { data: null, error: null };
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { data: null, error: new Error('Not authenticated') };

    const { data, error } = await supabase
      .from('stores')
      .upsert(
        {
          user_id: userId,
          name: storeName.trim(),
          store_phone: (phone || '').trim(),
          store_address: (address || '').trim(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,name' }
      )
      .select()
      .single();

    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

// ── Store Owner Orders ────────────────────────────────────────────────────────

export async function getSOOrders() {
  if (await noSession()) return { data: null, error: new Error('no session') };
  try {
    const { data, error } = await supabase
      .from('so_orders')
      .select('*')
      .order('created_at', { ascending: false });
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function saveSOOrder(order) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { data: null, error: new Error('Not authenticated') };
    const { data, error } = await supabase
      .from('so_orders')
      .upsert({
        id:            order.id,
        user_id:       userId,
        product_name:  order.productName,
        quantity:      order.quantity,
        delivery_date: order.deliveryDate || '',
        driver_id:     order.driverId    || '',
        driver_name:   order.driverName  || '',
        status:        order.status      || 'pending',
        notes:         order.notes       || '',
        created_at:    order.createdAt   || new Date().toISOString(),
      }, { onConflict: 'id' })
      .select()
      .single();
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function updateSOOrderStatus(id, status) {
  try {
    const { error } = await supabase
      .from('so_orders')
      .update({ status })
      .eq('id', id);
    return { error };
  } catch (err) {
    return { error: err };
  }
}

export async function deleteSOOrder(id) {
  try {
    const { error } = await supabase.from('so_orders').delete().eq('id', id);
    return { error };
  } catch (err) {
    return { error: err };
  }
}

// ── Store Owner Drivers ───────────────────────────────────────────────────────

export async function getSODrivers() {
  if (await noSession()) return { data: null, error: new Error('no session') };
  try {
    const { data, error } = await supabase
      .from('so_drivers')
      .select('*')
      .order('name');
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function saveSODriver(driver) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { data: null, error: new Error('Not authenticated') };
    const { data, error } = await supabase
      .from('so_drivers')
      .upsert({
        id:        driver.id,
        user_id:   userId,
        name:      driver.name,
        phone:     driver.phone     || '',
        inventory: driver.inventory || [],
      }, { onConflict: 'id' })
      .select()
      .single();
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function deleteSODriver(id) {
  try {
    const { error } = await supabase.from('so_drivers').delete().eq('id', id);
    return { error };
  } catch (err) {
    return { error: err };
  }
}

// ── Store Owner → Driver Bridge Requests ──────────────────────────────────────

export async function getBridgeRequests() {
  if (await noSession()) return { data: null, error: new Error('no session') };
  try {
    const { data, error } = await supabase
      .from('so_bridge_requests')
      .select('*')
      .order('created_at', { ascending: false });
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function saveBridgeRequest(req) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { data: null, error: new Error('Not authenticated') };
    const { error } = await supabase
      .from('so_bridge_requests')
      .upsert({
        id:           req.id,
        user_id:      userId,
        product_name: req.productName || '',
        quantity:     Number(req.quantity) || 1,
        notes:        req.notes || '',
        order_id:     req.orderId || '',
        created_at:   req.bridgedAt || new Date().toISOString(),
      }, { onConflict: 'id' });
    return { error };
  } catch (err) {
    return { error: err };
  }
}

export async function deleteBridgeRequest(id) {
  try {
    const { error } = await supabase.from('so_bridge_requests').delete().eq('id', id);
    return { error };
  } catch (err) {
    return { error: err };
  }
}

// ── Invoice Payment Log ───────────────────────────────────────────────────────

export async function getAllInvoicePayments() {
  if (await noSession()) return { data: null, error: new Error('no session') };
  try {
    const { data, error } = await supabase
      .from('invoice_payments')
      .select('*')
      .order('ts', { ascending: false });
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function saveInvoicePayment(payment) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { data: null, error: new Error('Not authenticated') };
    const { error } = await supabase
      .from('invoice_payments')
      .insert({
        id:             payment.id,
        user_id:        userId,
        invoice_number: Number(payment.invoiceNumber),
        amount:         Number(payment.amount),
        note:           payment.note || '',
        ts:             payment.ts  || new Date().toISOString(),
      });
    return { error };
  } catch (err) {
    return { error: err };
  }
}

export async function deleteInvoicePayment(id) {
  try {
    const { error } = await supabase.from('invoice_payments').delete().eq('id', id);
    return { error };
  } catch (err) {
    return { error: err };
  }
}

export async function clearInvoicePayments(invoiceNumber) {
  try {
    const { error } = await supabase
      .from('invoice_payments')
      .delete()
      .eq('invoice_number', invoiceNumber);
    return { error };
  } catch (err) {
    return { error: err };
  }
}

// ── Business info / settings — kept in localStorage (single-user config) ──────
// Delegated to storage.js; see getBusinessName / saveBusinessName etc. there.

// ── Pinned stores — kept in localStorage (UI preference) ─────────────────────
// Delegated to storage.js; see getPinnedStores / togglePinnedStore etc. there.
