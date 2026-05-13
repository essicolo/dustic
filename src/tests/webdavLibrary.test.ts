import { describe, it, expect } from 'vitest';
import {
	encodeIdentifier,
	decodeIdentifier,
	isWebDAVTrack,
	parsePropfind,
	parseFilenameHeuristics
} from '$lib/services/webdavLibrary';

describe('encodeIdentifier / decodeIdentifier', () => {
	it('round-trips simple paths', () => {
		const id = encodeIdentifier('lib1', '/Music/track.mp3');
		expect(isWebDAVTrack(id)).toBe(true);
		const decoded = decodeIdentifier(id);
		expect(decoded).toEqual({ libraryId: 'lib1', path: '/Music/track.mp3' });
	});

	it('handles unicode and special characters', () => {
		const id = encodeIdentifier('lib-X', '/Musique/Café — Acoustique/Été 86.mp3');
		const decoded = decodeIdentifier(id);
		expect(decoded?.path).toBe('/Musique/Café — Acoustique/Été 86.mp3');
		expect(decoded?.libraryId).toBe('lib-X');
	});

	it('returns null for non-webdav identifiers', () => {
		expect(decodeIdentifier('fw:host:123')).toBeNull();
		expect(decodeIdentifier('archive-item')).toBeNull();
	});

	it('detects webdav identifiers', () => {
		expect(isWebDAVTrack('wd:abc:def')).toBe(true);
		expect(isWebDAVTrack('fw:host:1')).toBe(false);
		expect(isWebDAVTrack('ia-item')).toBe(false);
	});
});

describe('parseFilenameHeuristics', () => {
	it('parses "Artist - Title" format', () => {
		expect(parseFilenameHeuristics('Mogwai - Helicon 1.mp3')).toEqual({
			artist: 'Mogwai',
			title: 'Helicon 1'
		});
	});

	it('strips leading track numbers', () => {
		expect(parseFilenameHeuristics('01 - Mogwai - Helicon 1.mp3')).toEqual({
			artist: 'Mogwai',
			title: 'Helicon 1'
		});
		expect(parseFilenameHeuristics('07. Slint - Good Morning, Captain.mp3')).toEqual({
			artist: 'Slint',
			title: 'Good Morning, Captain'
		});
	});

	it('falls back to title only without separator', () => {
		expect(parseFilenameHeuristics('untagged_recording.mp3')).toEqual({
			title: 'untagged_recording'
		});
	});
});

describe('parsePropfind', () => {
	const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/Music/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/></D:resourcetype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/Music/Mogwai/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/></D:resourcetype>
      </D:prop>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/Music/track%201.mp3</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype/>
        <D:getcontentlength>5242880</D:getcontentlength>
        <D:getcontenttype>audio/mpeg</D:getcontenttype>
      </D:prop>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/Music/cover.jpg</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype/>
        <D:getcontentlength>40000</D:getcontentlength>
      </D:prop>
    </D:propstat>
  </D:response>
</D:multistatus>`;

	it('skips parent, returns folders and audio files only', () => {
		const entries = parsePropfind(xml, '/Music');
		expect(entries).toHaveLength(2);
		expect(entries[0]).toMatchObject({ type: 'folder', name: 'Mogwai' });
		expect(entries[1]).toMatchObject({
			type: 'file',
			name: 'track 1.mp3',
			size: 5242880
		});
	});

	it('sorts folders before files', () => {
		const entries = parsePropfind(xml, '/Music');
		expect(entries[0].type).toBe('folder');
		expect(entries[1].type).toBe('file');
	});

	it('strips host when href is absolute URL', () => {
		const absXml = xml.replace(
			'<D:href>/Music/Mogwai/</D:href>',
			'<D:href>https://example.com/Music/Mogwai/</D:href>'
		);
		const entries = parsePropfind(absXml, '/Music');
		const folder = entries.find((e) => e.type === 'folder');
		expect(folder?.path).toBe('/Music/Mogwai');
	});

	it('handles namespace-less XML', () => {
		const plain = xml.replace(/D:/g, '');
		const entries = parsePropfind(plain, '/Music');
		expect(entries.length).toBeGreaterThan(0);
	});

	// Koofr returns server-absolute hrefs (e.g. /dav/Koofr/Musique/foo). Without
	// stripping the library URL pathname, we end up double-concatenating it onto
	// the next PROPFIND target. Koofr also XML-escapes "&" as "&amp;" in hrefs,
	// which used to round-trip as "%26amp%3B" in the URL.
	it('strips library URL pathname prefix and XML-decodes hrefs (Koofr quirk)', () => {
		const koofrXml = `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/dav/Koofr/Musique/</D:href>
    <D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat>
  </D:response>
  <D:response>
    <D:href>/dav/Koofr/Musique/Fripp%20&amp;%20Eno/</D:href>
    <D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat>
  </D:response>
  <D:response>
    <D:href>/dav/Koofr/Musique/track%2001.mp3</D:href>
    <D:propstat><D:prop>
      <D:resourcetype/>
      <D:getcontentlength>5242880</D:getcontentlength>
    </D:prop></D:propstat>
  </D:response>
</D:multistatus>`;

		const entries = parsePropfind(koofrXml, '/Musique', '/dav/Koofr');
		expect(entries).toHaveLength(2);

		const folder = entries.find((e) => e.type === 'folder');
		expect(folder?.name).toBe('Fripp & Eno');
		expect(folder?.path).toBe('/Musique/Fripp & Eno');

		const file = entries.find((e) => e.type === 'file');
		expect(file?.name).toBe('track 01.mp3');
		expect(file?.path).toBe('/Musique/track 01.mp3');
	});
});
