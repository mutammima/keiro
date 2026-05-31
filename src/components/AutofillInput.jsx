import { useState, useRef, useEffect } from 'react';
import { LIGHT, DARK } from '../theme';

export default function AutofillInput({
  value,
  onChange,
  suggestions = [],
  placeholder = '',
  label,
  inputMode = 'text',
  type = 'text',
  required = false,
  onBlurCommit,
  className = '',
  dark = false,
}) {
  const C = dark ? DARK : LIGHT;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const filtered =
    value.trim().length > 0
      ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
      : [];

  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, []);

  function select(suggestion) {
    onChange(suggestion);
    setOpen(false);
    onBlurCommit?.(suggestion);
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }} className={className}>
      {label && (
        <label style={{ ...s.label, color: C.textSub }}>
          {label}
          {required && <span style={{ color: C.danger }}> *</span>}
        </label>
      )}
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        required={required}
        style={{ ...s.input, background: C.inputBg, borderColor: C.inputBorder, color: C.text }}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => setOpen(false), 150);
          onBlurCommit?.(value);
        }}
      />
      {open && filtered.length > 0 && (
        <ul style={{ ...s.dropdown, background: C.card, borderColor: C.inputBorder }}>
          {filtered.map(s2 => (
            <li
              key={s2}
              style={{ ...s.dropdownItem, color: C.text, borderBottomColor: C.divider }}
              onMouseDown={() => select(s2)}
              onTouchStart={() => select(s2)}
            >
              {s2}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const s = {
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    height: 52,
    fontSize: 16,
    padding: '0 14px',
    border: '1.5px solid',
    borderRadius: 10,
    outline: 'none',
    WebkitAppearance: 'none',
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 2px)',
    left: 0,
    right: 0,
    border: '1.5px solid',
    borderRadius: 10,
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    zIndex: 1000,
    margin: 0,
    padding: 0,
    listStyle: 'none',
    maxHeight: 240,
    overflowY: 'auto',
  },
  dropdownItem: {
    padding: '14px 16px',
    fontSize: 16,
    cursor: 'pointer',
    borderBottom: '1px solid',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
  },
};
