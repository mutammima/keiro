/**
 * useDensity — returns spacing tokens that shrink in compact mode.
 *
 * Comfortable (default): normal card padding, 16px store name, generous spacing.
 * Compact: tighter padding, 14px store name, smaller gaps — fits more rows on screen.
 *
 * Reacts to EVENTS.DENSITY_CHANGE window events dispatched by Settings.
 */
import { useState, useEffect } from 'react';
import { EVENTS } from '../utils/constants';

function readDensity() {
  try {
    const raw = localStorage.getItem('inv_density');
    return (raw === 'compact' || raw === '"compact"') ? 'compact' : 'comfortable';
  } catch { return 'comfortable'; }
}

export function useDensity() {
  const [mode, setMode] = useState(readDensity);

  useEffect(() => {
    function onDensityChange() { setMode(readDensity()); }
    window.addEventListener(EVENTS.DENSITY_CHANGE, onDensityChange);
    return () => window.removeEventListener(EVENTS.DENSITY_CHANGE, onDensityChange);
  }, []);

  const compact = mode === 'compact';
  return {
    compact,
    // Card outer padding
    cardTopPad:    compact ? '10px 12px 6px'  : '16px 16px 10px',
    cardFootPad:   compact ? '2px 12px 8px'   : '2px 16px 14px',
    // Store name font size
    storeNameSize: compact ? 14 : 16,
    // Meta font size
    metaSize:      compact ? 11 : 12,
    // Card gap
    cardGap:       compact ? 6  : 8,
    // Card border radius
    cardRadius:    compact ? 14 : 18,
    // Body padding
    bodyPad:       compact ? '8px 12px 88px' : '12px 16px 88px',
    // Nested sections
    nestedTopPad:  compact ? '8px 12px 0'   : '14px 16px 0',
  };
}
