// Theme presets for Dustic (Change 5).
//
// Each preset corresponds to a daisyUI theme defined in tailwind.config.js.
// Switching themes = setting `data-theme="<id>"` on <html>; daisyUI rebinds
// its CSS variables (--p, --b1, --bc, …) and the entire app recolors.
// We also keep a small set of meta variables (--card-radius, --shadow) for
// rules that depend on theme aesthetics rather than colors.

export type ThemeId = 'dustic' | 'sunset' | 'bubblegum' | 'forest' | 'midnight';

export interface Theme {
	id: ThemeId;
	name: string;
	description: string;
	// Meta vars layered on top of daisyUI for shape/shadow tweaks.
	meta: { '--card-radius': string; '--shadow': string };
	// Tile preview colors used by the picker (read from the daisyUI palette
	// so what you see in the picker matches what the theme will look like).
	preview: { bg: string; fg: string; muted: string; accent: string; accentFg: string };
}

const DUSTIC: Theme = {
	id: 'dustic',
	name: 'Minimal',
	description: 'Pure monochrome. Sharp corners, no accent color.',
	meta: { '--card-radius': '4px', '--shadow': 'none' },
	preview: {
		bg: '#ffffff',
		fg: '#000000',
		muted: '#525252',
		accent: '#000000',
		accentFg: '#ffffff'
	}
};

const SUNSET: Theme = {
	id: 'sunset',
	name: 'Sunset',
	description: 'Cream paper, warm dark text, terracotta accent.',
	meta: {
		'--card-radius': '12px',
		'--shadow': '0 2px 6px -2px rgba(0, 0, 0, 0.08)'
	},
	preview: {
		bg: '#FAF6F0',
		fg: '#1F1B16',
		muted: '#6B5F50',
		accent: '#C75B39',
		accentFg: '#FFFFFF'
	}
};

const BUBBLEGUM: Theme = {
	id: 'bubblegum',
	name: 'Bubblegum',
	description: 'White canvas with a hot-pink kick.',
	meta: {
		'--card-radius': '16px',
		'--shadow': '0 2px 8px -2px rgba(0, 0, 0, 0.06)'
	},
	preview: {
		bg: '#FFFFFF',
		fg: '#1A1A1F',
		muted: '#6B6B75',
		accent: '#FF4D8D',
		accentFg: '#FFFFFF'
	}
};

const FOREST: Theme = {
	id: 'forest',
	name: 'Forest',
	description: 'Deep green bed, cream type, sage highlights.',
	meta: {
		'--card-radius': '8px',
		'--shadow': '0 2px 8px -2px rgba(0, 0, 0, 0.35)'
	},
	preview: {
		bg: '#1A2E1F',
		fg: '#F0EDE5',
		muted: '#A8B5A8',
		accent: '#8FB996',
		accentFg: '#1A2E1F'
	}
};

const MIDNIGHT: Theme = {
	id: 'midnight',
	name: 'Midnight',
	description: 'Near-black backdrop, pale text, electric violet.',
	meta: {
		'--card-radius': '12px',
		'--shadow': '0 2px 10px -2px rgba(0, 0, 0, 0.5)'
	},
	preview: {
		bg: '#0F0F14',
		fg: '#E8E6F0',
		muted: '#9B98B0',
		accent: '#9B6DFF',
		accentFg: '#FFFFFF'
	}
};

export const THEMES: Record<ThemeId, Theme> = {
	dustic: DUSTIC,
	sunset: SUNSET,
	bubblegum: BUBBLEGUM,
	forest: FOREST,
	midnight: MIDNIGHT
};

export const THEME_LIST: Theme[] = [DUSTIC, SUNSET, BUBBLEGUM, FOREST, MIDNIGHT];

export const DEFAULT_THEME: ThemeId = 'dustic';

/**
 * Apply a theme to the document. Sets `data-theme` (daisyUI does the
 * heavy lifting) plus a couple of meta vars for shape/shadow.
 */
export function applyTheme(id: ThemeId): void {
	if (typeof document === 'undefined') return;
	const theme = THEMES[id] ?? THEMES[DEFAULT_THEME];
	const root = document.documentElement;
	root.setAttribute('data-theme', theme.id);
	for (const [key, value] of Object.entries(theme.meta)) {
		root.style.setProperty(key, value);
	}
}
