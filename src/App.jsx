// v2 — invoice history, products, hamburger nav, phone numbers, time, edit items
import { useState } from 'react';
import NavDrawer from './components/NavDrawer';
import NewInvoice from './components/NewInvoice';
import InvoiceHistory from './components/InvoiceHistory';
import Products from './components/Products';
import './App.css';

export default function App() {
  const [page, setPage] = useState('invoice');
  const [drawerOpen, setDrawerOpen] = useState(false);

  function openDrawer() { setDrawerOpen(true); }
  function closeDrawer() { setDrawerOpen(false); }
  function navigate(p) { setPage(p); setDrawerOpen(false); }

  return (
    <>
      <NavDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        onNav={navigate}
        currentPage={page}
      />
      {page === 'invoice'  && <NewInvoice       onOpenDrawer={openDrawer} />}
      {page === 'history'  && <InvoiceHistory   onOpenDrawer={openDrawer} />}
      {page === 'products' && <Products         onOpenDrawer={openDrawer} />}
    </>
  );
}
