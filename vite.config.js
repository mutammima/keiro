import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';
import fs from 'fs';

// ── Auto-versioning ───────────────────────────────────────────────────────────
// Compute a unique version from the git commit hash at build/dev-start time.
// This value is:
//   1. Written to public/version.json — what the server serves to running clients
//   2. Injected as __APP_VERSION__ into the JS bundle — what each client knows it is
//
// Result: every deploy automatically has a different version, so useVersionCheck
// will detect the mismatch and show the "Update now / Later" banner to any user
// still running the previous build. No manual version bumping ever needed.
let appVersion;
try {
  appVersion = execSync('git rev-parse --short HEAD', { stdio: 'pipe' })
    .toString()
    .trim();
} catch {
  // Fallback for environments without git (e.g. some CI setups)
  appVersion = Date.now().toString(36);
}

// Write version.json so the deployed static server exposes it
fs.writeFileSync('./public/version.json', JSON.stringify({ version: appVersion }));

console.log(`[Keiro] Build version: ${appVersion}`);

export default defineConfig({
  plugins: [react()],
  define: {
    // Replaced at bundle time — useVersionCheck reads this as LOCAL_VERSION
    __APP_VERSION__: JSON.stringify(appVersion),
  },
});
