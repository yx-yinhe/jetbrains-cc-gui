export interface IdeThemePayload {
  isDark?: boolean;
  backgroundColor?: string;
  transparentBackground?: boolean;
}

export interface AppearanceOpacitySettings {
  surface: number;
  header: number;
  menu: number;
  secondaryPopover: number;
  input: number;
  userMessage: number;
}

type StoredAppearanceOpacitySettings = Partial<AppearanceOpacitySettings> & {
  statusPanel?: number;
};

export const APPEARANCE_OPACITY_STORAGE_KEY = 'appearanceOpacitySettings';

export const DEFAULT_APPEARANCE_OPACITY_SETTINGS: AppearanceOpacitySettings = {
  surface: 46,
  header: 44,
  menu: 78,
  secondaryPopover: 78,
  input: 36,
  userMessage: 52,
};

const STATUS_TAB_ACTIVE_OPACITY = 60;

const FONT_SIZE_SCALE_BY_LEVEL: Record<number, number> = {
  1: 0.8,
  2: 0.9,
  3: 1.0,
  4: 1.1,
  5: 1.2,
  6: 1.4,
};

function isValidHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function normalizeOpacityPercent(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function alpha(percent: number): string {
  return (normalizeOpacityPercent(percent, 0) / 100).toFixed(2);
}

function clampDerivedOpacity(percent: number): number {
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function hexToRgb(value: string): [number, number, number] | null {
  if (!isValidHexColor(value)) return null;
  return [
    parseInt(value.slice(1, 3), 16),
    parseInt(value.slice(3, 5), 16),
    parseInt(value.slice(5, 7), 16),
  ];
}

function rgba(rgb: string | [number, number, number], opacityPercent: number): string {
  const channels = Array.isArray(rgb) ? rgb.join(', ') : rgb;
  return `rgba(${channels}, ${alpha(opacityPercent)})`;
}

export function normalizeAppearanceOpacitySettings(
  settings: StoredAppearanceOpacitySettings | null | undefined,
): AppearanceOpacitySettings {
  return {
    surface: normalizeOpacityPercent(settings?.surface, DEFAULT_APPEARANCE_OPACITY_SETTINGS.surface),
    header: normalizeOpacityPercent(settings?.header, DEFAULT_APPEARANCE_OPACITY_SETTINGS.header),
    menu: normalizeOpacityPercent(settings?.menu, DEFAULT_APPEARANCE_OPACITY_SETTINGS.menu),
    secondaryPopover: normalizeOpacityPercent(
      settings?.secondaryPopover ?? settings?.statusPanel,
      DEFAULT_APPEARANCE_OPACITY_SETTINGS.secondaryPopover,
    ),
    input: normalizeOpacityPercent(settings?.input, DEFAULT_APPEARANCE_OPACITY_SETTINGS.input),
    userMessage: normalizeOpacityPercent(settings?.userMessage, DEFAULT_APPEARANCE_OPACITY_SETTINGS.userMessage),
  };
}

export function getStoredAppearanceOpacitySettings(): AppearanceOpacitySettings {
  try {
    const saved = localStorage.getItem(APPEARANCE_OPACITY_STORAGE_KEY);
    if (!saved) return DEFAULT_APPEARANCE_OPACITY_SETTINGS;
    return normalizeAppearanceOpacitySettings(JSON.parse(saved) as StoredAppearanceOpacitySettings);
  } catch {
    return DEFAULT_APPEARANCE_OPACITY_SETTINGS;
  }
}

export function storeAppearanceOpacitySettings(settings: AppearanceOpacitySettings): void {
  try {
    localStorage.setItem(
      APPEARANCE_OPACITY_STORAGE_KEY,
      JSON.stringify(normalizeAppearanceOpacitySettings(settings)),
    );
  } catch {
    // Ignore storage failures; the live CSS variables are still applied.
  }
}

export function getIdeThemeName(payload: IdeThemePayload): 'light' | 'dark' {
  return payload.isDark ? 'dark' : 'light';
}

export function applyIdeThemePayload(payload: IdeThemePayload): void {
  const root = document.documentElement;
  if (typeof payload.backgroundColor === 'string' && isValidHexColor(payload.backgroundColor)) {
    root.style.setProperty('--cc-gui-ide-background-color', payload.backgroundColor);
  }
  root.style.setProperty(
    '--cc-gui-transparent-background',
    payload.transparentBackground === false ? '0' : '1',
  );
}

export function applyInitialIdeThemeGlobals(): void {
  applyIdeThemePayload({
    backgroundColor: window.__INITIAL_IDE_BACKGROUND_COLOR__,
    transparentBackground: window.__INITIAL_IDE_TRANSPARENT_BACKGROUND__,
  });
}

export function applyAppearanceOpacitySettings(
  settings: AppearanceOpacitySettings = getStoredAppearanceOpacitySettings(),
  userMessageHexColor = localStorage.getItem('userMsgColor') || '',
): void {
  const normalized = normalizeAppearanceOpacitySettings(settings);
  const root = document.documentElement;
  const theme = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';

  const surfaceRgb = theme === 'light' ? '255, 255, 255' : '30, 30, 30';
  const headerRgb = theme === 'light' ? '243, 243, 243' : '37, 37, 38';
  const codeRgb = theme === 'light' ? '255, 255, 255' : '18, 18, 18';
  const inputRgb = theme === 'light' ? '255, 255, 255' : '18, 18, 18';
  const menuRgb = theme === 'light' ? '255, 255, 255' : '30, 30, 30';
  const menuHoverRgb = theme === 'light' ? '224, 224, 224' : '65, 67, 73';
  const menuSelectedRgb = theme === 'light' ? '227, 242, 253' : '9, 71, 113';
  const userMessageRgb = hexToRgb(userMessageHexColor)
    || (theme === 'light' ? [0, 120, 212] : [0, 95, 184]);

  root.style.setProperty('--cc-gui-surface-bg', rgba(surfaceRgb, normalized.surface));
  root.style.setProperty('--cc-gui-surface-bg-soft', rgba(surfaceRgb, clampDerivedOpacity(normalized.surface - 18)));
  root.style.setProperty('--cc-gui-surface-bg-strong', rgba(surfaceRgb, clampDerivedOpacity(normalized.surface + 26)));
  root.style.setProperty('--cc-gui-code-block-bg', rgba(codeRgb, clampDerivedOpacity(normalized.surface + 12)));
  root.style.setProperty('--cc-gui-header-bg', rgba(headerRgb, normalized.header));
  root.style.setProperty('--cc-gui-input-bg', rgba(inputRgb, normalized.input));
  root.style.setProperty('--cc-gui-menu-bg', rgba(menuRgb, normalized.menu));
  root.style.setProperty('--cc-gui-menu-hover-bg', rgba(menuHoverRgb, clampDerivedOpacity(normalized.menu + 8)));
  root.style.setProperty('--cc-gui-menu-selected-bg', rgba(menuSelectedRgb, clampDerivedOpacity(normalized.menu + 10)));
  root.style.setProperty('--cc-gui-secondary-popover-bg', rgba(menuRgb, normalized.secondaryPopover));
  root.style.setProperty('--cc-gui-secondary-popover-bg-soft', rgba(menuRgb, clampDerivedOpacity(normalized.secondaryPopover - 18)));
  root.style.setProperty('--cc-gui-secondary-popover-bg-strong', rgba(menuRgb, clampDerivedOpacity(normalized.secondaryPopover + 10)));
  root.style.setProperty('--cc-gui-secondary-popover-hover-bg', rgba(menuHoverRgb, clampDerivedOpacity(normalized.secondaryPopover + 18)));
  root.style.setProperty('--cc-gui-status-panel-bg', rgba(menuRgb, normalized.secondaryPopover));
  root.style.setProperty('--cc-gui-status-panel-bg-soft', rgba(menuRgb, clampDerivedOpacity(normalized.secondaryPopover - 18)));
  root.style.setProperty('--cc-gui-status-panel-bg-strong', rgba(menuRgb, clampDerivedOpacity(normalized.secondaryPopover + 10)));
  root.style.setProperty('--cc-gui-status-tab-active-bg', rgba(menuHoverRgb, STATUS_TAB_ACTIVE_OPACITY));
  root.style.setProperty('--color-message-user-bg', rgba(userMessageRgb, normalized.userMessage));
}

export function normalizeFontSizeLevel(level: number, fallback = 2): number {
  return level >= 1 && level <= 6 ? level : fallback;
}

export function applyContentFontScale(level: number): void {
  const normalizedLevel = normalizeFontSizeLevel(level);
  const scale = FONT_SIZE_SCALE_BY_LEVEL[normalizedLevel] || 1.0;
  const root = document.documentElement;
  root.style.setProperty('--cc-gui-content-font-scale', scale.toString());
  root.style.setProperty('--font-scale', '1');
}
