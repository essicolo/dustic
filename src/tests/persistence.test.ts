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

describe('favorite folders (schema v3)', () => {
	const base = {
		schemaVersion: 2,
		exported: 1,
		favorites: [{ id: 'item1', type: 'track', addedAt: 1 }],
		playlists: {},
		history: [],
		autoplayRules: [],
		settings: { volume: 0.7, repeat: 'off' as const, audioQuality: 'medium' as const }
	};
	const folder = { id: 'wd:L:abc', libraryId: 'L', path: '/Music/Rock', name: 'Rock', addedAt: 5 };

	it('migrates v2 favoriteFolders into favorites as type folder', async () => {
		const { normalizeProfile } = await import('$lib/services/profileNormalize');
		const p = normalizeProfile({ ...base, favoriteFolders: [folder, folder, { bogus: true }] }) as any;
		expect(p.favoriteFolders).toBeUndefined();
		expect(p.schemaVersion).toBe(3);
		expect(p.favorites).toEqual([
			{ id: 'item1', type: 'track', addedAt: 1 },
			{ id: 'wd:L:abc', type: 'folder', addedAt: 5, ref: { libraryId: 'L', path: '/Music/Rock', name: 'Rock' } }
		]);
	});

	it('round-trips folder favorites through the schema', () => {
		const fav = { id: 'wd:L:abc', type: 'folder', addedAt: 5, ref: { libraryId: 'L', path: '/R', name: 'R' } };
		const parsed = UserProfileSchema.parse({ ...base, schemaVersion: 3, favorites: [fav] });
		expect(parsed.favorites).toEqual([fav]);
	});

	it('merges folder favorites by id on import', async () => {
		const { mergeProfiles } = await import('$lib/services/storage');
		const a = { id: 'wd:L:a', type: 'folder', addedAt: 1, ref: { libraryId: 'L', path: '/A', name: 'A' } };
		const b = { ...a, id: 'wd:L:b', ref: { ...a.ref, path: '/B', name: 'B' } };
		const merged = mergeProfiles({ ...base, favorites: [a] } as any, { ...base, favorites: [a, b] } as any);
		expect(merged.favorites.map((f) => f.id)).toEqual(['wd:L:a', 'wd:L:b']);
		expect(merged.schemaVersion).toBe(3);
	});
});
