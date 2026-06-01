/**
 * Notes — simple notepad. Notes are stored in localStorage.
 */

import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../../theme';

const STORAGE_KEY = 'inv_notes';

function loadNotes() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveNotes(notes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}
function uid() { return '_' + Math.random().toString(36).slice(2) + Date.now(); }

export default function Notes({ onOpenDrawer }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [notes, setNotes] = useState(() => loadNotes());
  const [showCompose, setShowCompose] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody]   = useState('');
  const [editingId, setEditingId]   = useState(null);
  const textRef = useRef(null);

  useEffect(() => { saveNotes(notes); }, [notes]);

  function openNew() {
    setDraftTitle(''); setDraftBody(''); setEditingId(null); setShowCompose(true);
    setTimeout(() => textRef.current?.focus(), 80);
  }

  function openEdit(note) {
    setDraftTitle(note.title); setDraftBody(note.body); setEditingId(note.id); setShowCompose(true);
    setTimeout(() => textRef.current?.focus(), 80);
  }

  function saveNote() {
    const title = draftTitle.trim();
    const body  = draftBody.trim();
    if (!body && !title) return;
    if (editingId) {
      setNotes(ns => ns.map(n => n.id === editingId ? { ...n, title, body, updatedAt: new Date().toISOString() } : n));
    } else {
      setNotes(ns => [{ id: uid(), title, body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...ns]);
    }
    setShowCompose(false);
  }

  function deleteNote(id) {
    if (!window.confirm('Delete this note?')) return;
    setNotes(ns => ns.filter(n => n.id !== id));
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ── Compose sheet ─────────────────────────────────────────────────────────
  if (showCompose) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: C.bg }}>
        <div style={{ ...glassStyle(dark), padding: '14px 20px 12px', paddingTop: 'max(14px, env(safe-area-inset-top))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: 15, fontWeight: 500, cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent' }} onClick={() => setShowCompose(false)}>Cancel</button>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{editingId ? 'Edit Note' : 'New Note'}</span>
          <button style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 15, fontWeight: 700, cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent' }} onClick={saveNote}>Save</button>
        </div>
        <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          <input
            style={{ width: '100%', boxSizing: 'border-box', background: 'none', border: 'none', borderBottom: `1px solid ${C.divider}`, borderRadius: 0, outline: 'none', fontSize: 20, fontWeight: 700, color: C.text, padding: '6px 0', fontFamily: 'inherit' }}
            placeholder="Title (optional)"
            value={draftTitle}
            onChange={e => setDraftTitle(e.target.value)}
          />
          <textarea
            ref={textRef}
            style={{ flex: 1, width: '100%', boxSizing: 'border-box', background: 'none', border: 'none', outline: 'none', resize: 'none', fontSize: 15, color: C.text, lineHeight: 1.65, padding: '4px 0', fontFamily: 'inherit', minHeight: 200 }}
            placeholder="Write a note…"
            value={draftBody}
            onChange={e => setDraftBody(e.target.value)}
          />
        </div>
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: C.bg }}>
      <div style={{ ...glassStyle(dark), padding: '14px 20px 12px', paddingTop: 'max(14px, env(safe-area-inset-top))', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.text, padding: '3px 4px', WebkitTapHighlightColor: 'transparent' }} onClick={onOpenDrawer}>☰</button>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700, color: C.text, textAlign: 'center' }}>Notes</span>
        <button
          onClick={openNew}
          style={{ background: ACCENT, border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, padding: '7px 16px', borderRadius: 10, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
        >
          + New
        </button>
      </div>

      <div style={{ padding: '12px 16px 88px', maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {notes.length === 0 ? (
          <div style={{ paddingTop: 80, textAlign: 'center' }}>
            <p style={{ color: C.textSub, fontSize: 17, fontWeight: 700, margin: 0 }}>No notes yet.</p>
            <p style={{ color: C.textMuted, fontSize: 13, margin: '8px 0 24px', lineHeight: 1.5 }}>
              Jot down anything — delivery instructions, store contacts, reminders.
            </p>
            <button
              onClick={openNew}
              style={{ background: ACCENT, border: 'none', color: '#fff', fontWeight: 700, fontSize: 15, padding: '13px 32px', borderRadius: 14, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
            >
              Write First Note
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notes.map(note => (
              <div
                key={note.id}
                style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.cardBorder || C.divider}`, padding: '14px 16px', cursor: 'pointer', position: 'relative' }}
                onClick={() => openEdit(note)}
              >
                {note.title && (
                  <p style={{ color: C.text, fontSize: 15, fontWeight: 700, margin: '0 0 4px', paddingRight: 32, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.title}</p>
                )}
                <p style={{ color: note.title ? C.textMuted : C.text, fontSize: 14, margin: 0, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{note.body || <span style={{ fontStyle: 'italic', color: C.textLight }}>Empty note</span>}</p>
                <p style={{ color: C.textLight, fontSize: 11, margin: '6px 0 0' }}>
                  {fmtDate(note.updatedAt || note.createdAt)}
                </p>
                <button
                  style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', color: C.textLight, fontSize: 16, cursor: 'pointer', padding: 4, WebkitTapHighlightColor: 'transparent' }}
                  onClick={e => { e.stopPropagation(); deleteNote(note.id); }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
