// WebDAV personal-library adapter.
//
// Lists folders/files via PROPFIND through the same-origin proxy
// (`/api/webdav-proxy`), builds Track objects with a streamUrl that points
// back to the proxy. Playback is implemented by fetching the full file
// through the proxy (POST with credentials in JSON body) and feeding the
// audio element a blob URL — the same path used by the offline download
// pipeline, so credentials never leak into `<audio src>` or the URL bar.

import type { Track, WebDAVLibrary } from '$lib/types';
import { browser } from '$app/environment';
import { decryptValue } from './crypto';

const AUDIO_EXTENSIONS = ['mp3', 'flac', 'ogg', 'opus', 'm4a', 'aac', 'wav', 'wma'];

export interface WebDAVEntry {
	type: 'folder' | 'file';
	name: string; // basename
	path: string; // absolute path on the WebDAV server (decoded)
	size?: number; // bytes (files only)
	lastModified?: string;
	contentType?: string;
}

/**
 * Encode a library + path into a Track identifier.
 * Format: `wd:<libraryId>:<base64url(path)>`
 */
export function encodeIdentifier(libraryId: string, path: string): string {
	return `wd:${libraryId}:${b64urlEncode(path)}`;
}

/**
 * Decode a WebDAV identifier. Returns null if the identifier isn't a
 * WebDAV one OR if it's malformed (missing libraryId, empty path,
 * un-decodable payload). Malformed-but-prefixed inputs used to silently
 * return { libraryId: '', path: '' } and confuse callers downstream.
 */
export function decodeIdentifier(identifier: string): { libraryId: string; path: string } | null {
	if (!identifier.startsWith('wd:')) return null;
	const rest = identifier.slice(3);
	const sep = rest.indexOf(':');
	if (sep <= 0) return null; // missing libraryId
	const libraryId = rest.slice(0, sep);
	const encodedPath = rest.slice(sep + 1);
	if (!encodedPath) return null;
	let path: string;
	try {
		path = b64urlDecode(encodedPath);
	} catch {
		return null;
	}
	if (!path) return null;
	return { libraryId, path };
}

export function isWebDAVTrack(identifier: string): boolean {
	return identifier.startsWith('wd:');
}

/**
 * Test the credentials/URL of a library by issuing a PROPFIND Depth: 0.
 */
export async function testLibrary(library: WebDAVLibrary): Promise<{ ok: boolean; error?: string }> {
	if (!browser) return { ok: false, error: 'Not in browser' };
	try {
		// Folder PROPFIND requires a trailing slash on some servers (Koofr is
		// strict; pCloud is lenient). Always ensure it.
		const targetUrl = withTrailingSlash(buildTargetUrl(library, library.rootPath || '/'));
		// Try PROPFIND first; some servers (pCloud) reject PROPFIND but accept
		// OPTIONS for an auth probe.
		let response = await proxiedFetch(library, targetUrl, 'PROPFIND', {
			Depth: '0',
			'Content-Type': 'application/xml'
		});
		if (response.status === 405 || response.status === 501) {
			// Method not supported on this server — fall back to OPTIONS for the probe.
			response = await proxiedFetch(library, targetUrl, 'OPTIONS');
		}
		if (!response.ok) {
			let bodyHint = '';
			try {
				const text = (await response.text()).slice(0, 200);
				if (text) bodyHint = ` — ${text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`;
			} catch { /* ignore */ }
			return {
				ok: false,
				error: `${response.status} ${response.statusText} on ${targetUrl}${bodyHint}`
			};
		}
		return { ok: true };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
	}
}

/**
 * List the contents of a folder inside the library.
 * `path` is relative to the library's `rootPath`.
 */
export async function listFolder(
	library: WebDAVLibrary,
	relativePath: string
): Promise<WebDAVEntry[]> {
	if (!browser) return [];

	const absolutePath = joinPath(library.rootPath || '/', relativePath);
	const targetUrl = withTrailingSlash(buildTargetUrl(library, absolutePath));

	const response = await proxiedFetch(library, targetUrl, 'PROPFIND', {
		Depth: '1',
		'Content-Type': 'application/xml'
	});

	if (!response.ok) {
		let bodyHint = '';
		try {
			const text = (await response.text()).slice(0, 200);
			if (text) bodyHint = ` — ${text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`;
		} catch { /* ignore */ }
		throw new Error(`PROPFIND failed: ${response.status} ${response.statusText} on ${targetUrl}${bodyHint}`);
	}

	const xml = await response.text();
	return parsePropfind(xml, absolutePath, libraryUrlPathname(library));
}

/** Pathname portion of the library URL (e.g. `/dav/Koofr`), without trailing slash. */
function libraryUrlPathname(library: WebDAVLibrary): string {
	try {
		return new URL(library.url).pathname.replace(/\/+$/, '');
	} catch {
		return '';
	}
}

/**
 * Build a Track object for a WebDAV audio file. Stream URL is a marker;
 * actual playback is performed via {@link fetchTrackBlob} which goes through
 * the POST proxy.
 */
export function buildTrack(library: WebDAVLibrary, entry: WebDAVEntry): Track {
	const { artist, title, album } = parseFilenameHeuristics(entry.name);
	const ext = (entry.name.split('.').pop() || 'mp3').toLowerCase();
	const identifier = encodeIdentifier(library.id, entry.path);

	// Use the parent folder as a fallback for album when filename doesn't
	// carry that info, and as a meaningful fallback for artist when the
	// filename has no "Artist - Title" structure. "01 Lyra.ogg" inside
	// "/Music/MoonAlbum/" becomes album="MoonAlbum" → far more useful than
	// "Unknown Artist".
	const parts = entry.path.split('/').filter(Boolean);
	const parentFolder = parts.length >= 2 ? parts[parts.length - 2] : '';
	const resolvedAlbum = album || parentFolder || undefined;

	return {
		identifier,
		filename: entry.name,
		title: title || entry.name.replace(/\.[^.]+$/, ''),
		artist: artist || parentFolder || 'Unknown Artist',
		album: resolvedAlbum,
		collection: [library.name],
		format: ext,
		// Marker URL: same-origin so Cache API accepts it, but never actually
		// fetched. Player.ts intercepts on `source === 'webdav'`.
		streamUrl: `/webdav-track/${encodeURIComponent(identifier)}`,
		source: 'webdav',
		metadata: {
			webdavPath: entry.path,
			webdavLibraryId: library.id,
			size: entry.size,
			lastModified: entry.lastModified
		}
	};
}

/**
 * Fetch a track's full audio body as a Blob via the proxy.
 * Reports download progress in 0..100.
 */
export async function fetchTrackBlob(
	library: WebDAVLibrary,
	path: string,
	onProgress?: (pct: number) => void
): Promise<Blob> {
	const targetUrl = buildTargetUrl(library, path);
	const response = await proxiedFetch(library, targetUrl, 'GET');
	if (!response.ok) throw new Error(`Download failed: ${response.status}`);

	const total = parseInt(response.headers.get('Content-Length') || '0', 10);
	const reader = response.body?.getReader();
	if (!reader) return await response.blob();

	const chunks: Uint8Array[] = [];
	let received = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		received += value.length;
		if (onProgress && total) onProgress((received / total) * 100);
	}

	const mime = response.headers.get('Content-Type') || 'audio/mpeg';
	return new Blob(chunks as any[], { type: mime });
}

/**
 * Find a library by id from a list (typically settings.webdavLibraries).
 */
export function findLibrary(libraries: WebDAVLibrary[], id: string): WebDAVLibrary | undefined {
	return libraries.find((l) => l.id === id);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function withTrailingSlash(url: string): string {
	return url.endsWith('/') ? url : url + '/';
}

function buildTargetUrl(library: WebDAVLibrary, absolutePath: string): string {
	const base = library.url.replace(/\/+$/, '');
	const path = absolutePath.startsWith('/') ? absolutePath : `/${absolutePath}`;
	// Encode each path segment to handle spaces and special chars
	const encoded = path
		.split('/')
		.map((seg) => (seg ? encodeURIComponent(seg) : ''))
		.join('/');
	return `${base}${encoded}`;
}

async function proxiedFetch(
	library: WebDAVLibrary,
	targetUrl: string,
	method: string,
	extraHeaders?: Record<string, string>,
	body?: string
): Promise<Response> {
	const password = await decryptValue(library.password);
	const headers: Record<string, string> = {
		Authorization: 'Basic ' + utf8Btoa(`${library.username}:${password}`),
		...(extraHeaders || {})
	};
	return fetch('/api/webdav-proxy', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ url: targetUrl, method, headers, body })
	});
}

// btoa() throws on non-Latin1 characters; encode UTF-8 first so passwords
// with accents work.
function utf8Btoa(str: string): string {
	const bytes = new TextEncoder().encode(str);
	let bin = '';
	for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
	return btoa(bin);
}

function joinPath(a: string, b: string): string {
	const left = a.replace(/\/+$/, '') || '/';
	const right = b.replace(/^\/+/, '');
	if (!right) return left || '/';
	return left === '/' ? `/${right}` : `${left}/${right}`;
}

function b64urlEncode(s: string): string {
	const bytes = new TextEncoder().encode(s);
	let bin = '';
	bytes.forEach((b) => (bin += String.fromCharCode(b)));
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
	const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
	const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return new TextDecoder().decode(bytes);
}

/**
 * Parse a WebDAV PROPFIND XML response into entries. The first response
 * (the target itself) is skipped; only children are returned.
 *
 * `urlPathPrefix` is the pathname portion of the library's base URL
 * (e.g. `/dav/Koofr`). Servers like Koofr return server-absolute hrefs
 * (`/dav/Koofr/Musique/foo`), which we strip down to library-relative
 * paths (`/Musique/foo`) so we can navigate them without double-counting
 * the prefix on subsequent requests.
 */
export function parsePropfind(
	xml: string,
	parentPath: string,
	urlPathPrefix: string = ''
): WebDAVEntry[] {
	const responses = extractResponses(xml);
	const entries: WebDAVEntry[] = [];
	const parentNormalized = normalizePath(parentPath);
	const prefix = urlPathPrefix.replace(/\/+$/, '');

	for (const r of responses) {
		// 1. XML decode (Koofr writes `&` as `&amp;` in hrefs).
		// 2. URL decode (`%20` → space, etc.).
		// Order matters — XML wraps URL-encoded content, so XML-decode outermost.
		const hrefXmlDecoded = decodeXmlEntities(r.href);
		const hrefUrlDecoded = decodeURIComponent(hrefXmlDecoded);
		let path = stripHost(hrefUrlDecoded);
		// Strip the library URL's pathname so paths are relative to the library.
		if (prefix && path.startsWith(prefix)) {
			path = path.slice(prefix.length) || '/';
		}
		const normalized = normalizePath(path);

		// Skip the parent folder itself
		if (normalized === parentNormalized) continue;

		const isCollection = r.isCollection;
		const name = basename(normalized);
		if (!name) continue;

		if (isCollection) {
			entries.push({ type: 'folder', name, path: normalized });
		} else {
			const ext = (name.split('.').pop() || '').toLowerCase();
			if (!AUDIO_EXTENSIONS.includes(ext)) continue;
			entries.push({
				type: 'file',
				name,
				path: normalized,
				size: r.size,
				lastModified: r.lastModified,
				contentType: r.contentType
			});
		}
	}

	// Folders first, then files; both alphabetical
	entries.sort((a, b) => {
		if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
		return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
	});
	return entries;
}

interface RawResponse {
	href: string;
	isCollection: boolean;
	size?: number;
	lastModified?: string;
	contentType?: string;
}

function extractResponses(xml: string): RawResponse[] {
	// Strip namespace prefixes so we can match plain tag names. WebDAV servers
	// vary wildly in how they prefix `D:`, `d:`, or no prefix at all.
	const stripped = xml.replace(/<\/?[a-zA-Z0-9]+:/g, (m) => (m.startsWith('</') ? '</' : '<'));

	const out: RawResponse[] = [];
	const responseRe = /<response\b[^>]*>([\s\S]*?)<\/response>/gi;
	let match: RegExpExecArray | null;
	while ((match = responseRe.exec(stripped)) !== null) {
		const block = match[1];
		const href = (block.match(/<href\b[^>]*>([\s\S]*?)<\/href>/i)?.[1] || '').trim();
		if (!href) continue;
		const isCollection = /<resourcetype\b[^>]*>[\s\S]*?<collection\b/i.test(block);
		const size = parseInt(
			block.match(/<getcontentlength\b[^>]*>([\s\S]*?)<\/getcontentlength>/i)?.[1] || '0',
			10
		);
		const lastModified = (
			block.match(/<getlastmodified\b[^>]*>([\s\S]*?)<\/getlastmodified>/i)?.[1] || ''
		).trim();
		const contentType = (
			block.match(/<getcontenttype\b[^>]*>([\s\S]*?)<\/getcontenttype>/i)?.[1] || ''
		).trim();
		out.push({
			href,
			isCollection,
			size: size > 0 ? size : undefined,
			lastModified: lastModified || undefined,
			contentType: contentType || undefined
		});
	}
	return out;
}

function decodeXmlEntities(s: string): string {
	return s
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

function stripHost(href: string): string {
	// PROPFIND hrefs may be absolute URLs or absolute paths
	if (/^https?:\/\//i.test(href)) {
		try {
			return new URL(href).pathname;
		} catch {
			return href;
		}
	}
	return href;
}

function normalizePath(p: string): string {
	let out = p || '/';
	if (!out.startsWith('/')) out = '/' + out;
	out = out.replace(/\/+/g, '/');
	if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
	return out;
}

function basename(p: string): string {
	const parts = p.split('/').filter(Boolean);
	return parts[parts.length - 1] || '';
}

/**
 * Heuristic parse of a filename: "Artist - Title.mp3" → { artist, title }.
 * Falls back gracefully for files with no dash or unusual structure.
 */
export function parseFilenameHeuristics(name: string): {
	artist?: string;
	title?: string;
	album?: string;
} {
	const stem = name.replace(/\.[^.]+$/, '');
	// Strip leading track number: "01 - " or "01. " or "1 "
	const noNum = stem.replace(/^\s*\d{1,3}\s*[-_.)\s]\s*/, '');
	const parts = noNum.split(/\s+-\s+/);
	if (parts.length >= 2) {
		return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
	}
	return { title: noNum.trim() };
}
