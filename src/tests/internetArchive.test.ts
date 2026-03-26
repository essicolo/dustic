import { describe, it, expect } from 'vitest';
import { getThumbnailUrl } from '$lib/services/internetArchive';

describe('getThumbnailUrl', () => {
	it('should return a weserv.nl proxied thumbnail URL', () => {
		const identifier = 'test_identifier';
		const result = getThumbnailUrl(identifier);
		expect(result).toContain('images.weserv.nl');
		expect(result).toContain(encodeURIComponent(`https://archive.org/services/img/${identifier}`));
	});
});
