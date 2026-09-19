import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CONTENT_TYPES } from '$lib/utils/constants';

// The Music tab used to search a whitelist of audio_music/etree/78rpm. The
// archive has no single music collection, and most recordings sit elsewhere:
// measured against the live API, that whitelist returned *zero* results for
// Tori Amos, Explosions in the Sky, Godspeed You! Black Emperor and Nick
// Drake, whose recordings live in hifidelity, opensource_audio and
// roiocollection. Music is now "audio that is not spoken word", which keeps
// 94-97% of matches.

describe('content types', () => {
	it('defines Music by exclusion, not by a whitelist', () => {
		const music = CONTENT_TYPES.find((t) => t.id === 'music')!;
		expect(music.iaCollections).toEqual([]);
		expect(music.iaExcludeCollections).toEqual([
			'librivoxaudio',
			'audio_podcast',
			'radioprograms'
		]);
	});

	it('keeps the spoken-word types on precise whitelists', () => {
		// These are narrow and accurate, and each excluded collection must be
		// claimed by a type — otherwise Music would exclude something nothing
		// else searches, and it would be unreachable from any tab.
		const music = CONTENT_TYPES.find((t) => t.id === 'music')!;
		const claimed = CONTENT_TYPES.flatMap((t) => t.iaCollections);
		for (const excluded of music.iaExcludeCollections ?? []) {
			expect(claimed, `${excluded} is excluded but no tab searches it`).toContain(excluded);
		}
	});
});

describe('search filters for content types', () => {
	beforeEach(async () => (await import('$lib/utils/cache')).cache.clear());
	afterEach(() => vi.unstubAllGlobals());

	async function queryFor(params: Record<string, unknown>) {
		const fetchMock = vi.fn(async (_url: string) => ({
			ok: true,
			json: async () => ({ response: { numFound: 0, start: 0, docs: [] } })
		}));
		vi.stubGlobal('fetch', fetchMock);
		const { search } = await import('$lib/services/internetArchive');
		await search(params as never);
		return new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('q') ?? '';
	}

	it('excludes spoken-word collections rather than restricting to music ones', async () => {
		const q = await queryFor({
			query: 'nick drake',
			excludeCollection: ['librivoxaudio', 'audio_podcast', 'radioprograms']
		});
		expect(q).toContain('AND NOT collection:(librivoxaudio)');
		expect(q).toContain('AND NOT collection:(audio_podcast)');
		expect(q).toContain('AND NOT collection:(radioprograms)');
		// Crucially, it must not also pin the search to a handful of
		// collections, which is what made the tab return nothing.
		expect(q).not.toContain('collection:(audio_music)');
	});

	it('still supports an inclusive list, for the spoken-word tabs', async () => {
		const q = await queryFor({ query: 'alice', collection: ['librivoxaudio'] });
		expect(q).toContain('collection:(librivoxaudio)');
		expect(q).not.toContain('AND NOT collection:');
	});

	it('adds nothing when a type has no collection rules', async () => {
		const q = await queryFor({ query: 'anything' });
		expect(q).not.toContain('AND NOT collection:');
	});
});
