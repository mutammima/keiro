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
// One-time onboarding tour — lazy so it doesn't weigh on first paint.
const QuickStart = lazy(() => import('./components/tutorial/QuickStart'));
import useOnboarding from './hooks/useOnboarding';
import { isHomePulse, setHomePulse } from './utils/tutorialProgress';
import SplashScreen from './components/ui/SplashScreen';
import SyncToast from './components/ui/SyncToast';
import SyncQueueRunner from './components/ui/SyncQueueRunner';
import TopNav, { TOP_NAV_HEIGHT } from './components/navigation/TopNav';
import Home from './pages/Home';
const StoreMap = lazy(() => import('./pages/StoreMap'));
const Notes    = lazy(() => import('./pages/Notes'));
const EndOfDay = lazy(() => import('./pages/EndOfDay'));
import WhatsNew from './components/ui/WhatsNew';
import { hasSeenWhatsNew, markWhatsNewSeen } from './utils/whatsNewState';
import PinLock from './components/settings/PinLock';
import { isPinEnabled } from './utils/pinStorage';
import UpdateBanner from './components/ui/UpdateBanner';
import useAppUpdate from './hooks/useAppUpdate';
import useVersionCheck, { applyVersionUpdate } from './hooks/useVersionCheck';
import { STORAGE_KEYS, EVENTS, SYNC_POLL_HEALTHY_MS, SYNC_POLL_DEGRADED_MS, SIDE_NAV_WIDTH } from './utils/constants';
import { supabase } from './services/supabase';
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
import { tabIdsForRole } from './components/navigation/tabs';
import { useBreakpoint, BP } from './hooks/useBreakpoint';
import './App.css';

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

  // Layout tier. Desktop swaps the whole shell: a docked side rail instead of
  // TopNav, and a single rendered tab instead of the swipeable 4× strip.
  const bp = useBreakpoint();
  const desktop = bp === BP.DESKTOP;

  const TABS = tabIdsForRole(role);

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
    // One-time seed + instant paint from cache on mount. The async refresh in
    // the Promise below (not flagged, it runs in a .then) updates the counts
    // once cloud data arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  // An effect on `page` is the right choke point: page changes through five
  // paths (tab tap, swipe, navigate, open/close overlay), so centralising here
  // beats duplicating the clear at every setPage site.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (BADGE_KEYS.includes(page)) { markSeen(page); refreshBadges(); }
  }, [page, refreshBadges]);

  // ── Cross-account sync: Realtime first, polling only as a backstop ─────────
  // This used to poll every 30s (~2,880 requests/day per open session), which
  // re-downloaded the full connection_orders set each time and was the main
  // driver of the Supabase egress overage. Now a websocket subscription pushes
  // changes instead — cheaper AND instant instead of up-to-30s stale.
  //
  // The poll survives as a safety net because postgres_changes silently
  // delivers nothing if the table isn't in the `supabase_realtime` publication
  // (see supabase-realtime.sql). Its interval self-tunes: rare once Realtime is
  // confirmed subscribed, faster if the subscription never lands, so the app
  // still works either way. Guests have no cloud data and skip all of it.
  useEffect(() => {
    if (isGuest()) return;

    let timer = null;
    let pollMs = SYNC_POLL_DEGRADED_MS; // assume degraded until Realtime confirms
    let cancelled = false;

    const refresh = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      const loads = role === 'store_owner'
        ? [loadSharedInvoicesFromCloud(), loadConnectionOrdersFromCloud()]
        : [loadConnectionOrdersFromCloud()];
      await Promise.allSettled(loads);
      if (cancelled) return;
      refreshBadges();
      window.dispatchEvent(new CustomEvent(EVENTS.DATA_REFRESH));
    };

    const stopPoll  = () => { if (timer) { clearInterval(timer); timer = null; } };
    const startPoll = () => { stopPoll(); timer = setInterval(refresh, pollMs); };

    // Realtime: any insert/update on the cross-account tables triggers one
    // refresh. No filter — RLS already scopes what this user can see, and a
    // spurious wake costs a single refetch.
    const channel = supabase.channel('keiro-cross-account');
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'connection_orders' }, refresh);
    if (role === 'store_owner') {
      // A store owner's "shared invoices" are rows in `invoices` carrying their
      // store_user_id — there is no separate table. RLS limits the events to
      // exactly those rows.
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, refresh);
    }
    channel.subscribe(status => {
      if (cancelled) return;
      // SUBSCRIBED means events will actually arrive, so the poll can back off.
      const healthy = status === 'SUBSCRIBED';
      const next = healthy ? SYNC_POLL_HEALTHY_MS : SYNC_POLL_DEGRADED_MS;
      if (next !== pollMs) { pollMs = next; if (timer) startPoll(); }
    });

    // Coming back to the foreground: refresh once immediately (covers anything
    // missed while hidden, since Realtime events aren't replayed) and resume.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') { refresh(); startPoll(); } else { stopPoll(); }
    };

    startPoll();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      stopPoll();
      document.removeEventListener('visibilitychange', onVisibility);
      supabase.removeChannel(channel);
    };
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

  // Clear the post-tour Home pulse once the user actually opens Home. Same as
  // the badge effect above: reacting to `page` here is the single choke point
  // for a value that changes through several paths.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (page === 'home' && homePulse) { setHomePulse(false); setHomePulseState(false); }
  }, [page, homePulse]);

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

  // Apply density class on mount + sync body background so any sub-pixel
  // gap between #root and the physical screen edges matches the app theme.
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(STORAGE_KEYS.DENSITY)) || 'comfortable';
      document.body.classList.toggle('density-compact', d === 'compact');
    } catch {
      // localStorage blocked (private mode) or the stored density is malformed
      // JSON -- density is cosmetic, so the default 'comfortable' class state stands.
    }
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
    // Wrapper remounts when an overlay closes, and when crossing the desktop
    // breakpoint (desktop doesn't render the strip at all) — re-measure on both.
  }, [overlayPage, desktop]);

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
    // Handlers read live values via refs, so this doesn't need to re-run on
    // state changes — but it MUST re-run across the desktop breakpoint, because
    // desktop unmounts the swipe wrapper. Without this dep, resizing a desktop
    // window down to phone width would leave swipe permanently dead.
  }, [desktop]);

  // ── Render ───────────────────────────────────────────────────────────────────
  const isTabPage = overlayPage === null;

  // The four tab pages for this role, in tab order. Hoisted out of the JSX
  // because both layouts need them: phone/tablet lay all four side by side in
  // the swipe strip, desktop renders only the active one.
  const tabEls = role === 'store_owner' ? [
    <SOHome      key="so-home"     onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />,
    <SOOrders    key="so-orders"   onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />,
    <SODrivers   key="so-drivers"  onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />,
    <SOInvoices  key="so-invoices" onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />,
  ] : [
    <Home           key="home"    onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />,
    <InvoiceHistory key="route"   onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} onSelectStore={s => { setSelectedStore(s); navigate('store-balance'); }} onNewInvoice={() => navigate('invoice')} />,
    <DriverStores   key="stores"  onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} onSelectStore={s => { setSelectedStore(s); navigate('store-balance'); }} />,
    <DriverReports  key="reports" onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />,
  ];

  // Desktop insets every content surface past the docked rail; phone/tablet
  // start at the left edge as before.
  const contentLeft = desktop ? SIDE_NAV_WIDTH : 0;

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
        onTutorial={() => setShowQuickStart(true)}
        role={role}
        onSwitchRole={onSwitchRole}
        docked={desktop}
        badges={badges}
        pulse={homePulse ? { home: true } : {}}
      />

      {/* ── Tab strip — swipeable ─────────────────────────────────────────── */}
      {/* swipeWrapperRef is the viewport-width clip container that holds the   */}
      {/* 300%-wide strip. Non-passive touch listeners are attached to it via   */}
      {/* useEffect above so e.preventDefault() actually blocks native scroll.  */}
      {isTabPage && (desktop ? (
        // Desktop: no carousel. A mouse can't swipe, so there's no reason to
        // build a 4×-window-wide strip and translate it.
        //
        // But every tab still stays MOUNTED, exactly as the phone strip keeps
        // all four alive. Rendering only the active tab made each rail click
        // unmount one page and mount another, re-running that page's
        // mount-time cloud reads — including an unbounded `select('*')` on
        // connection_orders — on a plain user-driven path. That is precisely
        // the read pattern that blew the Supabase egress cap in Jul 2026 (see
        // CLAUDE.md, "Egress"). Hidden, not unmounted.
        <div style={{ position: 'absolute', inset: 0, left: contentLeft, overflow: 'hidden' }}>
          {tabEls.map((child, i) => (
            <div
              key={i}
              data-scroll-container="tab"
              style={{
                position: 'absolute', inset: 0,
                overflowY: 'auto', overflowX: 'hidden',
                display: i === tabIdx ? 'block' : 'none',
              }}
            >
              {child}
            </div>
          ))}
        </div>
      ) : (
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
              paddingTop: `calc(${TOP_NAV_HEIGHT}px + env(safe-area-inset-top))`, // clears the fixed TopNav + its safe-area pad
              transform: stripW
                ? `translateX(${-tabIdx * stripW + dragOffset}px)`
                : `translateX(calc(-${tabIdx * (100 / TABS.length)}% + ${dragOffset}px))`,
              transition: swiping ? 'none' : 'transform 0.38s cubic-bezier(0.32,0.72,0,1)',
              willChange: 'transform',
              boxSizing: 'border-box',
            }}
          >
            {tabEls.map((child, i) => (
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
      ))}

      {/* ── Overlay pages ──────────────────────────────────────────────────── */}
      {/* Phone/tablet: full-screen, sliding up from the bottom. Desktop: fills  */}
      {/* the content column beside the rail and cross-fades instead — a sheet   */}
      {/* sliding up from the bottom of a monitor is a phone idiom.              */}
      {overlayPage && (
        <div
          key={overlayPage}
          data-scroll-container="overlay"
          className={desktop ? 'page-fade' : overlayClass}
          style={{ position: 'absolute', inset: 0, left: contentLeft, overflowY: 'auto', overflowX: 'hidden', zIndex: 50, background: 'inherit' }}
        >
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
          {overlayPage === 'settings'   && <Settings   onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} onClose={goBackFromOverlay} onSwitchRole={onSwitchRole} onReplayTutorial={() => { goBackFromOverlay(); setShowQuickStart(true); }} />}
          {overlayPage === 'store-map'  && <StoreMap   onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'notes'      && <Notes      onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'end-of-day' && <EndOfDay   onOpenDrawer={() => setDrawerOpen(true)} onNav={navigate} />}
          {overlayPage === 'store-balance' && selectedStore && (
            <StoreBalance storeName={selectedStore} onBack={goBackFromOverlay} />
          )}
          </Suspense>
        </div>
      )}

      {/* Hide top nav on overlay pages — they have their own headers — and on
          desktop, where the docked rail carries the tabs instead. */}
      {overlayPage === null && !desktop && (
        <TopNav currentPage={page} onNav={navigate} onOpenDrawer={() => setDrawerOpen(true)} role={role} badges={badges} pulse={homePulse ? { home: true } : {}} />
      )}
      <OfflineBanner dark={dark} />

      {/* ── Onboarding tour — the only thing that teaches the user anything ───── */}
      {quickStartVisible && (
        <Suspense fallback={null}>
          <QuickStart
            role={role}
            onNav={navigate}
            onComplete={() => finishQuickStart(false)}
            onSkip={() => finishQuickStart(true)}
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
