// v3 — dark mode, settings, invoice view page
import { useState } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { LIGHT, DARK } from './theme';
import NavDrawer from './components/NavDrawer';
import NewInvoice from './components/NewInvoice';
import InvoiceView from './components/InvoiceView';
import InvoiceHistory from './components/InvoiceHistory';
import Products from './components/Products';
import './App.css';

function AppInner() {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  const [page, setPage] = useState('invoice');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState(null);

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
      {page === 'history'  && <InvoiceHistory onOpenDrawer={openDrawer} />}
      {page === 'products' && <Products       onOpenDrawer={openDrawer} />}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
