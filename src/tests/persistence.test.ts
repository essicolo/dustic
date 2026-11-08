import { describe, it, expect } from 'vitest';
import { UserProfileSchema } from '$lib/schemas/archive';

describe('UserProfileSchema', () => {
	const baseProfile = {
		schemaVersion: 2,
		exported: Date.now(),
		favorites: [],
		playlists: {},
		history: [],
		autoplayRules: [],
		settings: {
			volume: 0.7,
			repeat: 'off' as const,
			audioQuality: 'medium' as const
		}
	};

	it('preserves webdav config through parse', () => {
		const profile = {
			...baseProfile,
			settings: {
				...baseProfile.settings,
				webdav: {
					url: 'https://webdav.pcloud.com/Applications',
					username: 'user@example.com',
					password: 'enc:abc123',
					enabled: true,
					autoSyncMinutes: 5,
					lastSync: 1700000000000
				}
			}
		};

		const parsed = UserProfileSchema.parse(profile);
		expect(parsed.settings.webdav).toEqual(profile.settings.webdav);
	});

	it('preserves webdav with old autoSync boolean field (passthrough)', () => {
		const profile = {
			...baseProfile,
			settings: {
				...baseProfile.settings,
				webdav: {
					url: 'https://example.com',
					username: 'user',
					password: 'pass',
					enabled: true,
					autoSync: true // old field name
				}
			}
		};

		const parsed = UserProfileSchema.parse(profile);
		// passthrough should keep the webdav object intact
		expect((parsed.settings as any).webdav.enabled).toBe(true);
		expect((parsed.settings as any).webdav.url).toBe('https://example.com');
	});

	it('works without webdav field', () => {
		const parsed = UserProfileSchema.parse(baseProfile);
		expect(parsed.settings).not.toHaveProperty('webdav');
	});

	it('preserves unknown settings fields via passthrough', () => {
		const profile = {
			...baseProfile,
			settings: {
				...baseProfile.settings,
				someNewFeature: { enabled: true }
			}
		};

		const parsed = UserProfileSchema.parse(profile);
		expect((parsed.settings as any).someNewFeature).toEqual({ enabled: true });
	});
});

describe('favoriteFolders', () => {
	const base = {
		schemaVersion: 2,
		exported: 1,
		favorites: [],
		playlists: {},
		history: [],
		autoplayRules: [],
		settings: { volume: 0.7, repeat: 'off' as const, audioQuality: 'medium' as const }
	};
	const folder = { id: 'wd:L:abc', libraryId: 'L', path: '/Music/Rock', name: 'Rock', addedAt: 5 };

	it('survives schema validation', () => {
		const parsed = UserProfileSchema.parse({ ...base, favoriteFolders: [folder] });
		expect(parsed.favoriteFolders).toEqual([folder]);
	});

	it('is optional, so profiles from older versions still validate', () => {
		expect(() => UserProfileSchema.parse(base)).not.toThrow();
	});

	it('is merged by id when importing a profile', async () => {
		const { mergeProfiles } = await import('$lib/services/storage');
		const other = { ...folder, id: 'wd:L:def', name: 'Jazz' };
		const merged = mergeProfiles(
			{ ...base, favoriteFolders: [folder] } as any,
			{ ...base, favoriteFolders: [folder, other] } as any
		);
		expect(merged.favoriteFolders?.map((f) => f.name)).toEqual(['Rock', 'Jazz']);
	});
});
