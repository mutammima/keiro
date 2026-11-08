// @vitest-environment node
/**
 * iOS 27 refuses to launch an app built with the iOS 27 SDK unless it uses the
 * UIScene lifecycle: UIKit traps in
 * _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption before any
 * app code runs. TestFlight build 2 (Xcode 27.2, 2026-11-07) crashed this way
 * on every open on an iOS 27.2 phone. The iOS 26.5 simulator doesn't enforce
 * it, so only a real iOS 27 device shows the crash; this test pins the setup.
 *
 * The setup is Capacitor's own (`migrateToUIScene` in @capacitor/cli 8.6,
 * the same files its iOS template ships).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// eslint-disable-next-line no-undef -- Node global; vitest runs from the repo root
const ios = resolve(process.cwd(), 'ios/App');
const read = (p) => readFileSync(resolve(ios, p), 'utf8');

describe('iOS app launches through a scene (required on iOS 27)', () => {
  it('Info.plist declares the scene manifest with Keiro\'s SceneDelegate', () => {
    const plist = read('App/Info.plist');
    expect(plist).toContain('<key>UIApplicationSceneManifest</key>');
    expect(plist).toContain('<string>$(PRODUCT_MODULE_NAME).SceneDelegate</string>');
  });

  it('SceneDelegate.swift exists and is compiled into the App target', () => {
    expect(existsSync(resolve(ios, 'App/SceneDelegate.swift'))).toBe(true);
    expect(read('App.xcodeproj/project.pbxproj')).toMatch(/SceneDelegate\.swift in Sources/);
  });

  it('keiro:// links (Google sign-in, invites) still reach the app through the scene', () => {
    const scene = read('App/SceneDelegate.swift');
    expect(scene).toMatch(/openURLContexts[\s\S]*SceneDelegateProxy\.shared\.scene\(scene, openURLContexts:/);
    expect(scene).toMatch(/willConnectTo[\s\S]*SceneDelegateProxy\.shared\.scene\(scene, willConnectTo:/);
  });

  it('AppDelegate hands new scenes to SceneDelegate', () => {
    expect(read('App/AppDelegate.swift')).toMatch(/configurationForConnecting[\s\S]*delegateClass = SceneDelegate\.self/);
  });
});
