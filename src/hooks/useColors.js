/**
 * useColors — returns the current theme color palette.
 *
 * Replaces the repeated 2-line boilerplate found in every component:
 *   const { dark } = useTheme();
 *   const C = dark ? DARK : LIGHT;
 *
 * Usage:
 *   const { C, dark } = useColors();
 */
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK } from '../theme';

export function useColors() {
  const { dark, toggleDark, accent, setAccent } = useTheme();
  return {
    C: dark ? DARK : LIGHT,
    dark,
    toggleDark,
    accent,
    setAccent,
  };
}
