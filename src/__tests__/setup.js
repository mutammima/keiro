/**
 * setup.js — vitest setup file (jsdom environment), loaded before every test file.
 *
 * - jest-dom matchers (toBeInTheDocument, etc.) for the component tests.
 * - jsdom doesn't implement Element.scrollIntoView — useElementRect.js (the
 *   tutorial spotlight's rect-tracking hook) calls it unconditionally, so
 *   without a stub every tutorial test prints a jsdom "not implemented" error.
 */

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// The project runs vitest with `globals: false` (explicit `import { ... } from
// 'vitest'` everywhere, matching house convention), so @testing-library/react's
// auto-cleanup — which only self-registers when it detects a global afterEach
// — never attaches. Without this, every render() from a previous test stays
// mounted (duplicate DOM nodes break getByRole queries in later tests) AND
// components with a running effect — e.g. useElementRect's setTimeout polling
// loop in the tutorial spotlight — keep ticking after the test file finishes
// and throw once jsdom is torn down. Explicit cleanup after each test fixes
// both.
afterEach(cleanup);
