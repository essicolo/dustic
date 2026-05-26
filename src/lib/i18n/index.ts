import { browser } from '$app/environment';
import { init, addMessages, locale, getLocaleFromNavigator } from 'svelte-i18n';
import en from './locales/en.json';
import fr from './locales/fr.json';

export const SUPPORTED_LOCALES = ['en', 'fr'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'en';

// Static imports (not `register` + lazy `import()`) so messages are present
// before the first render. `register` defers `locale.set` until the dynamic
// import resolves, which leaves `$locale` null mid-hydration and makes
// `$_(...)` throw "Cannot format a message without first setting the
// initial locale". Each dictionary is ~30 KB — negligible at this scale.
addMessages('en', en);
addMessages('fr', fr);

export function resolveLocale(preferred: string | undefined): SupportedLocale {
	if (preferred && (SUPPORTED_LOCALES as readonly string[]).includes(preferred)) {
		return preferred as SupportedLocale;
	}
	const nav = browser ? getLocaleFromNavigator() : null;
	if (nav) {
		const base = nav.toLowerCase().split('-')[0];
		if ((SUPPORTED_LOCALES as readonly string[]).includes(base)) {
			return base as SupportedLocale;
		}
	}
	return DEFAULT_LOCALE;
}

export function initI18n(preferred?: string) {
	const initial = resolveLocale(preferred);
	init({
		fallbackLocale: DEFAULT_LOCALE,
		initialLocale: initial
	});
	if (browser) {
		document.documentElement.lang = initial;
	}
}

export async function setAppLocale(next: SupportedLocale) {
	await locale.set(next);
	if (browser) {
		document.documentElement.lang = next;
	}
}

export { _ } from 'svelte-i18n';
