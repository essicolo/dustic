// Items the Internet Archive still lists but no longer serves.
//
// Why this is needed: advancedsearch.php reads a Solr index that can outlive
// the item itself. A removed or darkened item keeps its search document —
// with its formats, byte size and download count intact — while
// archive.org/metadata/<id> returns `{}`. Nothing in the search response
// distinguishes the two, so the row looks entirely playable until someone
// presses play.
//
// Verifying up front would mean one metadata request per result, 50 per page,
// to catch a rare case. Instead the app learns: the first time an item turns
// out to be gone it is remembered, and it stops appearing in results. That
// costs no extra requests and cannot hide anything that still plays, because
// an entry is only ever added after a real failure.

import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'dustic-unavailable-items';
/** Bounded so a long-lived profile cannot grow this without limit. */
const MAX_ENTRIES = 500;

function load(): string[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
	} catch {
		return [];
	}
}

function createUnavailableStore() {
	const { subscribe, set } = writable<string[]>(load());

	function persist(ids: string[]) {
		set(ids);
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
		} catch {
			// Storage full or blocked: the in-memory set still works for
			// this session, which is the case that matters most.
		}
	}

	return {
		subscribe,

		/** Record an item the archive no longer serves. Newest entries win. */
		mark(identifier: string) {
			// Track-level ids ("item#3") share the fate of their item.
			const id = identifier.split('#')[0];
			if (!id) return;
			const current = get({ subscribe });
			if (current.includes(id)) return;
			persist([...current, id].slice(-MAX_ENTRIES));
		},

		has(identifier: string): boolean {
			return get({ subscribe }).includes(identifier.split('#')[0]);
		},

		/** Drop known-dead rows from a result set. */
		filter<T extends { identifier: string }>(items: T[]): T[] {
			const known = get({ subscribe });
			if (known.length === 0) return items;
			return items.filter((item) => !known.includes(item.identifier.split('#')[0]));
		},

		clear() {
			persist([]);
		}
	};
}

export const unavailableItems = createUnavailableStore();

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * True when the archive has withheld an item rather than lost it.
 *
 * A "dark" item still exists — `archive.org/metadata/<id>` answers with
 * `is_dark: true` and even names the servers holding the data — but no
 * metadata and no files are served, and it is dropped from the search index.
 * This is what the archive does on a rights-holder or DMCA request, and it
 * can in principle be reversed, so it is worth telling apart from an item
 * that is simply gone.
 */
export function isRestrictedItemError(error: unknown): boolean {
	return /dark archive|restricted/i.test(message(error));
}

/**
 * True when the archive no longer serves an item at all, whether because it
 * was removed or because it was darkened. Either way the user cannot play
 * it, so it should stop being offered.
 *
 * Deliberately narrow: a network blip, a timeout or a 503 must not land an
 * item here, because entries are never removed automatically and marking a
 * playable item would hide it for good.
 */
export function isUnplayableItemError(error: unknown): boolean {
	return (
		/does not exist|no longer available|not found|\b404\b/i.test(message(error)) ||
		isRestrictedItemError(error)
	);
}
