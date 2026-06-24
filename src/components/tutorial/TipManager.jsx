/**
 * TipManager — the always-mounted coordinator for Layer 2 contextual tips.
 *
 * Listens for triggerTip() events from across the app, then decides whether each
 * one should show:
 *   • only after the Quick Start is finished (so the two layers never overlap)
 *   • only when the tip is in scope for the current role
 *   • only once — anything already seen is ignored
 *   • one at a time — concurrent triggers queue up and play in order
 *
 * When `paused` (e.g. the Quick Start replay is on screen) it shows nothing and
 * drops incoming triggers; they re-fire naturally the next time their condition
 * recurs (tab visit, card expand, etc.).
 */

import { useEffect, useRef, useState } from 'react';
import {
  TIP_TRIGGER_EVENT, TIPS,
  hasSeenTip, markTipSeen, markAction, isQuickStartDone,
} from '../../utils/tutorialProgress';
import FeatureTip from './FeatureTip';

// Most a single session will surface before going quiet. Tips are one-time, so
// the rest simply re-fire on a later visit — this spreads them out instead of
// burying a brand-new user under a barrage of hints in their first few minutes.
const MAX_TIPS_PER_SESSION = 2;

export default function TipManager({ role, paused = false }) {
  const [current, setCurrent] = useState(null); // tip id on screen
  const queueRef = useRef([]);                   // pending tip ids
  const currentRef = useRef(null);
  const shownCountRef = useRef(0);               // tips the user has dismissed this session
  currentRef.current = current;

  // Pull the next eligible tip off the queue into view. Once the session cap is
  // reached, drain the queue instead — remaining tips re-fire on a later visit.
  function advance() {
    if (shownCountRef.current >= MAX_TIPS_PER_SESSION) { queueRef.current = []; setCurrent(null); return; }
    const next = queueRef.current.shift() || null;
    setCurrent(next);
  }

  useEffect(() => {
    function onTrigger(e) {
      const id = e.detail?.id;
      const tip = id && TIPS[id];
      if (!tip) return;
      if (paused || !isQuickStartDone()) return;
      if (tip.role !== 'any' && tip.role !== role) return;
      if (hasSeenTip(id)) return;
      if (currentRef.current === id || queueRef.current.includes(id)) return;
      // Session throttle: once the cap is reached, drop further triggers. They're
      // not marked seen, so they re-fire naturally on a later session/visit. The
      // count advances only when a tip is actually dismissed (see onDismiss), so
      // a tip that auto-drops for an off-screen anchor doesn't burn a slot.
      if (shownCountRef.current >= MAX_TIPS_PER_SESSION) return;
      if (currentRef.current) queueRef.current.push(id);
      else setCurrent(id);
    }
    window.addEventListener(TIP_TRIGGER_EVENT, onTrigger);
    return () => window.removeEventListener(TIP_TRIGGER_EVENT, onTrigger);
  }, [role, paused]);

  // If we get paused while a tip is up, clear it (it can re-trigger later).
  useEffect(() => {
    if (paused && currentRef.current) { queueRef.current = []; setCurrent(null); }
  }, [paused]);

  if (paused || !current) return null;
  const tip = TIPS[current];
  if (!tip) return null;

  return (
    <FeatureTip
      key={current}
      tip={tip}
      onDismiss={(seen) => {
        if (seen) {
          markTipSeen(current);
          if (tip.marksAction) markAction(tip.marksAction);
          shownCountRef.current += 1; // count only tips the user actually saw + dismissed
        }
        advance();
      }}
    />
  );
}
