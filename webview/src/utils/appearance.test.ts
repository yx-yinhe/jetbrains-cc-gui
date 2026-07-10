import { afterEach, describe, expect, it } from 'vitest';
import {
  APPEARANCE_OPACITY_STORAGE_KEY,
  DEFAULT_APPEARANCE_OPACITY_SETTINGS,
  applyAppearanceOpacitySettings,
  applyContentFontScale,
  getStoredAppearanceOpacitySettings,
  normalizeAppearanceOpacitySettings,
  storeAppearanceOpacitySettings,
} from './appearance';

describe('appearance settings', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
  });

  it('migrates legacy code block opacity from the saved surface value', () => {
    expect(normalizeAppearanceOpacitySettings({ surface: 73, statusPanel: 64 })).toMatchObject({
      surface: 73,
      codeBlock: 85,
      secondaryPopover: 64,
    });
    expect(normalizeAppearanceOpacitySettings({ surface: 95 }).codeBlock).toBe(100);
    expect(normalizeAppearanceOpacitySettings({ surface: 20, codeBlock: 41 }).codeBlock).toBe(41);
  });

  it('persists the migrated code block opacity as an independent field', () => {
    localStorage.setItem(APPEARANCE_OPACITY_STORAGE_KEY, JSON.stringify({ surface: 73 }));

    const migrated = getStoredAppearanceOpacitySettings();
    storeAppearanceOpacitySettings(migrated);

    expect(migrated.codeBlock).toBe(85);
    expect(JSON.parse(localStorage.getItem(APPEARANCE_OPACITY_STORAGE_KEY) || '{}')).toMatchObject({
      surface: 73,
      codeBlock: 85,
    });
  });

  it('applies Markdown code block opacity independently from tool code surfaces', () => {
    const root = document.documentElement;
    root.setAttribute('data-theme', 'dark');

    applyAppearanceOpacitySettings({
      ...DEFAULT_APPEARANCE_OPACITY_SETTINGS,
      surface: 20,
      codeBlock: 41,
    });

    expect(root.style.getPropertyValue('--cc-gui-markdown-code-block-bg')).toBe('rgba(18, 18, 18, 0.41)');
    expect(root.style.getPropertyValue('--cc-gui-code-block-bg')).toBe('rgba(18, 18, 18, 0.32)');

    applyAppearanceOpacitySettings({
      ...DEFAULT_APPEARANCE_OPACITY_SETTINGS,
      surface: 70,
      codeBlock: 41,
    });

    expect(root.style.getPropertyValue('--cc-gui-markdown-code-block-bg')).toBe('rgba(18, 18, 18, 0.41)');
    expect(root.style.getPropertyValue('--cc-gui-code-block-bg')).toBe('rgba(18, 18, 18, 0.82)');

    root.setAttribute('data-theme', 'light');
    applyAppearanceOpacitySettings({
      ...DEFAULT_APPEARANCE_OPACITY_SETTINGS,
      codeBlock: 41,
    });
    expect(root.style.getPropertyValue('--cc-gui-markdown-code-block-bg')).toBe('rgba(255, 255, 255, 0.41)');
  });

  it('keeps page zoom disabled while applying content font scaling', () => {
    applyContentFontScale(6);

    expect(document.documentElement.style.getPropertyValue('--cc-gui-content-font-scale')).toBe('1.4');
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1');
  });
});
