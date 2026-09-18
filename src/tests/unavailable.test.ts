import { describe, it, expect, beforeEach } from 'vitest';
import {
	unavailableItems,
	isUnplayableItemError,
	isRestrictedItemError
} from '$lib/stores/unavailable';

describe('isUnplayableItemError', () => {
	it('recognises the archive saying an item is gone', () => {
		// This is the exact message getItemMetadata throws.
		expect(
			isUnplayableItemError(new Error('Item "20120209SR01SmellsLikeTeenSpirit" does not exist on Internet Archive.'))
		).toBe(true);
		expect(isUnplayableItemError(new Error('HTTP 404 Not Found'))).toBe(true);
	});

	it('recognises a darkened item', () => {
		// A dark item is withheld rather than deleted: metadata answers with
		// is_dark: true and no files, and it is dropped from the search index.
		// The user still cannot play it, so it belongs in the same set — and
		// the wording shares no phrase with the "does not exist" message, so
		// it has to be matched explicitly.
		const darkened = new Error(
			'Item "animals_202412" is restricted (dark archive). It has been made unavailable.'
		);
		expect(isUnplayableItemError(darkened)).toBe(true);
		expect(isRestrictedItemError(darkened)).toBe(true);
	});

	it('tells a darkened item apart from a deleted one, so the message can differ', () => {
		expect(
			isRestrictedItemError(new Error('Item "x" does not exist on Internet Archive.'))
		).toBe(false);
	});

	it('does not mistake a transient failure for a missing item', () => {
		// Marking an item dead on a network blip would hide music that plays.
		for (const message of [
			'Network error',
			'Too many requests',
			'The operation was aborted',
			'HTTP 503 Service Unavailable',
			'timeout of 30000ms exceeded'
		]) {
			expect(isUnplayableItemError(new Error(message)), message).toBe(false);
			expect(isRestrictedItemError(new Error(message)), message).toBe(false);
		}
	});
});

describe('unavailableItems', () => {
	beforeEach(() => unavailableItems.clear());

	it('remembers an item and filters it out of later results', () => {
		const results = [{ identifier: 'alive' }, { identifier: 'gone' }, { identifier: 'also-alive' }];
		expect(unavailableItems.filter(results)).toHaveLength(3);

		unavailableItems.mark('gone');

		expect(unavailableItems.filter(results).map((r) => r.identifier)).toEqual([
			'alive',
			'also-alive'
		]);
	});

	it('treats a track id as belonging to its item', () => {
		// A favourite or queue entry is "item#3"; if the item is gone, so is
		// every track in it.
		unavailableItems.mark('dead-album#3');
		expect(unavailableItems.has('dead-album')).toBe(true);
		expect(unavailableItems.has('dead-album#7')).toBe(true);
		expect(unavailableItems.filter([{ identifier: 'dead-album#1' }])).toEqual([]);
	});

	it('is idempotent', () => {
		unavailableItems.mark('x');
		unavailableItems.mark('x');
		expect(unavailableItems.filter([{ identifier: 'x' }, { identifier: 'y' }])).toHaveLength(1);
	});

	it('ignores an empty identifier', () => {
		unavailableItems.mark('');
		expect(unavailableItems.has('anything')).toBe(false);
	});

	it('returns the original array untouched when nothing is known', () => {
		const results = [{ identifier: 'a' }, { identifier: 'b' }];
		expect(unavailableItems.filter(results)).toBe(results);
	});

	it('stays bounded so a long-lived profile cannot grow without limit', () => {
		for (let i = 0; i < 600; i++) unavailableItems.mark(`item-${i}`);
		const survivors = unavailableItems.filter(
			Array.from({ length: 600 }, (_, i) => ({ identifier: `item-${i}` }))
		);
		// 500 entries kept, newest first, so 100 of the oldest are forgotten.
		expect(survivors).toHaveLength(100);
		expect(unavailableItems.has('item-599')).toBe(true);
		expect(unavailableItems.has('item-0')).toBe(false);
	});
});
