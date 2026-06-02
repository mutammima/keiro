/**
 * @unused NOT IMPORTED ANYWHERE — this hook exists but is never called.
 *
 * It was written to eliminate the 2-line boilerplate that appears in every
 * component: `const { dark } = useTheme(); const C = dark ? DARK : LIGHT;`
 * However, all existing components still use that boilerplate directly.
 * Adopt this hook in new components going forward, or delete it if the
 * boilerplate pattern is preferred for explicitness.
 *
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
