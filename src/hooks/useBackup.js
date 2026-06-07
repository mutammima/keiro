/**
 * useBackup — encapsulates the export-to-JSON and restore-from-JSON logic for
 * the Backup & Restore feature in AppFooter.
 */

import { useRef, useState } from 'react';

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * All localStorage keys that belong to this app.
 * Used to collect every key during export and validate files during import.
 */
const ALL_KEYS = [
  'inv_number', 'inv_list', 'inv_catalog', 'inv_stores', 'inv_product_names',
  'inv_business_name', 'inv_business_phone', 'inv_store_phones', 'inv_store_addrs',
  'inv_pinned_stores', 'inv_dark_mode',
];

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
    ALL_KEYS.forEach(k => {
      const v = localStorage.getItem(k);
      if (v !== null) data[k] = v;
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url; a.download = `invoicego-backup-${date}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setBackupMsg('Backup downloaded.');
    setTimeout(() => setBackupMsg(''), 3000);
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
        if (typeof data !== 'object' || !data['inv_list']) {
          setBackupMsg('Invalid backup file.'); return;
        }
        Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
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
