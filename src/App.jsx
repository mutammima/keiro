// v3 — dark mode, settings, invoice view page
import { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import NavDrawer from './components/NavDrawer';
import NewInvoice from './components/NewInvoice';
import InvoiceView from './components/InvoiceView';
import InvoiceHistory from './components/InvoiceHistory';
import Products from './components/Products';
import './App.css';

export default function App() {
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
    <ThemeProvider>
      <NavDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        onNav={navigate}
        currentPage={page}
      />
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
    </ThemeProvider>
  );
}
