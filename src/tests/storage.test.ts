import { describe, it, expect } from 'vitest';
import { profileToJson, createDefaultProfile } from '$lib/services/storage';
import type { UserProfile } from '$lib/types';

describe('profile sanitization on export', () => {
	function baseProfile(): UserProfile {
		return {
			...createDefaultProfile(),
			settings: {
				...createDefaultProfile().settings,
				webdav: {
					url: 'https://webdav.example.com',
					username: 'user@example.com',
					password: 'enc:secret-cipher-text',
					enabled: true,
					autoSyncMinutes: 5
				},
				webdavLibraries: [
					{
						id: 'lib-1',
						name: 'My Koofr',
						url: 'https://app.koofr.net/dav/Koofr',
						username: 'me@duck.com',
						password: 'enc:another-cipher',
						rootPath: '/Music',
						enabled: true
					},
					{
						id: 'lib-2',
						name: 'Audiobooks',
						url: 'https://cloud.example.org/dav',
						username: 'me',
						password: 'enc:third-cipher',
						rootPath: '/Audio',
						enabled: false
					}
				]
			}
		};
	}

	it('strips the WebDAV sync password', () => {
		const json = profileToJson(baseProfile());
		const parsed = JSON.parse(json);
		expect(parsed.settings.webdav.password).toBe('');
		// Other webdav fields preserved
		expect(parsed.settings.webdav.url).toBe('https://webdav.example.com');
		expect(parsed.settings.webdav.username).toBe('user@example.com');
		expect(parsed.settings.webdav.enabled).toBe(true);
	});

	it('strips passwords from each WebDAV library', () => {
		const json = profileToJson(baseProfile());
		const parsed = JSON.parse(json);
		expect(parsed.settings.webdavLibraries).toHaveLength(2);
		for (const lib of parsed.settings.webdavLibraries) {
			expect(lib.password).toBe('');
		}
		// Other fields preserved (url, username, nickname, rootPath, enabled)
		expect(parsed.settings.webdavLibraries[0].name).toBe('My Koofr');
		expect(parsed.settings.webdavLibraries[0].url).toBe('https://app.koofr.net/dav/Koofr');
		expect(parsed.settings.webdavLibraries[1].enabled).toBe(false);
	});

	it('does not mutate the source profile', () => {
		const profile = baseProfile();
		profileToJson(profile);
		// Original profile must still have its passwords (encrypted form).
		expect(profile.settings.webdav?.password).toBe('enc:secret-cipher-text');
		expect(profile.settings.webdavLibraries?.[0].password).toBe('enc:another-cipher');
	});

	it('handles profiles without WebDAV configuration', () => {
		const minimal = createDefaultProfile();
		expect(() => profileToJson(minimal)).not.toThrow();
		const parsed = JSON.parse(profileToJson(minimal));
		expect(parsed.settings).toBeDefined();
	});
});
