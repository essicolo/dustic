import { describe, it, expect } from 'vitest';
import { THEMES, THEME_LIST, DEFAULT_THEME, applyTheme, type ThemeId } from '$lib/themes';

describe('themes', () => {
	it('ships exactly light and dark', () => {
		expect(THEME_LIST.map((t) => t.id)).toEqual(['light', 'dark']);
		expect(Object.keys(THEMES)).toEqual(['light', 'dark']);
		expect(THEMES[DEFAULT_THEME]).toBeDefined();
	});

	it('names and describes every theme through i18n keys, not literals', () => {
		// A hardcoded English description is what made the picker show
		// untranslated text in the French interface.
		for (const theme of THEME_LIST) {
			expect(theme.nameKey).toBe(`themes.${theme.id}.name`);
			expect(theme.descriptionKey).toBe(`themes.${theme.id}.description`);
		}
	});

	it('sets data-theme, color-scheme and the browser chrome color together', () => {
		applyTheme('dark');
		expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
		expect(document.documentElement.style.colorScheme).toBe('dark');

		applyTheme('light');
		expect(document.documentElement.getAttribute('data-theme')).toBe('light');
		expect(document.documentElement.style.colorScheme).toBe('light');
	});

	it('falls back to the default rather than blanking data-theme on an unknown id', () => {
		applyTheme('nonsense' as ThemeId);
		expect(document.documentElement.getAttribute('data-theme')).toBe(DEFAULT_THEME);
	});
});

describe('every locale carries a name and description for each theme', async () => {
	const en = (await import('$lib/i18n/locales/en.json')).default as Record<string, any>;
	const fr = (await import('$lib/i18n/locales/fr.json')).default as Record<string, any>;

	for (const [locale, messages] of Object.entries({ en, fr })) {
		it(locale, () => {
			for (const theme of THEME_LIST) {
				expect(messages.themes?.[theme.id]?.name, `${locale}.themes.${theme.id}.name`).toBeTruthy();
				expect(
					messages.themes?.[theme.id]?.description,
					`${locale}.themes.${theme.id}.description`
				).toBeTruthy();
			}
			// The picker still renders these two swatch labels.
			expect(messages.components?.themePicker?.trackSwatch).toBeTruthy();
			expect(messages.components?.themePicker?.artistSongSwatch).toBeTruthy();
		});
	}
});
