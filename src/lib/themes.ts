// Theme presets for Inde (Change 5).
//
// Each preset is a set of CSS custom properties applied on `:root`.
// Adding a new theme = adding an entry to `THEMES`; the picker and Settings
// UI iterate this map.

export type ThemeId = 'minimal' | 'sunset' | 'bubblegum' | 'forest' | 'midnight';

export interface Theme {
	id: ThemeId;
	name: string;
	description: string;
	// CSS variables applied to :root
	vars: Record<string, string>;
	// Maps to a daisyUI theme name so DaisyUI components also recolor cleanly.
	daisy: 'inde' | 'corporate' | 'dark' | 'cupcake' | 'forest' | 'dracula';
}

// Pure monochrome — the original Inde aesthetic. Zero color, zero radius.
const MINIMAL: Theme = {
	id: 'minimal',
	name: 'Minimal',
	description: 'Pure monochrome. Sharp corners, no accent color.',
	daisy: 'inde',
	vars: {
		'--bg': '#ffffff',
		'--bg-elevated': '#f5f5f5',
		'--fg': '#000000',
		'--fg-muted': '#525252',
		'--accent': '#000000',
		'--accent-fg': '#ffffff',
		'--card-radius': '4px',
		'--shadow': 'none'
	}
};

const SUNSET: Theme = {
	id: 'sunset',
	name: 'Sunset',
	description: 'Cream paper, warm dark text, terracotta accent.',
	daisy: 'cupcake',
	vars: {
		'--bg': '#FAF6F0',
		'--bg-elevated': '#F0EAE0',
		'--fg': '#1F1B16',
		'--fg-muted': '#6B5F50',
		'--accent': '#C75B39',
		'--accent-fg': '#FFFFFF',
		'--card-radius': '12px',
		'--shadow': '0 4px 12px -2px rgba(31, 27, 22, 0.08)'
	}
};

const BUBBLEGUM: Theme = {
	id: 'bubblegum',
	name: 'Bubblegum',
	description: 'White canvas with a hot-pink kick.',
	daisy: 'corporate',
	vars: {
		'--bg': '#FFFFFF',
		'--bg-elevated': '#FAFAFB',
		'--fg': '#1A1A1F',
		'--fg-muted': '#6B6B75',
		'--accent': '#FF4D8D',
		'--accent-fg': '#FFFFFF',
		'--card-radius': '16px',
		'--shadow': '0 4px 16px -4px rgba(255, 77, 141, 0.18)'
	}
};

const FOREST: Theme = {
	id: 'forest',
	name: 'Forest',
	description: 'Deep green bed, cream type, sage highlights.',
	daisy: 'forest',
	vars: {
		'--bg': '#1A2E1F',
		'--bg-elevated': '#243B29',
		'--fg': '#F0EDE5',
		'--fg-muted': '#A8B5A8',
		'--accent': '#8FB996',
		'--accent-fg': '#1A2E1F',
		'--card-radius': '8px',
		'--shadow': '0 6px 18px -6px rgba(0, 0, 0, 0.45)'
	}
};

const MIDNIGHT: Theme = {
	id: 'midnight',
	name: 'Midnight',
	description: 'Near-black backdrop, pale text, electric violet.',
	daisy: 'dracula',
	vars: {
		'--bg': '#0F0F14',
		'--bg-elevated': '#1A1A22',
		'--fg': '#E8E6F0',
		'--fg-muted': '#9B98B0',
		'--accent': '#9B6DFF',
		'--accent-fg': '#FFFFFF',
		'--card-radius': '12px',
		'--shadow': '0 6px 20px -6px rgba(155, 109, 255, 0.25)'
	}
};

export const THEMES: Record<ThemeId, Theme> = {
	minimal: MINIMAL,
	sunset: SUNSET,
	bubblegum: BUBBLEGUM,
	forest: FOREST,
	midnight: MIDNIGHT
};

export const THEME_LIST: Theme[] = [MINIMAL, SUNSET, BUBBLEGUM, FOREST, MIDNIGHT];

export const DEFAULT_THEME: ThemeId = 'minimal';

/**
 * Apply a theme to the document by setting CSS variables on :root and the
 * `data-theme` attribute on <html> (which daisyUI reads).
 */
export function applyTheme(id: ThemeId): void {
	if (typeof document === 'undefined') return;
	const theme = THEMES[id] ?? THEMES[DEFAULT_THEME];
	const root = document.documentElement;
	for (const [key, value] of Object.entries(theme.vars)) {
		root.style.setProperty(key, value);
	}
	root.setAttribute('data-theme', theme.daisy);
	root.setAttribute('data-inde-theme', theme.id);
}
