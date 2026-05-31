// v4 — Supabase auth + cloud DB, offline banner
import { useState, useEffect } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { LIGHT, DARK } from './theme';
import NavDrawer from './components/NavDrawer';
import NewInvoice from './components/NewInvoice';
import InvoiceView from './components/InvoiceView';
import InvoiceHistory from './components/InvoiceHistory';
import Products from './components/Products';
import StoreBalance from './components/StoreBalance';
import AppFooter from './components/AppFooter';
import AuthGate from './components/AuthGate';
import './App.css';

// ── Offline banner ────────────────────────────────────────────────────────────

function OfflineBanner({ dark }) {
  const [offline, setOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const goOnline  = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: dark ? '#1a0a00' : '#fff7ed',
      color: dark ? '#fbbf24' : '#b45309',
      textAlign: 'center',
      padding: '10px 16px',
      fontSize: 13,
      fontWeight: 500,
      zIndex: 8000,
      borderTop: `1px solid ${dark ? '#2a1500' : '#fed7aa'}`,
      paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
    }}>
      You are offline — changes won't save
    </div>
  );
}

// ── Main app inner ────────────────────────────────────────────────────────────

function AppInner() {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  const [page, setPage] = useState('invoice');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);

  function openDrawer() { setDrawerOpen(true); }
  function closeDrawer() { setDrawerOpen(false); }
  function navigate(p) { setPage(p); setDrawerOpen(false); }

  function handleInvoiceGenerated(invoice) {
    setCurrentInvoice(invoice);
    setPage('invoice-view');
  }

  return (
    <div data-theme-transition style={{
      minHeight: '100dvh',
      background: C.bg,
      transition: 'background-color 1s ease',
    }}>
      <NavDrawer open={drawerOpen} onClose={closeDrawer} onNav={navigate} currentPage={page} />
      {page === 'invoice' && (
        <NewInvoice onOpenDrawer={openDrawer} onGenerated={handleInvoiceGenerated} />
      )}
      {page === 'invoice-view' && currentInvoice && (
        <InvoiceView
          invoice={currentInvoice}
          onBack={() => navigate('invoice')}
          onNewInvoice={() => { setCurrentInvoice(null); navigate('invoice'); }}
        />
      )}
      {page === 'history'  && <InvoiceHistory onOpenDrawer={openDrawer} onSelectStore={s => { setSelectedStore(s); setPage('store-balance'); }} />}
      {page === 'products' && <Products       onOpenDrawer={openDrawer} />}
      {page === 'store-balance' && selectedStore && (
        <StoreBalance storeName={selectedStore} onBack={() => setPage('history')} />
      )}
      <AppFooter />
      <OfflineBanner dark={dark} />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthGate>
        <AppInner />
      </AuthGate>
    </ThemeProvider>
  );
}
