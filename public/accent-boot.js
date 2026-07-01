/**
 * Accent boot — applies the user's saved accent colour before first paint.
 *
 * Lives as an external file (not inline in index.html) so the site can ship a
 * Content-Security-Policy of `script-src 'self'` without an inline-script
 * exception. Loaded as a classic blocking script in <head> on purpose: it must
 * run before the app renders or the accent flashes from default → saved.
 */
try {
  var _a = localStorage.getItem('inv_accent_color');
  if (_a) document.documentElement.style.setProperty('--accent', _a);
} catch (e) { /* private mode / no storage — default accent stands */ }
