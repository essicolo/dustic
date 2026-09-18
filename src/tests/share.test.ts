import { describe, it, expect } from 'vitest';
import { buildShareUrl } from '$lib/utils/share';

describe('buildShareUrl', () => {
	// The URL used to be hardcoded to https://dustic.app, so a link copied
	// from a dev server, a preview deployment or a self-hosted instance sent
	// the recipient to a different site than the one the sharer was using.
	it('points at the origin the app is served from', () => {
		expect(buildShareUrl('some-item', 'http://localhost:5173')).toBe(
			'http://localhost:5173/item/some-item'
		);
		expect(buildShareUrl('some-item', 'https://dustic.app')).toBe(
			'https://dustic.app/item/some-item'
		);
		expect(buildShareUrl('some-item', 'https://music.example.org')).toBe(
			'https://music.example.org/item/some-item'
		);
	});

	it('never hardcodes a host', () => {
		expect(buildShareUrl('x', 'https://elsewhere.test')).not.toContain('dustic.app');
	});

	it('honours a base path for instances not mounted at the root', () => {
		expect(buildShareUrl('some-item', 'https://example.org/dustic')).toBe(
			'https://example.org/dustic/item/some-item'
		);
	});

	it('carries the track index for a track inside an item', () => {
		expect(buildShareUrl('album-id#4', 'https://dustic.app')).toBe(
			'https://dustic.app/item/album-id?track=4'
		);
	});

	it('encodes FunkWhale identifiers, which contain colons and slashes', () => {
		const url = buildShareUrl('fw:open.audio:1234', 'https://dustic.app');
		expect(url).toBe('https://dustic.app/item/fw%3Aopen.audio%3A1234');
		expect(url).not.toContain('?track=');
	});
});
