import { browser } from '$app/environment';
import { init, register, locale, getLocaleFromNavigator, waitLocale } from 'svelte-i18n';

export const SUPPORTED_LOCALES = ['en', 'fr'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'en';

register('en', () => import('./locales/en.json'));
register('fr', () => import('./locales/fr.json'));

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

export async function initI18n(preferred?: string) {
	const initial = resolveLocale(preferred);
	init({
		fallbackLocale: DEFAULT_LOCALE,
		initialLocale: initial
	});
	await waitLocale(initial);
	if (browser) {
		document.documentElement.lang = initial;
	}
}

export async function setAppLocale(next: SupportedLocale) {
	await locale.set(next);
	await waitLocale(next);
	if (browser) {
		document.documentElement.lang = next;
	}
}

export { _ } from 'svelte-i18n';
