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
      globals: { ...globals.browser, __APP_VERSION__: 'readonly' },
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
]);
