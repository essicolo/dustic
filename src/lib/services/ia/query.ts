// Internet Archive: query building, field lists and URL construction.
//
// Split out of a single 1,240-line client. This half has no dependency on a
// request being made, which is what makes it the piece worth testing on its
// own.

import type { SearchParams, SearchResult, Track, AudioQuality } from '$lib/types';
import {
	IA_BASE_URL,
	IA_SEARCH_URL,
	IA_METADATA_URL,
	IA_DOWNLOAD_URL,
	AUDIO_FORMATS,
	CONFIG
} from '$lib/utils/constants';
import { withCache } from '$lib/utils/cache';
import { isUnplayableItemError } from '$lib/stores/unavailable';
import { fetchWithRetry } from '$lib/utils/retry';
import { browser } from '$app/environment';
import { offlineStorage } from '../offlineStorage';
import { IASearchResponseSchema, IAMetadataResponseSchema } from '$lib/schemas/archive';
import type { IAMetadataResponse } from '$lib/schemas/archive';
import { requestDeduplicator } from '$lib/utils/requestDeduplication';

// Cached quality preference (Issue #9 - avoid repeated localStorage reads)
let cachedQualityPreference: AudioQuality | null = null;

// Get quality preference from settings (browser only)
export function getQualityPreference(): AudioQuality {
	if (!browser) return 'medium';

	// Use memory cache
	if (cachedQualityPreference !== null) {
		return cachedQualityPreference;
	}

	try {
		const stored = localStorage.getItem('dustic-profile');
		if (!stored) {
			cachedQualityPreference = 'medium';
			return 'medium';
		}

		const profile = JSON.parse(stored);
		const quality: AudioQuality = profile?.settings?.audioQuality || 'medium';
		cachedQualityPreference = quality;
		return quality;
	} catch {
		cachedQualityPreference = 'medium';
		return 'medium';
	}
}

// Export function to invalidate cache when settings change
export function invalidateQualityCache(): void {
	cachedQualityPreference = null;
}

/**
 * Clean a search input that might be a URL or identifier
 * Strips archive.org URLs, trims whitespace
 */
export function cleanSearchInput(input: string): string {
	let cleaned = input.trim();

	// Strip full archive.org URLs
	// Handles: https://archive.org/details/identifier, /metadata/identifier, /download/identifier
	const urlPatterns = [
		/^https?:\/\/(?:www\.)?archive\.org\/details\/([^\s/?#]+)/i,
		/^https?:\/\/(?:www\.)?archive\.org\/metadata\/([^\s/?#]+)/i,
		/^https?:\/\/(?:www\.)?archive\.org\/download\/([^\s/?#]+)/i
	];

	for (const pattern of urlPatterns) {
		const match = cleaned.match(pattern);
		if (match) {
			cleaned = match[1];
			break;
		}
	}

	// Normalize IA field syntax: fix "creator: "value"" → "creator:"value""
	// (remove space between field name colon and quoted value)
	cleaned = cleaned.replace(/\b(creator|subject|title|identifier|collection|mediatype|format):\s+"/gi, '$1:"');

	// Balance unmatched quotes to prevent IA query parser errors
	// (common during search-as-you-type: user types `"Pink Floyd"` character by character)
	const quoteCount = (cleaned.match(/"/g) || []).length;
	if (quoteCount % 2 !== 0) {
		// Remove the unmatched quote rather than adding one
		// (adding a closing quote would match wrong tokens like `"Pink AND mediatype:audio"`)
		cleaned = cleaned.replace(/"/, '');
	}

	// Escape Lucene special characters outside of quoted strings
	// e.g. Godspeed You! Black Emperor — the ! is Lucene NOT
	// Inside quotes, ! is already treated as literal by Lucene
	cleaned = cleaned.replace(/"[^"]*"/g, (match) => match.replace(/!/g, '\x00'))
		.replace(/!/g, '\\!')
		.replace(/\x00/g, '!');

	return cleaned;
}

/**
 * Check if a string looks like an Archive.org identifier
 * Identifiers: alphanumeric, hyphens, dots, underscores, no spaces
 */
/**
 * True when a query is plain words and nothing else.
 *
 * The relevance wrapping below repeats the query inside three OR'd
 * clauses, which is only safe for bare terms. With an operator in play it
 * changes what matches, not just the ranking: `jazz -live` becomes
 * `(title:(jazz -live)^4 OR ...)`, and an item whose title says "Jazz"
 * while only its description says "live" satisfies the title clause, so
 * the OR lets it through and the exclusion the user typed is lost.
 * Grouping characters are just as bad — an unbalanced `(` gets copied
 * three times into nested groups and the query stops parsing.
 *
 * Note that a hyphen inside a word ("post-rock", "hip-hop") is not an
 * exclusion: Lucene only reads it as one at the start of a term.
 */
export function isPlainTextQuery(query: string): boolean {
	if (/[():[\]{}"~^\\/*?]/.test(query)) return false; // field, group, wildcard, phrase syntax
	if (/(^|\s)[-+]\S/.test(query)) return false; // -excluded / +required terms
	if (/(^|\s)(AND|OR|NOT)(\s|$)/.test(query)) return false; // boolean operators
	return true;
}

/**
 * Wrap a plain-text query so title and creator matches rank above
 * matches buried in descriptions/transcripts. The bare clause keeps the
 * match set identical to the unboosted query (the default text field
 * already covers title/creator); only the ordering changes. Anything
 * carrying query syntax of its own is passed through untouched, since for
 * those the wrapping would change the results rather than their order.
 */
/** Fields requested from advancedsearch; enough to render a card. */
export const SEARCH_FIELDS = [
	'identifier',
	'title',
	'creator',
	'date',
	'subject',
	'format',
	'collection',
	'downloads'
] as const;

/** Map an advancedsearch document onto the Track shape the UI renders. */
export function docToTrack(doc: Record<string, any>): Track {
	const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
	const asArray = (v: unknown) => (Array.isArray(v) ? v : v ? [v] : []);

	return {
		identifier: doc.identifier,
		filename: '', // populated when fetching full metadata
		title: first(doc.title) || 'Untitled',
		artist: first(doc.creator) || 'Unknown Artist',
		date: doc.date,
		collection: asArray(doc.collection),
		genre: asArray(doc.subject).length ? asArray(doc.subject) : undefined,
		format: first(doc.format) || 'mp3',
		streamUrl: '', // populated when playing
		thumbnailUrl: getThumbnailUrl(doc.identifier),
		metadata: doc
	} as Track;
}

export function buildRelevanceQuery(query: string): string {
	const trimmed = query.trim();
	if (!trimmed || !isPlainTextQuery(trimmed)) return query;
	return `(title:(${trimmed})^4 OR creator:(${trimmed})^3 OR (${trimmed}))`;
}

export function looksLikeIdentifier(input: string): boolean {
	if (!input || input.length === 0) return false;
	// If it contains spaces, it's likely a natural language query
	if (input.includes(' ')) return false;
	// Must match typical identifier pattern
	if (!/^[a-zA-Z0-9._-]+$/.test(input)) return false;
	// Hyphenated natural-language terms (e.g. "post-rock", "hip-hop") are NOT identifiers.
	// Real identifiers typically contain digits or use dots/underscores (e.g. "gd1977-05-08.sbd")
	if (/^[a-zA-Z]+(-[a-zA-Z]+)+$/.test(input)) return false;
	// Require either a separator character (hyphen, dot, underscore) or length > 12
	// to avoid treating simple words like "jazz" as identifiers
	return /[._-]/.test(input) || input.length > 12;
}

/**
 * Try to resolve an identifier directly via the Metadata API
 * Returns a SearchResult with the item if found, or null if not
 */

export function getStreamUrl(identifier: string, filename: string): string {
	// Use /serve/ endpoint for better streaming performance
	// Falls back to /download/ if serve is not available
	const streamUrl = `https://archive.org/serve/${identifier}/${filename}`;

	// Try direct streaming first (Archive.org supports CORS)
	// The CORS proxy doesn't work on Cloudflare Pages
	console.log('[IA] Stream URL:', streamUrl);
	return streamUrl;

	// Proxy version (disabled - doesn't work on Cloudflare Pages):
	// return `/api/cors-proxy?url=${encodeURIComponent(streamUrl)}`;
}

/**
 * Get thumbnail URL for an item
 * Use higher quality version for better display on modern devices
 */
export function getThumbnailUrl(identifier: string, size: 'default' | 'large' = 'default'): string {
	// Point at the item's own thumbnail derivative rather than
	// /services/img/<id>. Both serve the same picture when one exists, but
	// they fail very differently: /services/img redirects to
	// archive.org/images/notfound.png — the Internet Archive building logo —
	// and serves it with a 200, so nothing downstream can tell "no artwork"
	// from "artwork". Every result without a cover then rendered as the same
	// black building tile. __ia_thumb.jpg simply errors instead, which lets
	// the caller draw its own fallback (see CoverFallback.svelte).
	const imageUrl = `https://archive.org/download/${identifier}/__ia_thumb.jpg`;

	// weserv proxies with CORS, resizes, and re-encodes. No `default=` here on
	// purpose: a failure has to reach the <img> onerror handler rather than
	// being papered over with a third-party placeholder image.
	return `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl)}&w=512&h=512&fit=cover&output=jpg`;
}

/**
 * Fetch full track details including playable URL (uses current quality preference)
 */
