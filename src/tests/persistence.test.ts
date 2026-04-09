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
