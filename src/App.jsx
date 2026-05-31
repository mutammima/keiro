// v4 — Supabase auth + cloud DB, offline banner, page transitions + arrow nav tabs
import { useState, useEffect, useCallback } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { LIGHT, DARK } from './theme';
import NavDrawer from './components/NavDrawer';
import NewInvoice from './components/NewInvoice';
import InvoiceView from './components/InvoiceView';
import InvoiceHistory from './components/InvoiceHistory';
import Products from './components/Products';
import StoreBalance from './components/StoreBalance';
import AuthGate from './components/AuthGate';
import About from './components/About';
import Profile from './components/Profile';
import Reports from './components/Reports';
import Settings from './components/Settings';
import InteractiveTutorial from './components/InteractiveTutorial';
import SplashScreen from './components/SplashScreen';
import BottomNav from './components/BottomNav';
import StoreMap from './components/StoreMap';
import Notes from './components/Notes';
import Home from './components/Home';
import EndOfDay from './components/EndOfDay';
import SectionGuide, { hasSeenGuide, markGuideSeen } from './components/SectionGuide';
import UpdateBanner from './components/UpdateBanner';
import useAppUpdate from './hooks/useAppUpdate';
import './App.css';

// The three draggable bottom-nav tabs
const TABS = ['invoice', 'history', 'products'];

function tabIndex(p) {
  if (p === 'invoice-view') return 0;
  return TABS.indexOf(p);
}

// For non-tab pages that slide up from bottom
function overlayAnim(from, to) {
  // going TO a non-tab page
  if (TABS.indexOf(to) === -1 && to !== 'invoice-view') return 'page-from-bottom';
  // coming BACK to a tab page from a non-tab page
  return 'page-fade';
}

// ── Offline banner ────────────────────────────────────────────────────────────

function OfflineBanner({ dark }) {
  const [offline, setOffline] = useState(() => !navigator.onLine);
  useEffect(() => {
    const on  = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  if (!offline) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: dark ? '#1a0a00' : '#fff7ed',
      color: dark ? '#fbbf24' : '#b45309',
      textAlign: 'center', padding: '10px 16px', fontSize: 13, fontWeight: 500,
      zIndex: 8000, borderTop: `1px solid ${dark ? '#2a1500' : '#fed7aa'}`,
      paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
    }}>
      You are offline — changes won't save
    </div>
  );
}

// ── Main app ──────────────────────────────────────────────────────────────────

function AppInner() {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [page,           setPage]           = useState('home');
  const [overlayPage,    setOverlayPage]    = useState('home');
  const [overlayClass,   setOverlayClass]   = useState('page-fade');
  const [drawerOpen,     setDrawerOpen]     = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState(null);
  const [selectedStore,  setSelectedStore]  = useState(null);
  const [showTutorial,   setShowTutorial]   = useState(false);
  const [guideSection,   setGuideSection]   = useState(null);
  const { updateAvailable, applyUpdate }    = useAppUpdate();

  // Sections that have a contextual guide
  const GUIDED_SECTIONS = new Set(['invoice','history','products','reports','store-map','notes','home']);

  // Show guide for a section if not yet seen
  function maybeShowGuide(section) {
    if (GUIDED_SECTIONS.has(section) && !hasSeenGuide(section)) {
      // Small delay so the page renders first
      setTimeout(() => setGuideSection(section), 350);
    }
  }

  // Tab strip index
  const [tabIdx, setTabIdx] = useState(0);

  // Keep `page` in sync with tabIdx (used by BottomNav + NavDrawer highlight)
  useEffect(() => {
    if (overlayPage === null) setPage(TABS[tabIdx]);
  }, [tabIdx, overlayPage]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const navigate = useCallback((p) => {
    const ti = tabIndex(p);
    if (ti !== -1) {
      setTabIdx(ti);
      setOverlayPage(null);
      setPage(p);
    } else {
      setOverlayClass('page-from-bottom');
      setOverlayPage(p);
      setPage(p);
    }
    setDrawerOpen(false);
    maybeShowGuide(p);
  }, []); // eslint-disable-line

  // Show guide for the home/dashboard on first ever launch
  useEffect(() => { maybeShowGuide('home'); }, []); // eslint-disable-line

  function handleInvoiceGenerated(invoice) {
    setCurrentInvoice(invoice);
    // invoice-view is a special overlay (treated as tab 0 visually)
    setOverlayClass('page-fade');
    setOverlayPage('invoice-view');
    setPage('invoice-view');
  }

  function goBackFromOverlay() {
    setOverlayPage(null);
    setPage(TABS[tabIdx]);
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const isTabPage = overlayPage === null;

  // Arrow button shared styles
  const arrowBase = {
    position: 'fixed',
    top: '50%',
    width: 32,
    height: 32,
    fontSize: 16,
    border: 'none',
    borderRadius: '50%',
    color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.45)',
    zIndex: 300,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
  };

  return (
    <div
      data-theme-transition
      style={{
        height: '100dvh',
        width: '100%',
        maxWidth: '100vw',
        overflow: 'hidden',
        background: C.bg,
        transition: 'background-color 0.4s ease',
        position: 'relative',
      }}
    >
      {showTutorial && <InteractiveTutorial currentPage={page} onClose={() => setShowTutorial(false)} />}
      {guideSection  && <SectionGuide section={guideSection} onDismiss={() => setGuideSection(null)} />}
      {updateAvailable && (
        <UpdateBanner
          onUpdate={applyUpdate}
          isMidInvoice={page === 'invoice'}
        />
      )}
      <NavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNav={navigate}
        currentPage={page}
        onTutorial={() => setShowTutorial(true)}
      />

      {/* ── Tab strip ─────────────────────────────────────────────── */}
      {isTabPage && (
        <div style={{
          display: 'flex',
          width: `${TABS.length * 100}vw`,
          height: '100dvh',
          transform: `translateX(-${tabIdx * 100}vw)`,
          transition: 'transform 0.38s cubic-bezier(0.32,0.72,0,1)',
          willChange: 'transform',
        }}>
          {[
            <NewInvoice key="invoice" onOpenDrawer={() => setDrawerOpen(true)} onGenerated={handleInvoiceGenerated} onNav={navigate} />,
            <InvoiceHistory key="history" onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} onSelectStore={s => { setSelectedStore(s); navigate('store-balance'); }} />,
            <Products key="products" onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />,
          ].map((child, i) => (
            <div
              key={i}
              style={{
                width: '100vw', height: '100dvh',
                overflowY: 'auto', overflowX: 'hidden',
                flexShrink: 0,
              }}
            >
              {child}
            </div>
          ))}
        </div>
      )}

      {/* ── Floating arrow nav buttons ──────────────────────────────────────── */}
      {tabIdx > 0 && overlayPage === null && (
        <button
          onClick={() => navigate(TABS[tabIdx - 1])}
          style={{
            ...arrowBase,
            left: 8,
            transform: 'translateY(-50%)',
          }}
        >‹</button>
      )}
      {tabIdx < 2 && overlayPage === null && (
        <button
          onClick={() => navigate(TABS[tabIdx + 1])}
          style={{
            ...arrowBase,
            right: 8,
            transform: 'translateY(-50%)',
          }}
        >›</button>
      )}

      {/* ── Overlay pages (slide up from bottom) ───────────────────────────── */}
      {overlayPage && (
        <div key={overlayPage} className={overlayClass} style={{ position: 'absolute', inset: 0, overflowY: 'auto', overflowX: 'hidden', zIndex: 50, background: 'inherit' }}>
          {overlayPage === 'invoice-view' && currentInvoice && (
            <InvoiceView
              invoice={currentInvoice}
              onBack={goBackFromOverlay}
              onNewInvoice={() => { setCurrentInvoice(null); goBackFromOverlay(); }}
            />
          )}
          {overlayPage === 'home'       && <Home       onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'about'      && <About      onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'profile'    && <Profile    onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'reports'    && <Reports    onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'settings'   && <Settings   onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'store-map'  && <StoreMap   onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'notes'      && <Notes      onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'end-of-day' && <EndOfDay   onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'store-balance' && selectedStore && (
            <StoreBalance storeName={selectedStore} onBack={goBackFromOverlay} />
          )}
        </div>
      )}

      <BottomNav currentPage={page} onNav={navigate} />
      <OfflineBanner dark={dark} />
    </div>
  );
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  return (
    <ThemeProvider>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <AuthGate>
        <AppInner />
      </AuthGate>
    </ThemeProvider>
  );
}
