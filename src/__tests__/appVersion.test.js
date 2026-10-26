import { describe, it, expect } from 'vitest';
import { versionLabel, APP_RELEASE } from '../utils/appVersion';

describe('versionLabel', () => {
  it('shows major.minor and the build', () => {
    expect(versionLabel('5.9.0', '4854eda')).toBe('Keiro 5.9 · build 4854eda');
  });

  it('reads the release the build injected from package.json', () => {
    expect(APP_RELEASE).toBe('5.9.0');
    expect(versionLabel()).toMatch(/^Keiro 5\.9 · build \S+$/);
  });
});
