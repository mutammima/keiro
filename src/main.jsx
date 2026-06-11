import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { captureInviteFromUrl } from './utils/connectionStorage'

// Capture an `?invite=CODE` link param before React mounts and strip it from the
// URL. Stashing it now means the code survives the auth/login flow and can be
// redeemed once the user is signed in (see redeemPendingInvite in AppInner).
captureInviteFromUrl();

// Register service worker.
// Update detection and the user-facing "Update available" banner are handled
// by the useAppUpdate hook inside the app — NOT here. No silent force-reloads.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
