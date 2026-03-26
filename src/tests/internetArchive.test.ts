import { describe, it, expect } from 'vitest';
import { getThumbnailUrl, cleanSearchInput } from '$lib/services/internetArchive';

describe('getThumbnailUrl', () => {
	it('should return a weserv.nl proxied thumbnail URL', () => {
		const identifier = 'test_identifier';
		const result = getThumbnailUrl(identifier);
		expect(result).toContain('images.weserv.nl');
		expect(result).toContain(encodeURIComponent(`https://archive.org/services/img/${identifier}`));
	});
});

describe('cleanSearchInput', () => {
	it('should escape ! to prevent Lucene NOT operator', () => {
		const result = cleanSearchInput('Godspeed You! Black Emperor');
		expect(result).toBe('Godspeed You\\! Black Emperor');
	});

	it('should balance unmatched quotes', () => {
		const result = cleanSearchInput('"Pink Floyd');
		expect(result).toBe('Pink Floyd');
	});

	it('should preserve matched quotes', () => {
		const result = cleanSearchInput('"Pink Floyd"');
		expect(result).toBe('"Pink Floyd"');
	});

	it('should strip archive.org URLs to identifiers', () => {
		const result = cleanSearchInput('https://archive.org/details/my-item-123');
		expect(result).toBe('my-item-123');
	});

	it('should pass through normal queries unchanged', () => {
		const result = cleanSearchInput('Bach cello suites');
		expect(result).toBe('Bach cello suites');
	});

	it('should preserve field syntax like creator:"..."', () => {
		const result = cleanSearchInput('creator:"Bach"');
		expect(result).toBe('creator:"Bach"');
	});
});
