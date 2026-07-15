/**
 * ErrorBoundary — catches render-time crashes anywhere below it and shows a
 * recoverable fallback screen instead of a blank white page.
 *
 * Deliberately NOT theme-aware (no useTheme()): if something above this
 * boundary is broken (e.g. ThemeProvider itself), the fallback still has to
 * render. It hardcodes the app's default dark palette instead.
 *
 * Must be a class component — React only supports error boundaries via
 * getDerivedStateFromError / componentDidCatch, no hook equivalent exists.
 */

import { Component } from 'react';
import { logError } from '../../utils/errorLog';

const ACCENT = '#4A7BF7';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || String(error) };
  }

  componentDidCatch(error, info) {
    logError(error, { source: 'ErrorBoundary', componentStack: info?.componentStack });
  }

  handleReload = () => {
    // Full reload, not setState — a render-time crash likely left broader
    // app state (context providers, etc.) inconsistent.
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.icon}>!</div>
          <h1 style={s.title}>Something went wrong</h1>
          <p style={s.body}>
            The app hit an unexpected error and couldn't continue. Your saved
            data is untouched — this only affects the current screen.
          </p>
          <button style={s.button} onClick={this.handleReload}>
            Reload App
          </button>
          <p style={s.detail}>{this.state.message}</p>
        </div>
      </div>
    );
  }
}

const s = {
  page: {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#000000',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    background: '#141414',
    borderRadius: 18,
    padding: '28px 22px',
    textAlign: 'center',
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: 'rgba(239,68,68,0.15)',
    color: '#ef4444',
    fontSize: 24,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  },
  title: {
    fontSize: 18,
    fontWeight: 800,
    color: '#ffffff',
    margin: '0 0 8px',
  },
  body: {
    fontSize: 14,
    color: '#d1d1d1',
    lineHeight: 1.5,
    margin: '0 0 20px',
  },
  button: {
    width: '100%',
    height: 46,
    borderRadius: 12,
    border: 'none',
    background: ACCENT,
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  detail: {
    fontSize: 11,
    color: '#666666',
    marginTop: 16,
    wordBreak: 'break-word',
  },
};
