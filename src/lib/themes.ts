// Theme presets for Dustic.
//
// The app ships one identity in two modes: light and dark. Each maps to a
// daisyUI theme declared in tailwind.config.js. Switching = setting
// `data-theme="<id>"` on <html>; daisyUI rebinds its CSS variables
// (--p, --b1, --bc, …) and the whole app recolors.

export type ThemeId = 'light' | 'dark';

export interface Theme {
	id: ThemeId;
	/** i18n keys — the picker resolves these, so themes stay translated. */
	nameKey: string;
	descriptionKey: string;
	/**
	 * Tile preview colors, mirroring the daisyUI palette for this theme so
	 * the swatch in the picker is what you actually get.
	 */
	preview: { bg: string; surface: string; fg: string; muted: string; accent: string; accentFg: string };
	/** Browser/PWA chrome color for this mode. */
	themeColor: string;
}

const LIGHT: Theme = {
	id: 'light',
	nameKey: 'themes.light.name',
	descriptionKey: 'themes.light.description',
	preview: {
		bg: '#ffffff',
		surface: '#f5f5f5',
		fg: '#000000',
		muted: '#525252',
		accent: '#000000',
		accentFg: '#ffffff'
	},
	themeColor: '#ffffff'
};

const DARK: Theme = {
	id: 'dark',
	nameKey: 'themes.dark.name',
	descriptionKey: 'themes.dark.description',
	preview: {
		bg: '#0f0f0f',
		surface: '#1a1a1a',
		fg: '#ededed',
		muted: '#a3a3a3',
		accent: '#f5f5f5',
		accentFg: '#0f0f0f'
	},
	themeColor: '#0f0f0f'
};

export const THEMES: Record<ThemeId, Theme> = { light: LIGHT, dark: DARK };

export const THEME_LIST: Theme[] = [LIGHT, DARK];

export const DEFAULT_THEME: ThemeId = 'light';

/** Corner radius shared by both themes; mirrors --rounded-box in the config. */
export const THEME_RADIUS = '0.25rem';

/**
 * The mode the operating system asks for. Used as the starting point when
 * the user has never chosen one, so a dark-mode device never gets flashed
 * a white app first.
 */
export function systemPreference(): ThemeId {
	if (typeof window === 'undefined' || !window.matchMedia) return DEFAULT_THEME;
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Apply a theme to the document: `data-theme` for daisyUI, plus the
 * browser chrome color so the PWA status bar matches the app.
 */
export function applyTheme(id: ThemeId): void {
	if (typeof document === 'undefined') return;
	const theme = THEMES[id] ?? THEMES[DEFAULT_THEME];
	document.documentElement.setAttribute('data-theme', theme.id);
	document.documentElement.style.colorScheme = theme.id;
	document
		.querySelector('meta[name="theme-color"]')
		?.setAttribute('content', theme.themeColor);
}
