import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';
import { theme } from '$lib/stores/theme';

// The palette used to ship five themes. Anyone who picked one before the
// change still has that id in localStorage or in a WebDAV-synced profile,
// so each has to land on a mode that still exists.
const RETIRED: ReadonlyArray<readonly [string, string]> = [
	['minimal', 'light'],
	['dustic', 'light'],
	['sunset', 'light'],
	['bubblegum', 'light'],
	['forest', 'dark'],
	['midnight', 'dark']
];

describe('legacy theme ids', () => {
	it('maps every retired id onto a mode that still exists', () => {
		for (const [legacy, expected] of RETIRED) {
			theme.syncFromProfile(legacy);
			expect(get(theme), legacy).toBe(expected);
		}
	});

	it('ignores an unknown id rather than blanking the theme', () => {
		theme.syncFromProfile('light');
		theme.syncFromProfile('chartreuse');
		expect(get(theme)).toBe('light');
	});
});

describe('the pre-paint script in app.html', () => {
	const html = readFileSync('src/app.html', 'utf-8');

	// This script resolves the theme before hydration so a dark-mode device
	// is not flashed a white app. It necessarily repeats the mapping above,
	// and if the two drift the flash comes back for exactly the users who
	// had picked a retired theme.
	it('repeats the same legacy mapping the store uses', () => {
		for (const [legacy, expected] of RETIRED) {
			expect(html, legacy).toMatch(new RegExp(`${legacy}:\\s*"${expected}"`));
		}
	});

	it('consults the same storage key and honours the system preference', () => {
		expect(html).toContain('dustic-theme');
		expect(html).toContain('prefers-color-scheme: dark');
	});
});
