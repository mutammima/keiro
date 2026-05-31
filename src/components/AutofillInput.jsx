import { useState, useRef, useEffect } from 'react';
import { LIGHT, DARK } from '../theme';

export default function AutofillInput({
  value, onChange, suggestions = [], placeholder = '',
  label, inputMode = 'text', type = 'text',
  required = false, onBlurCommit, className = '', dark = false,
}) {
  const C = dark ? DARK : LIGHT;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const filtered = value.trim().length > 0
    ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
    : [];

  useEffect(() => {
    function close(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); };
  }, []);

  function select(s) { onChange(s); setOpen(false); onBlurCommit?.(s); }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }} className={className}>
      {label && (
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: C.textSub, marginBottom: 5 }}>
          {label}
        </label>
      )}
      <input
        type={type} inputMode={inputMode} value={value} placeholder={placeholder} required={required}
        style={{
          width: '100%', boxSizing: 'border-box', height: 44,
          fontSize: 15, padding: '0 12px',
          border: `1px solid ${C.inputBorder}`, borderRadius: 8,
          background: C.inputBg, color: C.text, outline: 'none', WebkitAppearance: 'none',
        }}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setTimeout(() => setOpen(false), 150); onBlurCommit?.(value); }}
      />
      {open && filtered.length > 0 && (
        <ul style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: C.card, border: `1px solid ${C.cardBorder}`,
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 1000, margin: 0, padding: '4px 0', listStyle: 'none',
          maxHeight: 220, overflowY: 'auto',
        }}>
          {filtered.map(s => (
            <li
              key={s}
              style={{
                padding: '12px 14px', fontSize: 15, cursor: 'pointer',
                color: C.text, borderBottom: `1px solid ${C.divider}`,
                userSelect: 'none', WebkitTapHighlightColor: 'transparent',
              }}
              onMouseDown={() => select(s)}
              onTouchStart={() => select(s)}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
