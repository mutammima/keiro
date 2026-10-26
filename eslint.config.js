import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettierConfig from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  // `ios/App/App/public` is the web bundle `cap sync ios` copies into the native
  // project — build output, gitignored, and it otherwise floods `npm run lint`
  // with ~9.6k phantom problems from minified vendor code.
  globalIgnores(['dist', 'node_modules', 'public', 'ios']),
  // Run by Node, not the browser: the Vite config (reads the Sentry env vars)
  // and the Vercel Functions.
  {
    files: ['vite.config.js', 'api/**/*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      prettierConfig, // must be last — disables ESLint rules that conflict with Prettier
    ],
    languageOptions: {
      // __APP_VERSION__ is injected at build time by vite.config.js (see the
      // Update System section in CLAUDE.md) — declare it so it isn't no-undef.
      globals: { ...globals.browser, __APP_VERSION__: 'readonly', __APP_RELEASE__: 'readonly' },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-unused-vars': ['warn', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
      'prefer-const': 'warn',
      'no-var': 'error',
      'no-extra-semi': 'off',
    },
  },
  // AbortSignal.timeout is missing before Safari 16 and the iOS app targets iOS 15: calling it there throws before the
  // request goes out (the plan answer, the barcode lookups and the shared product names all failed that way once).
  // The helper itself looks it up at call time, and the tests take it away and put it back, so both are exempt.
  {
    files: ['src/**/*.{js,jsx}'],
    ignores: ['src/utils/timeoutSignal.js', 'src/__tests__/**'],
    rules: {
      'no-restricted-properties': ['error', {
        object: 'AbortSignal',
        property: 'timeout',
        message: 'Use timeoutSignal() from utils/timeoutSignal — AbortSignal.timeout is missing on iOS 15',
      }],
    },
  },
]);
