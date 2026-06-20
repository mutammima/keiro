/**
 * useBackup — encapsulates the export-to-JSON and restore-from-JSON logic for
 * the Backup & Restore feature in AppFooter.
 */

import { useRef, useState } from 'react';
import { STORAGE_KEYS } from '../utils/constants';
import { markAction } from '../utils/tutorialProgress';

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * Canonical list of every app localStorage key, for documentation and reference.
 * NOTE: export no longer iterates this list — it sweeps every live `inv_` key
 * (see collectBackupKeys) so newly-added keys can never be silently dropped from
 * a backup again. This list is kept current as a human-readable inventory.
 *
 * Data:        inv_number, inv_list, inv_catalog, inv_payments, inv_logo_b64,
 *              inv_stores, inv_store_phones, inv_store_addrs, inv_store_overrides,
 *              inv_pinned_stores, inv_product_names, inv_notes,
 *              inv_so_orders, inv_so_drivers, inv_bridge_requests,
 *              inv_sig_<invoiceNumber> (one per signed invoice),
 *              inv_business_name, inv_business_phone
 * Settings:    inv_dark_mode, inv_accent_color, inv_density, inv_easy_mode,
 *              inv_auto_flag_days, inv_auto_mark_days, inv_user_role, inv_pin,
 *              inv_onboarding_complete
 * Tutorial:    inv_tip_<id> (contextual tip seen), inv_act_<id> (feature
 *              discovered, drives the checklist), inv_pulse_home, inv_seen_<tab>
 *              — all swept automatically by collectBackupKeys (inv_ prefix).
 * Sync:        inv_sync_queue (offline retry outbox) is also swept automatically
 *              so pending cloud writes survive a backup. EDGE CASE: backing up
 *              mid-queue then restoring on another device could replay the same
 *              actions twice — harmless here because every queued op is an
 *              idempotent upsert/delete, but worth knowing. Restoring mid-queue
 *              is unusual; the queue normally drains within seconds of going
 *              back online.
 */

/**
 * Keys that must NEVER be backed up or restored:
 *  - inv_prefill:  transient half-filled form state, not user data
 *  - inv_migrated / inv_migrated_at: the localStorage→Supabase migration markers;
 *    restoring them onto a fresh device would wrongly skip migration and strand
 *    local data
 */
const EXCLUDE_KEYS = new Set([
  STORAGE_KEYS.PREFILL, STORAGE_KEYS.MIGRATED, STORAGE_KEYS.MIGRATED_AT,
  // Marketplace caches are cloud-sourced, cross-user snapshots — not this user's
  // own data. Backing them up would capture other users' listings / orders.
  STORAGE_KEYS.MKT_MY_LISTINGS, STORAGE_KEYS.MKT_LISTINGS, STORAGE_KEYS.MKT_DEMAND,
  // Cached auth uid of whoever was signed in at export time. Restoring it onto
  // a different account flips connection requests between incoming/outgoing
  // until the next cloud refresh re-caches the right uid.
  STORAGE_KEYS.AUTH_UID,
]);

/**
 * Returns every live `inv_` localStorage key except the excluded transient ones.
 * Sweeping localStorage (rather than a hardcoded list) guarantees signatures
 * (inv_sig_*) and any future key are always captured.
 * @returns {string[]}
 */
function collectBackupKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('inv_') && !EXCLUDE_KEYS.has(k)) keys.push(k);
  }
  return keys;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Provides handlers and state for the backup/restore workflow.
 *
 * @returns {{
 *   backupMsg: string,
 *   fileInputRef: React.RefObject,
 *   handleExport: function,
 *   handleImportClick: function,
 *   handleImportFile: function,
 * }}
 */
export function useBackup() {
  const [backupMsg, setBackupMsg] = useState('');
  const fileInputRef = useRef(null);

  // ── Handlers ──────────────────────────────────────────────────────────────

  /**
   * Collects all app data from localStorage, serialises it to JSON,
   * and triggers a browser download of the backup file.
   */
  function handleExport() {
    const data = {};
    collectBackupKeys().forEach(k => {
      const v = localStorage.getItem(k);
      if (v !== null) data[k] = v;
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url; a.download = `keiro-backup-${date}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setBackupMsg('Backup downloaded.');
    setTimeout(() => setBackupMsg(''), 3000);
    markAction('backup');
  }

  /** Programmatically opens the hidden file input for restore. */
  function handleImportClick() { fileInputRef.current?.click(); }

  /**
   * Reads the selected JSON backup file, validates it, writes every key back
   * to localStorage, then reloads the page so all data is reflected in state.
   * @param {React.ChangeEvent<HTMLInputElement>} e - The file input change event.
   */
  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        // A valid backup is any object carrying at least one inv_ key —
        // requiring inv_list specifically rejected store-owner backups
        // (no invoices ever created ⇒ no inv_list key in the export).
        const hasAppData = data && typeof data === 'object' &&
          Object.keys(data).some(k => k.startsWith('inv_'));
        if (!hasAppData) {
          setBackupMsg('Invalid backup file.'); return;
        }
        Object.entries(data).forEach(([k, v]) => {
          if (EXCLUDE_KEYS.has(k)) return; // never restore transient/migration keys
          localStorage.setItem(k, v);
        });
        setBackupMsg('Restore complete — reload to see your data.');
        setTimeout(() => window.location.reload(), 1500);
      } catch {
        setBackupMsg('Could not read file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ── Return ─────────────────────────────────────────────────────────────────
  function clearBackupMsg() { setBackupMsg(''); }

  return { backupMsg, clearBackupMsg, fileInputRef, handleExport, handleImportClick, handleImportFile };
}
