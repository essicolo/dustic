import { describe, it, expect } from 'vitest';
import { getThumbnailUrl } from '$lib/services/internetArchive';

describe('getThumbnailUrl', () => {
	it('should return the correct proxied thumbnail URL', () => {
		const identifier = 'test_identifier';
		const expectedUrl = `https://archive.org/services/img/${identifier}`;
		const result = getThumbnailUrl(identifier);
		expect(result).toBe(`/api/cors-proxy?url=${encodeURIComponent(expectedUrl)}`);
	});
});