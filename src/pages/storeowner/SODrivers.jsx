/**
 * SODrivers — Tab 3 for Store Owner role.
 * Driver directory — add drivers, manage their inventory.
 * Store owners use this to know which driver carries which products
 * before assigning an order.
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../../theme';
import { getDrivers, saveDriver, deleteDriver, loadDriversFromCloud } from '../../utils/storeOwnerStorage';
import AppFooter from '../../components/navigation/AppFooter';

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

export default function SODrivers({ onOpenDrawer, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [drivers,       setDrivers]       = useState(() => getDrivers());
  const [showAdd,       setShowAdd]       = useState(false);

  // Fetch latest from cloud on mount
  useEffect(() => {
    loadDriversFromCloud().then(list => setDrivers(list)).catch(() => {});
  }, []);
  const [expandedId,    setExpandedId]    = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Add-driver form state
  const [newName,  setNewName]  = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [addError, setAddError] = useState('');

  // Edit-inventory state
  const [editingInventoryId, setEditingInventoryId] = useState(null);
  const [newItem, setNewItem] = useState('');

  function refresh() { setDrivers(getDrivers()); }

  function handleAddDriver() {
    if (!newName.trim()) { setAddError('Driver name is required.'); return; }
    saveDriver({ id: uid(), name: newName.trim(), phone: newPhone.trim(), inventory: [] });
    setNewName(''); setNewPhone(''); setAddError(''); setShowAdd(false);
    refresh();
  }

  function handleDeleteDriver() {
    if (!confirmDelete) return;
    deleteDriver(confirmDelete.id);
    setConfirmDelete(null);
    if (expandedId === confirmDelete.id) setExpandedId(null);
    refresh();
  }

  function handleAddInventoryItem(driverId) {
    if (!newItem.trim()) return;
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) return;
    if (driver.inventory.map(i => i.toLowerCase()).includes(newItem.trim().toLowerCase())) {
      setNewItem('');
      return;
    }
    saveDriver({ ...driver, inventory: [...driver.inventory, newItem.trim()] });
    setNewItem('');
    refresh();
  }

  function handleRemoveInventoryItem(driverId, item) {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) return;
    saveDriver({ ...driver, inventory: driver.inventory.filter(i => i !== item) });
    refresh();
  }

  const inp = { background: C.inputBg, borderColor: C.inputBorder, color: C.text };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: C.bg, overflowX: 'clip' }}>

      {/* Header */}
      <div style={{ ...glassStyle(dark), padding: '14px 20px 12px', paddingTop: 'max(14px, env(safe-area-inset-top))', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 36 }} />
        <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: C.text, textAlign: 'center' }}>Drivers</span>
        <button
          data-tutorial="so-drivers-add-btn"
          onClick={() => { setShowAdd(v => !v); setAddError(''); }}
          style={{ background: ACCENT, border: 'none', color: '#fff', fontWeight: 600, fontSize: 13, padding: '7px 16px', borderRadius: 10, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
        >
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>

      <div style={{ padding: '14px 16px 100px', maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Add driver form */}
        {showAdd && (
          <div style={s.card(C)}>
            <p style={s.sectionLabel(C)}>New Driver</p>
            <label style={s.label(C)}>Name</label>
            <input data-tutorial="so-drivers-name-input" style={{ ...s.input, ...inp }} placeholder="e.g. John Smith"
              value={newName} onChange={e => { setNewName(e.target.value); setAddError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleAddDriver()} autoFocus />
            <label style={{ ...s.label(C), marginTop: 12 }}>Phone <span style={{ color: C.textMuted, fontWeight: 400 }}>(optional)</span></label>
            <input style={{ ...s.input, ...inp }} placeholder="e.g. 813-555-0123"
              value={newPhone} onChange={e => setNewPhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddDriver()} />
            {addError && <p style={{ fontSize: 12, color: C.danger, margin: '2px 0 0', fontWeight: 600 }}>{addError}</p>}
            <button onClick={handleAddDriver} style={{ ...s.accentBtn, marginTop: 14, width: '100%' }}>
              Save Driver
            </button>
          </div>
        )}

        {/* Empty state */}
        {drivers.length === 0 && !showAdd && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>No drivers yet</p>
            <p style={{ fontSize: 13, color: C.textMuted, margin: '0 0 20px', maxWidth: 260, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
              Add your delivery drivers and their inventory so you know who to contact.
            </p>
            <button style={s.accentBtn} onClick={() => setShowAdd(true)}>+ Add Driver</button>
          </div>
        )}

        {/* Driver list */}
        {drivers.map(driver => {
          const expanded = expandedId === driver.id;
          const editingInventory = editingInventoryId === driver.id;

          return (
            <div key={driver.id} style={{ ...s.card(C), padding: 0, overflow: 'hidden' }}>

              {/* Driver row */}
              <button
                onClick={() => setExpandedId(expanded ? null : driver.id)}
                style={{ width: '100%', background: 'none', border: 'none', padding: '14px 16px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}
              >
                {/* Avatar */}
                <div style={{ width: 40, height: 40, borderRadius: 20, background: dark ? '#1e1e1e' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: ACCENT }}>
                    {driver.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{driver.name}</div>
                  {driver.phone && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{driver.phone}</div>}
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>
                    {driver.inventory.length === 0
                      ? 'No inventory added'
                      : `${driver.inventory.length} product${driver.inventory.length !== 1 ? 's' : ''}`}
                  </div>
                </div>
                <span style={{ color: C.textMuted, fontSize: 13, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
              </button>

              {/* Expanded inventory section */}
              {expanded && (
                <div style={{ borderTop: `1px solid ${C.divider}`, padding: '12px 16px' }}>

                  {/* Inventory tags */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {driver.inventory.length === 0 && (
                      <span style={{ fontSize: 12, color: C.textMuted, fontStyle: 'italic' }}>No products listed yet.</span>
                    )}
                    {driver.inventory.map(item => (
                      <div key={item} style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '4px 10px', borderRadius: 20,
                        background: dark ? '#1e1e1e' : '#f3f4f6',
                        border: `1px solid ${C.divider}`,
                        fontSize: 12, fontWeight: 500, color: C.textSub,
                      }}>
                        {item}
                        {editingInventory && (
                          <button
                            onClick={() => handleRemoveInventoryItem(driver.id, item)}
                            style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', padding: '0 0 0 2px', fontSize: 11, fontWeight: 700, lineHeight: 1, WebkitTapHighlightColor: 'transparent' }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add inventory item input (when editing) */}
                  {editingInventory && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <input
                        style={{ ...s.input, ...inp, flex: 1, marginBottom: 0, height: 38, fontSize: 14 }}
                        placeholder="Add product..."
                        value={newItem}
                        onChange={e => setNewItem(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddInventoryItem(driver.id)}
                        autoFocus
                      />
                      <button
                        onClick={() => handleAddInventoryItem(driver.id)}
                        style={{ height: 38, padding: '0 14px', background: ACCENT, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', flexShrink: 0 }}
                      >
                        Add
                      </button>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => { setEditingInventoryId(editingInventory ? null : driver.id); setNewItem(''); }}
                      style={{ ...s.outlineBtn(C), color: ACCENT, borderColor: ACCENT, fontSize: 12 }}
                    >
                      {editingInventory ? 'Done' : 'Edit Inventory'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete({ id: driver.id, name: driver.name })}
                      style={{ ...s.outlineBtn(C), color: C.danger, borderColor: C.danger, fontSize: 12 }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <AppFooter onNav={onNav} />
      </div>

      {/* Delete confirm modal */}
      {confirmDelete && createPortal(
        <div style={s.overlay} onClick={() => setConfirmDelete(null)}>
          <div style={{ ...s.modal(C) }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 17, fontWeight: 800, color: C.text, margin: '0 0 8px' }}>Remove driver?</p>
            <p style={{ fontSize: 14, color: C.textSub, margin: '0 0 20px', lineHeight: 1.5 }}>
              Remove "{confirmDelete.name}" from your drivers? This won't delete their orders.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={{ ...s.modalBtn(C), background: C.inputBg, color: C.text, borderColor: C.inputBorder }}
                onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button style={{ ...s.modalBtn(C), background: C.danger, color: '#fff', borderColor: C.danger }}
                onClick={handleDeleteDriver}>Remove</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

const s = {
  card: (C) => ({ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 18 }),
  sectionLabel: (C) => ({ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textMuted, margin: '0 0 12px' }),
  label: (C) => ({ display: 'block', fontSize: 13, fontWeight: 500, color: C.textSub, marginBottom: 6 }),
  input: { width: '100%', boxSizing: 'border-box', height: 46, fontSize: 16, padding: '0 14px', border: '1px solid', borderRadius: 12, outline: 'none', WebkitAppearance: 'none', marginBottom: 4 },
  iconBtn: (C) => ({ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: C.text, padding: '4px 6px', WebkitTapHighlightColor: 'transparent', lineHeight: 1 }),
  accentBtn: { background: ACCENT, border: 'none', color: '#fff', padding: '11px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' },
  outlineBtn: (C) => ({ background: 'none', border: '1.5px solid', borderRadius: 10, padding: '7px 14px', fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }),
  overlay: { position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: (C) => ({ width: '100%', maxWidth: 340, borderRadius: 18, border: `1px solid ${C.cardBorder}`, background: C.card, padding: '22px 20px 18px', boxShadow: '0 16px 48px rgba(0,0,0,0.35)' }),
  modalBtn: (C) => ({ flex: 1, height: 46, borderRadius: 12, border: '1px solid', fontSize: 15, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }),
};
