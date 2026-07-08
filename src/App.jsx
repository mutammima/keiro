// v4 — Supabase auth + cloud DB, offline banner, page transitions + arrow nav tabs
import { useState, useEffect, useLayoutEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { LIGHT, DARK } from './theme';
import NavDrawer from './components/navigation/NavDrawer';
import InvoiceHistory from './components/invoice/InvoiceHistory';
import AuthGate from './components/auth/AuthGate';
// Overlay-only pages are route-lazy: they're never on screen at first paint
// (they slide up on navigate), so splitting them out of the entry chunk shrinks
// first paint. The always-mounted tab pages stay statically imported below.
const NewInvoice   = lazy(() => import('./components/invoice/NewInvoice'));
const InvoiceView  = lazy(() => import('./components/invoice/InvoiceView'));
const Products     = lazy(() => import('./pages/Products'));
const StoreBalance = lazy(() => import('./pages/StoreBalance'));
const About        = lazy(() => import('./pages/About'));
const Legal        = lazy(() => import('./pages/Legal'));
const Profile      = lazy(() => import('./pages/Profile'));
const Reports      = lazy(() => import('./pages/Reports'));
const Settings     = lazy(() => import('./pages/Settings'));
// Tutorial system (Layer 1 quick start + Layer 2 contextual tips + Layer 4
// guided walkthroughs) — lazy so none weigh on first paint.
const QuickStart        = lazy(() => import('./components/tutorial/QuickStart'));
const TipManager        = lazy(() => import('./components/tutorial/TipManager'));
const WalkthroughRunner = lazy(() => import('./components/tutorial/WalkthroughRunner'));
import useOnboarding from './hooks/useOnboarding';
import { installMilestoneBridge, isHomePulse, setHomePulse, triggerTip } from './utils/tutorialProgress';
import SplashScreen from './components/ui/SplashScreen';
import SyncToast from './components/ui/SyncToast';
import SyncQueueRunner from './components/ui/SyncQueueRunner';
import TopNav, { TOP_NAV_HEIGHT } from './components/navigation/TopNav';
import Home from './pages/Home';
const StoreMap = lazy(() => import('./pages/StoreMap'));
const Notes    = lazy(() => import('./pages/Notes'));
const EndOfDay = lazy(() => import('./pages/EndOfDay'));
import WhatsNew, { hasSeenWhatsNew, markWhatsNewSeen } from './components/ui/WhatsNew';
import PinLock, { isPinEnabled } from './components/settings/PinLock';
import UpdateBanner from './components/ui/UpdateBanner';
import useAppUpdate from './hooks/useAppUpdate';
import useVersionCheck, { applyVersionUpdate } from './hooks/useVersionCheck';
import { STORAGE_KEYS, EVENTS } from './utils/constants';
// Store Owner role
import RoleSelector from './components/onboarding/RoleSelector';
import SOOrders from './pages/storeowner/SOOrders';
import SODrivers from './pages/storeowner/SODrivers';
import SOHome from './pages/storeowner/SOHome';
import SOInvoices from './pages/storeowner/SOInvoices';
import DriverReports from './pages/driver/DriverReports';
import DriverStores from './pages/driver/DriverStores';
// Overlay-only Store-Owner + marketplace pages — route-lazy (see note above).
const NewRequest  = lazy(() => import('./pages/storeowner/NewRequest'));
const SOReports   = lazy(() => import('./pages/storeowner/SOReports'));
const Marketplace = lazy(() => import('./pages/marketplace/Marketplace'));
const MyListings  = lazy(() => import('./pages/marketplace/MyListings'));
const FindDrivers = lazy(() => import('./pages/marketplace/FindDrivers'));
import { resolveStartupRole, setRole } from './utils/storeOwnerStorage';
import { redeemPendingInvite } from './utils/connectionStorage';
import { loadConnectionOrdersFromCloud, loadSharedInvoicesFromCloud } from './utils/connectionOrderStorage';
import { ensureBadgesInitialized, markSeen, computeBadges, BADGE_KEYS } from './utils/eventBadges';
import { isGuest } from './utils/guestMode';
import './App.css';

// Tab IDs for each role (connection-first navigation)
const DRIVER_TABS = ['home', 'route', 'stores', 'reports'];
const OWNER_TABS  = ['so-home', 'so-orders', 'so-drivers', 'so-invoices'];

function tabIndex(tabs, p) {
  // invoice-view is a post-generate overlay; the strip is hidden while it shows,
  // but treat it as the Route tab so the underlying index stays sensible.
  if (p === 'invoice-view') { const i = tabs.indexOf('route'); return i === -1 ? 0 : i; }
  return tabs.indexOf(p);
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
      You're offline — changes save on this device and will sync automatically when you're back online.
    </div>
  );
}

// ── Main app ──────────────────────────────────────────────────────────────────

function isEasyMode() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.EASY_MODE)); } catch { return false; }
}

function AppInner({ role, onSwitchRole }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  const easyMode = isEasyMode();

  const TABS = role === 'store_owner' ? OWNER_TABS : DRIVER_TABS;

  // Dashboards are now tab 0 for both roles — no dashboard overlay on launch.
  // In easy mode the driver lands on the Route tab (invoice list + "+ New").
  const [page,           setPage]           = useState(() => {
    if (role === 'store_owner') return 'so-home';
    return easyMode ? 'route' : 'home';
  });
  const [overlayPage,    setOverlayPage]    = useState(() => null);
  const [overlayClass,   setOverlayClass]   = useState('page-fade');
  const [drawerOpen,     setDrawerOpen]     = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState(null);
  const [selectedStore,  setSelectedStore]  = useState(null);
  const [showQuickStart, setShowQuickStart] = useState(false); // replay from Settings/drawer
  const [walkthroughId,  setWalkthroughId]  = useState(null);  // active guided walkthrough id
  const [homePulse,      setHomePulseState] = useState(() => isHomePulse());
  // WhatsNew starts hidden — only shown after onboarding is complete so the
  // two overlays never fight each other and block all interaction.
  const [showWhatsNew,   setShowWhatsNew]   = useState(false);
  const { updateAvailable, applyUpdate }    = useAppUpdate();
  const { shouldShow: shouldShowOnboarding, markComplete: markOnboardingComplete, skipOnboarding } = useOnboarding();
  const [versionUpdateAvailable, setVersionUpdateAvailable] = useState(false);
  useVersionCheck(); // fires EVENTS.VERSION_UPDATE event when server has a newer build

  // ── Cross-account event badges (tab-strip unread counts) ───────────────────
  const [badges, setBadges] = useState({});
  const refreshBadges = useCallback(() => setBadges(computeBadges(role)), [role]);

  // Seed seen-markers on first run, paint instantly from cache, then refresh the
  // caches that feed badges so counts appear without first visiting the tab.
  useEffect(() => {
    ensureBadgesInitialized();
    refreshBadges();
    const loads = role === 'store_owner'
      ? [loadSharedInvoicesFromCloud(), loadConnectionOrdersFromCloud()]
      : [loadConnectionOrdersFromCloud()];
    Promise.allSettled(loads).then(refreshBadges);
    const onRefresh = () => refreshBadges();
    window.addEventListener('inv-badges-refresh', onRefresh);
    return () => window.removeEventListener('inv-badges-refresh', onRefresh);
  }, [role, refreshBadges]);

  // Opening a badge tab (tap or swipe) marks its events seen → badge clears.
  useEffect(() => {
    if (BADGE_KEYS.includes(page)) { markSeen(page); refreshBadges(); }
  }, [page, refreshBadges]);

  // ── Lightweight real-time ──────────────────────────────────────────────────
  // Poll the cross-account tables every 30s while the app is foregrounded and
  // the user is signed in. Refreshed caches recompute badges and fire
  // EVENTS.DATA_REFRESH so any open cross-account list re-reads. Paused when the
  // tab is hidden so it stays cheap on Supabase reads and battery. Guests have
  // no cloud data, so they never poll.
  useEffect(() => {
    if (isGuest()) return;
    let timer = null;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      const loads = role === 'store_owner'
        ? [loadSharedInvoicesFromCloud(), loadConnectionOrdersFromCloud()]
        : [loadConnectionOrdersFromCloud()];
      await Promise.allSettled(loads);
      refreshBadges();
      window.dispatchEvent(new CustomEvent(EVENTS.DATA_REFRESH));
    };
    const start = () => { if (!timer) timer = setInterval(tick, 30000); };
    const stop  = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') { tick(); start(); } else { stop(); }
    };
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [role, refreshBadges]);

  // "What's New" is a changelog — only meaningful to someone who used a PRIOR
  // version. A brand-new user (onboarding was needed at mount) has nothing to
  // compare against, so silently mark this version seen instead of showing the
  // modal. Returning users who update (onboarding already long done) still see it.
  const wasFirstRunRef = useRef(shouldShowOnboarding);
  useEffect(() => {
    if (shouldShowOnboarding || hasSeenWhatsNew()) return;
    if (wasFirstRunRef.current) markWhatsNewSeen();
    else setShowWhatsNew(true);
  }, [shouldShowOnboarding]);

  // Listen for version-check update signal and surface it to the user
  useEffect(() => {
    const handler = () => setVersionUpdateAvailable(true);
    window.addEventListener(EVENTS.VERSION_UPDATE, handler);
    return () => window.removeEventListener(EVENTS.VERSION_UPDATE, handler);
  }, []);

  // Bridge the app's existing milestone events onto checklist flags (once).
  useEffect(() => { installMilestoneBridge(); }, []);

  // Clear the post-quick-start Home pulse once the user actually opens Home.
  useEffect(() => {
    if (page === 'home' && homePulse) { setHomePulse(false); setHomePulseState(false); }
  }, [page, homePulse]);

  // Layer 2 — fire the "first visit to this tab" contextual tips. triggerTip is
  // a no-op until the quick start is done and is deduped by the TipManager, so
  // it's safe to call on every tab change.
  useEffect(() => {
    if (overlayPage !== null) return;
    const TAB_TIP = {
      route: 'd-route-history', home: 'd-home-chart', stores: 'd-stores', reports: 'd-reports-eod',
      'so-orders': 'o-orders-list', 'so-invoices': 'o-invoices-list',
      'so-drivers': 'o-drivers-list', 'so-home': 'o-home-restock',
    };
    const id = TAB_TIP[page];
    if (id) triggerTip(id);
  }, [page, overlayPage]);

  // Tab strip index — easy-mode driver starts on Route (index 1), else tab 0
  const [tabIdx, setTabIdx] = useState(() => (role !== 'store_owner' && easyMode ? 1 : 0));

  // tabsRef — lets swipe handlers always read the current TABS without re-registering
  const tabsRef = useRef(TABS);
  useEffect(() => { tabsRef.current = TABS; }, [role]); // eslint-disable-line

  // Keep `page` in sync with tabIdx (used by TopNav + NavDrawer highlight)
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
  }, []);

  // Launch a guided walkthrough from anywhere. Always route to the role's home
  // tab first so the demo has the tab strip to drive — starting it from an
  // overlay (Settings, Profile, …) would otherwise leave it stuck on that page.
  function startWalkthrough(id) {
    navigate(role === 'store_owner' ? 'so-home' : 'home');
    setWalkthroughId(id);
  }

  // Apply density class on mount + sync body background so any sub-pixel
  // gap between #root and the physical screen edges matches the app theme.
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(STORAGE_KEYS.DENSITY)) || 'comfortable';
      document.body.classList.toggle('density-compact', d === 'compact');
    } catch {}
  }, []);

  // Redeem a captured invite code once authenticated. AppInner only renders
  // inside AuthGate, so the user is signed in by the time this runs. Best-effort:
  // if the cloud isn't reachable the code stays queued and retries next load.
  useEffect(() => {
    redeemPendingInvite().catch(() => {});
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

  // ── Quick Start finish (shared by first-run and replay) ─────────────────────
  const isFirstRunQuickStart = shouldShowOnboarding;
  function finishQuickStart(skipped) {
    if (isFirstRunQuickStart) {
      skipped ? skipOnboarding() : markOnboardingComplete();
      // Pulse the Home tab afterward to point the driver at their dashboard.
      if (!skipped && role !== 'store_owner') { setHomePulse(true); setHomePulseState(true); }
      navigate(role === 'store_owner' ? 'so-orders' : 'route');
    } else {
      setShowQuickStart(false);
    }
  }
  const quickStartVisible = shouldShowOnboarding || showQuickStart;

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

  // Measured wrapper width in px. The tab strip is positioned entirely in px
  // (each slide = stripW, translate = -tabIdx * stripW) rather than with a
  // percentage-of-a-400%-wide-strip transform. The old dual-percentage basis
  // (child width 25% of a 400% strip + translateX(calc(-N% ...))) let iOS Safari
  // round the slide boundary and the translate independently, leaving a few-px
  // seam of the adjacent tab. One measured px value keeps them perfectly aligned.
  // 0 until first layout — falls back to the percentage layout for that one frame.
  const [stripW, setStripW] = useState(0);
  useLayoutEffect(() => {
    const el = swipeWrapperRef.current;
    if (!el) return;
    const measure = () => setStripW(el.clientWidth);
    measure(); // synchronous, pre-paint — no flash of the fallback layout
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [overlayPage]); // wrapper remounts when an overlay closes — re-measure then

  // Belt-and-suspenders to the onScroll guard below: clear any stray horizontal
  // scroll on the wrapper before each paint after a tab change, so a navigation
  // never lands on a frame where a leftover scrollLeft has shifted the strip.
  useLayoutEffect(() => {
    if (swipeWrapperRef.current) swipeWrapperRef.current.scrollLeft = 0;
  }, [tabIdx, stripW, overlayPage]);

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
        onTutorial={() => startWalkthrough(role === 'store_owner' ? 'so_request' : 'driver_invoice')}
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
          // The strip is N× wider than this clip box, so the browser treats the
          // box as horizontally scrollable even with overflow:hidden. iOS Safari
          // then scrolls it sideways on its own — focusing an input inside a tab,
          // VoiceOver moving focus, or rubber-banding all leave a stray scrollLeft
          // that shifts every tab over and reveals the neighbour as a sliver.
          // Snap any such scroll straight back to 0 (scroll events don't bubble,
          // so this only ever fires for the wrapper's own scroll, never the tabs'
          // vertical scroll).
          onScroll={(e) => {
            if (e.currentTarget.scrollLeft !== 0) e.currentTarget.scrollLeft = 0;
            if (e.currentTarget.scrollTop  !== 0) e.currentTarget.scrollTop  = 0;
          }}
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
              width: stripW ? `${TABS.length * stripW}px` : `${TABS.length * 100}%`,
              height: '100%',
              paddingTop: `${TOP_NAV_HEIGHT}px`, // must track the fixed TopNav height
              transform: stripW
                ? `translateX(${-tabIdx * stripW + dragOffset}px)`
                : `translateX(calc(-${tabIdx * (100 / TABS.length)}% + ${dragOffset}px))`,
              transition: swiping ? 'none' : 'transform 0.38s cubic-bezier(0.32,0.72,0,1)',
              willChange: 'transform',
              boxSizing: 'border-box',
            }}
          >
            {(role === 'store_owner' ? [
              <SOHome      key="so-home"     onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />,
              <SOOrders    key="so-orders"   onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />,
              <SODrivers   key="so-drivers"  onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />,
              <SOInvoices  key="so-invoices" onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />,
            ] : [
              <Home           key="home"    onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />,
              <InvoiceHistory key="route"   onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} onSelectStore={s => { setSelectedStore(s); navigate('store-balance'); }} onNewInvoice={() => navigate('invoice')} />,
              <DriverStores   key="stores"  onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} onSelectStore={s => { setSelectedStore(s); navigate('store-balance'); }} />,
              <DriverReports  key="reports" onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />,
            ]).map((child, i) => (
              <div
                key={i}
                data-scroll-container="tab"
                style={{
                  width: stripW ? `${stripW}px` : `${100 / TABS.length}%`,
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
          <Suspense fallback={
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span aria-hidden style={{ width: 30, height: 30, borderRadius: '50%', border: `3px solid ${C.cardBorder}`, borderTopColor: '#4A7BF7', animation: 'tut-spin 0.8s linear infinite' }} />
            </div>
          }>
          {overlayPage === 'invoice-view' && currentInvoice && (
            <InvoiceView
              invoice={currentInvoice}
              onBack={goBackFromOverlay}
              onNewInvoice={() => { setCurrentInvoice(null); goBackFromOverlay(); }}
            />
          )}
          {overlayPage === 'invoice' && (
            <NewInvoice onOpenDrawer={() => setDrawerOpen(true)} onGenerated={handleInvoiceGenerated} onNav={navigate} onBack={goBackFromOverlay} />
          )}
          {overlayPage === 'so-request' && (
            <NewRequest onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} onBack={goBackFromOverlay} />
          )}
          {overlayPage === 'products' && <Products  onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'so-reports' && <SOReports onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'marketplace'  && <Marketplace onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'my-listings'  && <MyListings  onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'find-drivers' && <FindDrivers onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'about'      && <About      onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'privacy'    && <Legal section="privacy" onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'terms'      && <Legal section="terms"   onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'profile'    && <Profile    onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'reports'    && <Reports    onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'settings'   && <Settings   onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} onClose={goBackFromOverlay} onSwitchRole={onSwitchRole} onReplayTutorial={() => { goBackFromOverlay(); setShowQuickStart(true); }} onStartWalkthrough={startWalkthrough} />}
          {overlayPage === 'store-map'  && <StoreMap   onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'notes'      && <Notes      onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'end-of-day' && <EndOfDay   onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'store-balance' && selectedStore && (
            <StoreBalance storeName={selectedStore} onBack={goBackFromOverlay} />
          )}
          </Suspense>
        </div>
      )}

      {/* Hide top nav on overlay pages — they have their own headers */}
      {overlayPage === null && (
        <TopNav currentPage={page} onNav={navigate} onOpenDrawer={() => setDrawerOpen(true)} role={role} badges={badges} pulse={homePulse ? { home: true } : {}} />
      )}
      <OfflineBanner dark={dark} />

      {/* ── Tutorial system ──────────────────────────────────────────────────── */}
      {quickStartVisible && (
        <Suspense fallback={null}>
          <QuickStart
            role={role}
            onComplete={() => finishQuickStart(false)}
            onSkip={() => finishQuickStart(true)}
          />
        </Suspense>
      )}
      <Suspense fallback={null}>
        {/* Pause tips while any other onboarding surface is up (quick start,
            What's New, or a guided walkthrough) so only one thing shows at once. */}
        <TipManager role={role} paused={quickStartVisible || showWhatsNew || !!walkthroughId} />
      </Suspense>

      {/* Layer 4 — guided walkthroughs */}
      {walkthroughId && (
        <Suspense fallback={null}>
          <WalkthroughRunner
            walkthroughId={walkthroughId}
            onClose={() => setWalkthroughId(null)}
          />
        </Suspense>
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
      <SyncQueueRunner />
      <AuthGate>
        <RoleGate />
      </AuthGate>
    </ThemeProvider>
  );
}
