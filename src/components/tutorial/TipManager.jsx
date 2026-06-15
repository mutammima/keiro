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

export default function TipManager({ role, paused = false }) {
  const [current, setCurrent] = useState(null); // tip id on screen
  const queueRef = useRef([]);                   // pending tip ids
  const currentRef = useRef(null);
  currentRef.current = current;

  // Pull the next eligible tip off the queue into view.
  function advance() {
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
        }
        advance();
      }}
    />
  );
}
