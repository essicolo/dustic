// Unit test for the Buffer polyfill in audioMetadata.doFetch. We can't
// straightforwardly exercise music-metadata-browser here (it relies on
// strtok3 internals that don't play well with jsdom), but we CAN verify
// the polyfill mechanism itself by triggering doFetch indirectly and
// asserting that globalThis.Buffer is populated by the time the parser
// is reached. The regression we're guarding against: removing the
// polyfill block causes every WebDAV track to tombstone with
// "Buffer is not defined" for a year.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

describe('audioMetadata — Buffer polyfill', () => {
	beforeEach(() => {
		vi.resetModules();
		// Start each test with no global Buffer so we can prove the
		// polyfill installs it.
		delete (globalThis as { Buffer?: unknown }).Buffer;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('does NOT cache a tombstone when parseBuffer throws', async () => {
		// Regression: doFetch used to write `{ meta: {} }` on any failure,
		// so a library-level bug (e.g. forgetting the Buffer polyfill)
		// caused every WebDAV track to tombstone for a YEAR. After the
		// refactor, parse failures bubble up uncached and the next render
		// retries — letting a fix actually take effect.
		vi.doMock('music-metadata-browser', () => ({
			parseBuffer: vi.fn(async () => {
				throw new Error('simulated library bug');
			})
		}));
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				arrayBuffer: async () => new Uint8Array(64).buffer
			}))
		);
		vi.doMock('$lib/services/crypto', () => ({
			decryptValue: vi.fn(async () => 'pw')
		}));

		const lib = {
			id: 'lib',
			name: 'test',
			url: 'https://example.test',
			username: 'u',
			password: 'p',
			rootPath: '/'
		} as unknown as Parameters<
			Awaited<ReturnType<typeof import('$lib/services/audioMetadata')['fetchAudioMetadata']>>
		>[1];

		const { fetchAudioMetadata } = await import('$lib/services/audioMetadata');
		const first = await fetchAudioMetadata('wd:test:transient', lib, '/track.mp3');
		const second = await fetchAudioMetadata('wd:test:transient', lib, '/track.mp3');
		expect(first).toBeNull();
		expect(second).toBeNull();
		// Both calls hit fetchHead — no tombstone was written, so the
		// second call ran through doFetch again instead of short-circuiting
		// on a cached miss. (1 PROPFIND per fetchAudioMetadata call.)
		expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
	});

	it('caps concurrent fetchHead calls so we do not flood the webdav-proxy', async () => {
		// Regression: opening a 26-track folder fired 26 parallel POSTs to
		// /api/webdav-proxy at once. Even when the audio metadata path
		// could survive that, the upstream Koofr/proxy combo started
		// returning NetworkErrors mid-burst. We cap concurrency at 4.
		let inFlight = 0;
		let peak = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				inFlight++;
				peak = Math.max(peak, inFlight);
				// Hold the slot long enough for several requests to pile up
				// behind the semaphore.
				await new Promise((r) => setTimeout(r, 20));
				inFlight--;
				return {
					ok: true,
					arrayBuffer: async () => new Uint8Array(64).buffer
				};
			})
		);
		vi.doMock('music-metadata-browser', () => ({
			parseBuffer: vi.fn(async () => ({ common: {} }))
		}));
		vi.doMock('$lib/services/crypto', () => ({
			decryptValue: vi.fn(async () => 'pw')
		}));

		const lib = {
			id: 'lib',
			name: 'test',
			url: 'https://example.test',
			username: 'u',
			password: 'p',
			rootPath: '/'
		} as unknown as Parameters<
			Awaited<ReturnType<typeof import('$lib/services/audioMetadata')['fetchAudioMetadata']>>
		>[1];

		const { fetchAudioMetadata } = await import('$lib/services/audioMetadata');
		const ids = Array.from({ length: 12 }, (_, i) => `wd:test:bulk:${i}`);
		await Promise.all(ids.map((id) => fetchAudioMetadata(id, lib, `/t-${id}.mp3`)));

		expect(peak, `peak in-flight was ${peak}, expected ≤ 4`).toBeLessThanOrEqual(4);
		// And all 12 actually got through — the cap throttles, doesn't drop.
		expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(12);
	});

	it('installs globalThis.Buffer before invoking parseBuffer', async () => {
		// Mock music-metadata-browser so we can observe what global state
		// existed when parseBuffer was called — without actually parsing.
		let bufferAtParseTime: unknown = undefined;
		vi.doMock('music-metadata-browser', () => ({
			parseBuffer: vi.fn(async () => {
				bufferAtParseTime = (globalThis as { Buffer?: unknown }).Buffer;
				return { common: {} };
			})
		}));

		// Stub fetch so fetchHead returns a non-empty buffer.
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				arrayBuffer: async () => new Uint8Array(64).buffer
			}))
		);

		// Stub the crypto helper (audioMetadata imports it for password
		// decryption — irrelevant to this assertion, just must not throw).
		vi.doMock('$lib/services/crypto', () => ({
			decryptValue: vi.fn(async () => 'pw')
		}));

		expect((globalThis as { Buffer?: unknown }).Buffer).toBeUndefined();

		const { fetchAudioMetadata } = await import('$lib/services/audioMetadata');
		await fetchAudioMetadata('wd:test:1', {
			id: 'lib',
			name: 'test',
			url: 'https://example.test',
			username: 'u',
			password: 'p',
			rootPath: '/'
		} as unknown as Parameters<typeof fetchAudioMetadata>[1], '/track.mp3');

		// Polyfill was installed before parseBuffer ran.
		expect(bufferAtParseTime).toBeDefined();
		// And it persists on globalThis after doFetch returns.
		expect((globalThis as { Buffer?: unknown }).Buffer).toBeDefined();
	});
});
