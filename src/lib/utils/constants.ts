// Constants for Dustic

export const IA_BASE_URL = 'https://archive.org';
export const IA_SEARCH_URL = `${IA_BASE_URL}/advancedsearch.php`;
export const IA_METADATA_URL = `${IA_BASE_URL}/metadata`;
export const IA_DOWNLOAD_URL = `${IA_BASE_URL}/download`;

export const PLACEHOLDER_THUMBNAIL_URL = 'https://archive.org/images/g_logo_mw.png';

// ── Content types ──
// Unified content type system that maps to IA collections and FW tag searches
export interface ContentType {
	id: string;
	name: string;
	icon: string; // Iconify icon name
	iaCollections: string[]; // IA collection IDs to search
	fwTags: string[]; // FW tag/keyword searches
}

export const CONTENT_TYPES: ContentType[] = [
	{
		id: 'music',
		name: 'Music',
		icon: 'solar:music-notes-bold',
		iaCollections: ['audio_music', 'etree', '78rpm'],
		fwTags: [] // FW is music by default, no filter needed
	},
	{
		id: 'podcasts',
		name: 'Podcasts',
		icon: 'solar:microphone-3-bold',
		iaCollections: ['audio_podcast'],
		fwTags: ['podcast']
	},
	{
		id: 'audiobooks',
		name: 'Audiobooks',
		icon: 'solar:book-bold',
		iaCollections: ['librivoxaudio'],
		fwTags: ['audiobook', 'spoken-word']
	},
	{
		id: 'radio',
		name: 'Radio',
		icon: 'solar:radio-bold',
		iaCollections: ['radioprograms'],
		fwTags: ['radio']
	}
];

// Popular genre/style tags shown as discovery chips
export const POPULAR_TAGS = [
	'rock', 'jazz', 'electronic', 'classical', 'hip-hop', 'folk',
	'blues', 'ambient', 'punk', 'metal', 'soul', 'reggae',
	'country', 'latin', 'world', 'experimental'
];

// Legacy: IA collection definitions (still used by /collection/[id] route)
export const POPULAR_COLLECTIONS = [
	{ id: 'etree', name: 'Live Music Archive', icon: '' },
	{ id: 'audio_music', name: 'Music', icon: '' },
	{ id: '78rpm', name: '78 RPM', icon: '' },
	{ id: 'librivoxaudio', name: 'Audiobooks', icon: '' },
	{ id: 'radioprograms', name: 'Radio Programs', icon: '' },
	{ id: 'audio_podcast', name: 'Podcasts', icon: '' }
];

export const AUDIO_FORMATS = ['mp3', 'ogg', 'flac', 'wav', 'm4a', 'aac', 'aiff', 'opus'];

export const DEFAULT_AUTOPLAY_RULES = [
	{ id: 'same-album', name: 'Same Album', enabled: true, weight: 60 },
	{ id: 'same-artist', name: 'Same Artist', enabled: true, weight: 30 },
	{ id: 'similar-genre', name: 'Similar Genre', enabled: true, weight: 8 },
	{ id: 'same-collection', name: 'Same Collection', enabled: false, weight: 0 },
	{ id: 'same-decade', name: 'Same Decade', enabled: false, weight: 0 },
	{ id: 'random', name: 'Random Discovery', enabled: true, weight: 2 }
];

export const DEFAULT_FUNKWHALE_INSTANCES = [
	{ url: 'https://open.audio', name: 'open.audio', enabled: true }
];

// Legacy: kept for backwards compat with /fw/[host] route
export const FUNKWHALE_CATEGORIES = [
	{ id: 'rock', name: 'Rock' },
	{ id: 'jazz', name: 'Jazz' },
	{ id: 'electronic', name: 'Electronic' },
	{ id: 'classical', name: 'Classical' },
	{ id: 'hip-hop', name: 'Hip-Hop' },
	{ id: 'folk', name: 'Folk' }
];

export const CONFIG = {
	maxHistorySize: 100,
	maxQueueSize: 500,
	profileVersion: '1.0.0',
	searchDebounceMs: 300,
	defaultPageSize: 50
};
