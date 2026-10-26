/**
 * appVersion.js — the version line in the footer and About.
 *
 * __APP_RELEASE__ is package.json's version; __APP_VERSION__ the git hash of
 * the build. vite.config.js injects both.
 */

export const APP_RELEASE = typeof __APP_RELEASE__ !== 'undefined' ? __APP_RELEASE__ : '0.0.0';
export const APP_BUILD = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

/** "Keiro 5.9 · build 4854eda" */
export function versionLabel(release = APP_RELEASE, build = APP_BUILD) {
  const [major = '0', minor = '0'] = String(release).split('.');
  return `Keiro ${major}.${minor} · build ${build}`;
}
