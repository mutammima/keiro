// v4 — Supabase auth + cloud DB, offline banner, page transitions + arrow nav tabs
import { useState, useEffect, useCallback, useRef } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { LIGHT, DARK } from './theme';
import NavDrawer from './components/navigation/NavDrawer';
import NewInvoice from './components/invoice/NewInvoice';
import InvoiceView from './components/invoice/InvoiceView';
import InvoiceHistory from './components/invoice/InvoiceHistory';
import Products from './components/pages/Products';
import StoreBalance from './components/reports/StoreBalance';
import AuthGate from './components/auth/AuthGate';
import About from './components/pages/About';
import Profile from './components/auth/Profile';
import Reports from './components/reports/Reports';
import Settings from './components/settings/Settings';
import InteractiveTutorial from './components/tutorial/InteractiveTutorial';
import SplashScreen from './components/ui/SplashScreen';
import BottomNav from './components/navigation/BottomNav';
import StoreMap from './components/pages/StoreMap';
import Notes from './components/pages/Notes';
import Home from './components/pages/Home';
import EndOfDay from './components/reports/EndOfDay';
import WhatsNew, { hasSeenWhatsNew } from './components/ui/WhatsNew';
import PinLock, { isPinEnabled } from './components/settings/PinLock';
import SectionGuide, { hasSeenGuide, markGuideSeen } from './components/ui/SectionGuide';
import UpdateBanner from './components/ui/UpdateBanner';
import useAppUpdate from './hooks/useAppUpdate';
import useVersionCheck, { applyVersionUpdate } from './hooks/useVersionCheck';
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

function isEasyMode() {
  try { return JSON.parse(localStorage.getItem('inv_easy_mode')); } catch { return false; }
}

function AppInner() {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  const easyMode = isEasyMode();

  // In easy mode skip the dashboard and land straight on New Invoice tab
  const [pinUnlocked,    setPinUnlocked]    = useState(() => !isPinEnabled());
  const [page,           setPage]           = useState(easyMode ? 'invoice' : 'home');
  const [overlayPage,    setOverlayPage]    = useState(easyMode ? null : 'home');
  const [overlayClass,   setOverlayClass]   = useState('page-fade');
  const [drawerOpen,     setDrawerOpen]     = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState(null);
  const [selectedStore,  setSelectedStore]  = useState(null);
  const [showTutorial,   setShowTutorial]   = useState(false);
  const [guideSection,   setGuideSection]   = useState(null);
  const [showWhatsNew,   setShowWhatsNew]   = useState(() => !hasSeenWhatsNew());
  const { updateAvailable, applyUpdate }    = useAppUpdate();
  const [versionUpdateAvailable, setVersionUpdateAvailable] = useState(false);
  useVersionCheck(); // fires 'inv-version-update' event when server has a newer build

  // Listen for version-check update signal and surface it to the user
  useEffect(() => {
    const handler = () => setVersionUpdateAvailable(true);
    window.addEventListener('inv-version-update', handler);
    return () => window.removeEventListener('inv-version-update', handler);
  }, []);

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

  // Apply density class on mount + sync body background so any sub-pixel
  // gap between #root and the physical screen edges matches the app theme.
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem('inv_density')) || 'comfortable';
      document.body.classList.toggle('density-compact', d === 'compact');
    } catch {}
  }, []);

  // Keep document.body and html background in sync with the app theme.
  // This ensures the area outside #root (safe-area zones, any sub-pixel gap)
  // always matches the app color instead of showing raw OS black.
  useEffect(() => {
    document.body.style.background = C.bg;
    document.documentElement.style.background = C.bg;
  }, [C.bg]);

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

  // ── Swipe gesture state ───────────────────────────────────────────────────────
  const swipeStart  = useRef(null);  // { x, y } on touchstart
  const swipeDelta  = useRef(0);     // live px offset during drag
  const swipeLocked = useRef(null);  // 'h' | 'v' | null — axis lock
  const [dragOffset, setDragOffset] = useState(0);   // live px for transform
  const [swiping,    setSwiping]    = useState(false); // disables CSS transition during drag

  const SWIPE_THRESHOLD = 50; // px to commit a tab change

  function onSwipeStart(e) {
    if (overlayPage !== null) return;
    const t = e.touches[0];
    swipeStart.current  = { x: t.clientX, y: t.clientY };
    swipeDelta.current  = 0;
    swipeLocked.current = null;
  }

  function onSwipeMove(e) {
    if (!swipeStart.current || overlayPage !== null) return;
    const dx = e.touches[0].clientX - swipeStart.current.x;
    const dy = e.touches[0].clientY - swipeStart.current.y;

    // Lock axis on first significant movement
    if (swipeLocked.current === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      swipeLocked.current = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v';
    }
    if (swipeLocked.current !== 'h') return;

    // Clamp: can't swipe left on first tab or right on last tab
    const clamped = Math.max(
      tabIdx >= TABS.length - 1 ? -60 : -window.innerWidth,
      Math.min(tabIdx <= 0 ? 60 : window.innerWidth, dx)
    );
    swipeDelta.current = clamped;
    setSwiping(true);
    setDragOffset(clamped);
    e.preventDefault(); // stop page scroll while swiping horizontally
  }

  function onSwipeEnd() {
    if (!swipeStart.current) return;
    swipeStart.current = null;
    const d = swipeDelta.current;
    swipeDelta.current = 0;
    setSwiping(false);
    setDragOffset(0);

    if (d < -SWIPE_THRESHOLD && tabIdx < TABS.length - 1) {
      navigate(TABS[tabIdx + 1]);
    } else if (d > SWIPE_THRESHOLD && tabIdx > 0) {
      navigate(TABS[tabIdx - 1]);
    }
    // Otherwise snap back (setDragOffset(0) already done above)
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const isTabPage = overlayPage === null;

  return (
    <div
      data-theme-transition
      className="app-shell"
      style={{
        // height: 100% fills #root which is position:fixed covering the full
        // physical screen. Never use 100dvh here — dvh can be shorter than the
        // fixed root on iOS, leaving a gap at the bottom.
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        background: C.bg,
        transition: 'background-color 0.4s ease',
        position: 'relative',
      }}
    >
      {showWhatsNew  && <WhatsNew onClose={() => setShowWhatsNew(false)} />}
      {showTutorial && <InteractiveTutorial currentPage={page} onClose={() => setShowTutorial(false)} />}
      {guideSection  && <SectionGuide section={guideSection} onDismiss={() => setGuideSection(null)} />}
      {(updateAvailable || versionUpdateAvailable) && (
        <UpdateBanner
          onUpdate={versionUpdateAvailable ? applyVersionUpdate : applyUpdate}
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

      {/* ── Tab strip — swipeable ─────────────────────────────────── */}
      {isTabPage && (
        <div
          onTouchStart={onSwipeStart}
          onTouchMove={onSwipeMove}
          onTouchEnd={onSwipeEnd}
          onTouchCancel={onSwipeEnd}
          style={{
            display: 'flex',
            width: `${TABS.length * 100}vw`,
            height: '100%',
            paddingTop: 'calc(40px + env(safe-area-inset-top))',
            // During drag: no transition so it tracks the finger exactly.
            // On release: spring to the snapped position.
            transform: `translateX(calc(-${tabIdx * 100}vw + ${dragOffset}px))`,
            transition: swiping ? 'none' : 'transform 0.38s cubic-bezier(0.32,0.72,0,1)',
            willChange: 'transform',
            boxSizing: 'border-box',
          }}
        >
          {[
            <NewInvoice key="invoice" onOpenDrawer={() => setDrawerOpen(true)} onGenerated={handleInvoiceGenerated} onNav={navigate} />,
            <InvoiceHistory key="history" onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} onSelectStore={s => { setSelectedStore(s); navigate('store-balance'); }} />,
            <Products key="products" onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />,
          ].map((child, i) => (
            <div
              key={i}
              style={{
                width: '100vw', height: '100%',
                overflowY: 'auto', overflowX: 'hidden',
                flexShrink: 0,
              }}
            >
              {child}
            </div>
          ))}
        </div>
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

      {/* Hide top nav on overlay pages — they have their own headers */}
      {overlayPage === null && (
        <BottomNav currentPage={page} onNav={navigate} onOpenDrawer={() => setDrawerOpen(true)} />
      )}
      <OfflineBanner dark={dark} />
    </div>
  );
}

function AppInnerWithPin() {
  const [unlocked, setUnlocked] = useState(() => !isPinEnabled());
  if (!unlocked) {
    return <PinLock onSuccess={() => setUnlocked(true)} />;
  }
  return <AppInner />;
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  return (
    <ThemeProvider>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <AuthGate>
        <AppInnerWithPin />
      </AuthGate>
    </ThemeProvider>
  );
}
