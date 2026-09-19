import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import en from '$lib/i18n/locales/en.json';
import fr from '$lib/i18n/locales/fr.json';

// svelte-i18n renders a missing key as the key itself, so a mistyped or
// misplaced message reaches the user as literal text like
// "player.share.copied" with no error anywhere. That is exactly what
// happened when share messages were added one level higher in the file than
// the code looked for them. These tests compare the two directions.

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) walk(path, out);
		else if (/\.(ts|svelte)$/.test(path) && !path.includes('/tests/')) out.push(path);
	}
	return out;
}

function lookup(messages: Record<string, unknown>, key: string): unknown {
	return key.split('.').reduce<unknown>((node, part) => {
		if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
			return (node as Record<string, unknown>)[part];
		}
		return undefined;
	}, messages);
}

function flatten(node: unknown, prefix = '', out: string[] = []): string[] {
	if (typeof node === 'string') out.push(prefix);
	else if (node && typeof node === 'object') {
		for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
			flatten(v, prefix ? `${prefix}.${k}` : k, out);
		}
	}
	return out;
}

// Keys passed as plain string literals: $_('a.b'), t('a.b'), messageKey: 'a.b',
// notifications.error('a.b'). Dynamic keys are skipped and checked by hand.
const sources = walk('src/lib').concat(walk('src/routes'));
const referenced = new Set<string>();
for (const file of sources) {
	const text = readFileSync(file, 'utf-8');
	for (const m of text.matchAll(/\$?_\(\s*'([a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)'/g)) {
		referenced.add(m[1]);
	}
	for (const m of text.matchAll(/messageKey:\s*'([^']+)'/g)) referenced.add(m[1]);
	for (const m of text.matchAll(/notifications\.(?:error|info)\(\s*'([^']+)'/g)) referenced.add(m[1]);
}

describe('i18n keys', () => {
	it('finds keys to check (the scanner itself still works)', () => {
		expect(referenced.size).toBeGreaterThan(50);
	});

	for (const [name, messages] of Object.entries({ en, fr })) {
		it(`every key used in the app exists in ${name}`, () => {
			const missing = [...referenced]
				.filter((key) => typeof lookup(messages as Record<string, unknown>, key) !== 'string')
				.sort();
			expect(missing, `missing from ${name}.json`).toEqual([]);
		});
	}

	it('en and fr define exactly the same keys', () => {
		const a = new Set(flatten(en));
		const b = new Set(flatten(fr));
		expect([...a].filter((k) => !b.has(k)).sort(), 'in en but not fr').toEqual([]);
		expect([...b].filter((k) => !a.has(k)).sort(), 'in fr but not en').toEqual([]);
	});
});
