import { useState, useRef, useEffect } from 'react';

/**
 * A text input with a tap-friendly dropdown suggestion list.
 *
 * Props:
 *  value, onChange, suggestions (string[]), placeholder, label,
 *  inputMode, type, required, onBlurCommit (called with final value)
 */
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
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Filter suggestions to those matching current input (case-insensitive)
  const filtered =
    value.trim().length > 0
      ? suggestions.filter((s) =>
          s.toLowerCase().includes(value.toLowerCase())
        ).slice(0, 8)
      : [];

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
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
        <label style={styles.label}>
          {label}
          {required && <span style={{ color: '#e53e3e' }}> *</span>}
        </label>
      )}
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        required={required}
        style={styles.input}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Slight delay so tap-to-select fires first
          setTimeout(() => setOpen(false), 150);
          onBlurCommit?.(value);
        }}
      />
      {open && filtered.length > 0 && (
        <ul style={styles.dropdown}>
          {filtered.map((s) => (
            <li
              key={s}
              style={styles.dropdownItem}
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

const styles = {
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: '#444',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    height: 52,
    fontSize: 16,
    padding: '0 14px',
    border: '1.5px solid #ddd',
    borderRadius: 10,
    background: '#fafafa',
    color: '#111',
    outline: 'none',
    WebkitAppearance: 'none',
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 2px)',
    left: 0,
    right: 0,
    background: '#fff',
    border: '1.5px solid #ddd',
    borderRadius: 10,
    boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
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
    borderBottom: '1px solid #f0f0f0',
    color: '#222',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
  },
};
