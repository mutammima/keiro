// v4 — Supabase auth + cloud DB, offline banner, page transitions + arrow nav tabs
import { useState, useEffect, useCallback, useRef } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { LIGHT, DARK } from './theme';
import NavDrawer from './components/navigation/NavDrawer';
import NewInvoice from './components/invoice/NewInvoice';
import InvoiceView from './components/invoice/InvoiceView';
import InvoiceHistory from './components/invoice/InvoiceHistory';
import Products from './pages/Products';
import StoreBalance from './pages/StoreBalance';
import AuthGate from './components/auth/AuthGate';
import About from './pages/About';
import Legal from './pages/Legal';
import Profile from './pages/Profile';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
// InteractiveTutorial replaced by OnboardingTutorial for "How it Works"
import OnboardingTutorial from './components/tutorial/OnboardingTutorial';
import SOOnboardingTutorial from './components/tutorial/SOOnboardingTutorial';
import useOnboarding from './hooks/useOnboarding';
import SplashScreen from './components/ui/SplashScreen';
import SyncToast from './components/ui/SyncToast';
import BottomNav from './components/navigation/BottomNav';
import StoreMap from './pages/StoreMap';
import Notes from './pages/Notes';
import Home from './pages/Home';
import EndOfDay from './pages/EndOfDay';
import WhatsNew, { hasSeenWhatsNew } from './components/ui/WhatsNew';
import PinLock, { isPinEnabled } from './components/settings/PinLock';
// SectionGuide removed — the OnboardingTutorial covers the same ground
import UpdateBanner from './components/ui/UpdateBanner';
import useAppUpdate from './hooks/useAppUpdate';
import useVersionCheck, { applyVersionUpdate } from './hooks/useVersionCheck';
// Store Owner role
import RoleSelector from './components/onboarding/RoleSelector';
import NewRequest from './pages/storeowner/NewRequest';
import SOOrders from './pages/storeowner/SOOrders';
import SODrivers from './pages/storeowner/SODrivers';
import SOHome from './pages/storeowner/SOHome';
import SOReports from './pages/storeowner/SOReports';
import { resolveStartupRole, setRole } from './utils/storeOwnerStorage';
import './App.css';

// Tab IDs for each role
const DRIVER_TABS = ['invoice', 'history', 'products'];
const OWNER_TABS  = ['so-request', 'so-orders', 'so-drivers'];

function tabIndex(tabs, p) {
  if (p === 'invoice-view') return 0;
  return tabs.indexOf(p);
}

// For non-tab pages that slide up from bottom
function overlayAnim(tabs, to) {
  if (tabs.indexOf(to) === -1 && to !== 'invoice-view') return 'page-from-bottom';
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

function AppInner({ role, onSwitchRole }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  const easyMode = isEasyMode();

  const TABS = role === 'store_owner' ? OWNER_TABS : DRIVER_TABS;

  // In easy mode skip the dashboard and land straight on New Invoice tab
  const [page,           setPage]           = useState(() => {
    if (role === 'store_owner') return 'so-request';
    return easyMode ? 'invoice' : 'home';
  });
  const [overlayPage,    setOverlayPage]    = useState(() => {
    if (role === 'store_owner') return 'so-home';
    return easyMode ? null : 'home';
  });
  const [overlayClass,   setOverlayClass]   = useState('page-fade');
  const [drawerOpen,     setDrawerOpen]     = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState(null);
  const [selectedStore,  setSelectedStore]  = useState(null);
  const [showTutorial,   setShowTutorial]   = useState(false);
  // WhatsNew starts hidden — only shown after onboarding is complete so the
  // two overlays never fight each other and block all interaction.
  const [showWhatsNew,   setShowWhatsNew]   = useState(false);
  const { updateAvailable, applyUpdate }    = useAppUpdate();
  const { shouldShow: shouldShowOnboarding, markComplete: markOnboardingComplete, skipOnboarding } = useOnboarding();
  const [versionUpdateAvailable, setVersionUpdateAvailable] = useState(false);
  useVersionCheck(); // fires 'inv-version-update' event when server has a newer build

  // Show WhatsNew only once onboarding is done (or already done on a returning user).
  useEffect(() => {
    if (!shouldShowOnboarding && !hasSeenWhatsNew()) {
      setShowWhatsNew(true);
    }
  }, [shouldShowOnboarding]);

  // Listen for version-check update signal and surface it to the user
  useEffect(() => {
    const handler = () => setVersionUpdateAvailable(true);
    window.addEventListener('inv-version-update', handler);
    return () => window.removeEventListener('inv-version-update', handler);
  }, []);

  // Tab strip index
  const [tabIdx, setTabIdx] = useState(0);

  // tabsRef — lets swipe handlers always read the current TABS without re-registering
  const tabsRef = useRef(TABS);
  useEffect(() => { tabsRef.current = TABS; }, [role]); // eslint-disable-line

  // Keep `page` in sync with tabIdx (used by BottomNav + NavDrawer highlight)
  useEffect(() => {
    if (overlayPage === null) setPage(tabsRef.current[tabIdx]);
  }, [tabIdx, overlayPage]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const navigate = useCallback((p) => {
    const ti = tabIndex(tabsRef.current, p);
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
  }, []); // eslint-disable-line

  // Apply density class on mount + sync body background so any sub-pixel
  // gap between #root and the physical screen edges matches the app theme.
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem('inv_density')) || 'comfortable';
      document.body.classList.toggle('density-compact', d === 'compact');
    } catch {}
  }, []);

  // Keep document.body, html, and theme-color meta in sync with the app theme.
  // This ensures safe-area zones and any sub-pixel gaps outside #root match the
  // app color instead of showing a black bar.
  useEffect(() => {
    document.body.style.background = C.bg;
    document.documentElement.style.background = C.bg;
    // Update theme-color meta so the iOS status bar area matches the app bg
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', C.bg);
  }, [C.bg]);

  function handleInvoiceGenerated(invoice) {
    setCurrentInvoice(invoice);
    // invoice-view is a special overlay (treated as tab 0 visually)
    setOverlayClass('page-fade');
    setOverlayPage('invoice-view');
    setPage('invoice-view');
  }

  function goBackFromOverlay() {
    setOverlayPage(null);
    setPage(tabsRef.current[tabIdx]);
  }

  // ── Swipe gesture — non-passive so preventDefault() actually works ───────────
  //
  // React's synthetic onTouchMove is passive (e.preventDefault() silently
  // ignored), which lets the browser do its own horizontal pan on top of our
  // JS transform. That caused the whole page to slide instead of just the strip.
  //
  // Fix: attach the touchmove listener directly via addEventListener with
  // { passive: false } on a stable wrapper ref. tabIdx / overlayPage are
  // mirrored into refs so the handlers always see the latest values without
  // needing to be re-registered on every render.

  const swipeWrapperRef = useRef(null);
  const swipeStart      = useRef(null);
  const swipeDelta      = useRef(0);
  const swipeLocked     = useRef(null);
  const tabIdxRef       = useRef(tabIdx);
  const overlayPageRef  = useRef(overlayPage);
  const navigateRef     = useRef(navigate);
  const [dragOffset, setDragOffset] = useState(0);
  const [swiping,    setSwiping]    = useState(false);

  // Keep refs in sync with latest state/callbacks
  useEffect(() => { tabIdxRef.current    = tabIdx;    }, [tabIdx]);
  useEffect(() => { overlayPageRef.current = overlayPage; }, [overlayPage]);
  useEffect(() => { navigateRef.current  = navigate;  }, [navigate]);

  const SWIPE_THRESHOLD = 52; // px needed to commit a tab change

  useEffect(() => {
    const el = swipeWrapperRef.current;
    if (!el) return;

    function handleStart(e) {
      if (overlayPageRef.current !== null) return;
      const t = e.touches[0];
      swipeStart.current  = { x: t.clientX, y: t.clientY };
      swipeDelta.current  = 0;
      swipeLocked.current = null;
    }

    function handleMove(e) {
      if (!swipeStart.current || overlayPageRef.current !== null) return;
      const dx = e.touches[0].clientX - swipeStart.current.x;
      const dy = e.touches[0].clientY - swipeStart.current.y;

      // Axis lock: wait for 8px movement, require 1.5× more horizontal than vertical
      if (swipeLocked.current === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // not enough movement yet
        swipeLocked.current = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'h' : 'v';
      }
      if (swipeLocked.current !== 'h') return;

      // Confirmed horizontal swipe — stop browser from also panning the page
      e.preventDefault();

      const idx = tabIdxRef.current;
      const W   = el.offsetWidth; // actual container px width (not vw)
      const clamped = Math.max(
        idx >= tabsRef.current.length - 1 ? -60 : -W,
        Math.min(idx <= 0                  ?  60 :  W, dx)
      );
      swipeDelta.current = clamped;
      setSwiping(true);
      setDragOffset(clamped);
    }

    function handleEnd() {
      if (!swipeStart.current) return;
      swipeStart.current = null;
      const d   = swipeDelta.current;
      const idx = tabIdxRef.current;
      swipeDelta.current = 0;
      setSwiping(false);
      setDragOffset(0);

      if (d < -SWIPE_THRESHOLD && idx < tabsRef.current.length - 1) {
        navigateRef.current(tabsRef.current[idx + 1]);
      } else if (d > SWIPE_THRESHOLD && idx > 0) {
        navigateRef.current(tabsRef.current[idx - 1]);
      }
    }

    // passive:false on touchmove so e.preventDefault() is respected
    el.addEventListener('touchstart',  handleStart, { passive: true  });
    el.addEventListener('touchmove',   handleMove,  { passive: false });
    el.addEventListener('touchend',    handleEnd,   { passive: true  });
    el.addEventListener('touchcancel', handleEnd,   { passive: true  });

    return () => {
      el.removeEventListener('touchstart',  handleStart);
      el.removeEventListener('touchmove',   handleMove);
      el.removeEventListener('touchend',    handleEnd);
      el.removeEventListener('touchcancel', handleEnd);
    };
  }, []); // only run once — handlers read live values via refs

  // ── Render ───────────────────────────────────────────────────────────────────
  const isTabPage = overlayPage === null;

  return (
    <div
      data-theme-transition
      className="app-shell"
      style={{
        // height: 100% fills #root which uses 100dvh. No fixed positioning needed.
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        background: C.bg,
        transition: 'background-color 0.4s ease',
        position: 'relative',
      }}
    >
      {showWhatsNew  && <WhatsNew onClose={() => setShowWhatsNew(false)} />}
      {showTutorial && role === 'store_owner' && (
        <SOOnboardingTutorial
          navigate={navigate}
          skipWelcome
          onComplete={() => setShowTutorial(false)}
          onSkip={() => setShowTutorial(false)}
        />
      )}
      {showTutorial && role !== 'store_owner' && (
        <OnboardingTutorial
          navigate={navigate}
          skipWelcome
          onComplete={() => setShowTutorial(false)}
          onSkip={() => setShowTutorial(false)}
        />
      )}
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
        role={role}
        onSwitchRole={onSwitchRole}
      />

      {/* ── Tab strip — swipeable ─────────────────────────────────────────── */}
      {/* swipeWrapperRef is the viewport-width clip container that holds the   */}
      {/* 300%-wide strip. Non-passive touch listeners are attached to it via   */}
      {/* useEffect above so e.preventDefault() actually blocks native scroll.  */}
      {isTabPage && (
        <div
          ref={swipeWrapperRef}
          style={{
            position: 'absolute', inset: 0,
            overflow: 'hidden',
            // pan-y tells the browser this area only supports vertical panning
            // natively; horizontal is handled entirely by our JS swipe code.
            touchAction: 'pan-y',
          }}
        >
          {/* 3× wide strip — slides via transform, never via browser scroll */}
          <div
            style={{
              display: 'flex',
              width: `${TABS.length * 100}%`,
              height: '100%',
              paddingTop: '40px',
              transform: `translateX(calc(-${tabIdx * (100 / TABS.length)}% + ${dragOffset}px))`,
              transition: swiping ? 'none' : 'transform 0.38s cubic-bezier(0.32,0.72,0,1)',
              willChange: 'transform',
              boxSizing: 'border-box',
            }}
          >
            {(role === 'store_owner' ? [
              <NewRequest  key="so-request" onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />,
              <SOOrders    key="so-orders"  onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />,
              <SODrivers   key="so-drivers" onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />,
            ] : [
              <NewInvoice    key="invoice" onOpenDrawer={() => setDrawerOpen(true)} onGenerated={handleInvoiceGenerated} onNav={navigate} />,
              <InvoiceHistory key="history" onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} onSelectStore={s => { setSelectedStore(s); navigate('store-balance'); }} />,
              <Products      key="products" onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />,
            ]).map((child, i) => (
              <div
                key={i}
                data-scroll-container="tab"
                style={{
                  width: `${100 / TABS.length}%`,
                  height: '100%',
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  flexShrink: 0,
                  // Allow vertical scroll within each tab without triggering swipe
                  touchAction: 'pan-y',
                  boxSizing: 'border-box',
                }}
              >
                {child}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Overlay pages (slide up from bottom) ───────────────────────────── */}
      {overlayPage && (
        <div key={overlayPage} data-scroll-container="overlay" className={overlayClass} style={{ position: 'absolute', inset: 0, overflowY: 'auto', overflowX: 'hidden', zIndex: 50, background: 'inherit' }}>
          {overlayPage === 'invoice-view' && currentInvoice && (
            <InvoiceView
              invoice={currentInvoice}
              onBack={goBackFromOverlay}
              onNewInvoice={() => { setCurrentInvoice(null); goBackFromOverlay(); }}
            />
          )}
          {overlayPage === 'home'    && <Home    onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'so-home'    && <SOHome    onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'so-reports' && <SOReports onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'about'      && <About      onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'privacy'    && <Legal section="privacy" onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'terms'      && <Legal section="terms"   onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'profile'    && <Profile    onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'reports'    && <Reports    onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'settings'   && <Settings   onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} onClose={goBackFromOverlay} onSwitchRole={onSwitchRole} />}
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
        <BottomNav currentPage={page} onNav={navigate} onOpenDrawer={() => setDrawerOpen(true)} role={role} />
      )}
      <OfflineBanner dark={dark} />
      {shouldShowOnboarding && role !== 'store_owner' && (
        <OnboardingTutorial
          navigate={navigate}
          onComplete={() => { markOnboardingComplete(); navigate('history'); }}
          onSkip={() => { skipOnboarding(); navigate('history'); }}
        />
      )}
      {shouldShowOnboarding && role === 'store_owner' && (
        <SOOnboardingTutorial
          navigate={navigate}
          onComplete={() => { markOnboardingComplete(); navigate('so-request'); }}
          onSkip={() => { skipOnboarding(); navigate('so-request'); }}
        />
      )}
    </div>
  );
}

// RoleGate — resolves the role before rendering AppInner.
// Keeping it separate means AppInner always receives a non-null role,
// so no conditional-hook issues inside AppInner.
function RoleGate() {
  const [role, setRoleState] = useState(() => resolveStartupRole());

  function switchRole(r) {
    setRole(r);       // persist to localStorage
    setRoleState(r);  // instant re-render — no reload needed
  }

  if (role === null) {
    return <RoleSelector onSelect={switchRole} />;
  }

  // key={role} remounts AppInnerWithPin cleanly when role changes,
  // resetting all tab/overlay/page state to initial values for the new role.
  return <AppInnerWithPin key={role} role={role} onSwitchRole={switchRole} />;
}

function AppInnerWithPin({ role, onSwitchRole }) {
  const [unlocked, setUnlocked] = useState(() => !isPinEnabled());
  if (!unlocked) {
    return <PinLock onSuccess={() => setUnlocked(true)} />;
  }
  return <AppInner role={role} onSwitchRole={onSwitchRole} />;
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  return (
    <ThemeProvider>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <SyncToast />
      <AuthGate>
        <RoleGate />
      </AuthGate>
    </ThemeProvider>
  );
}
