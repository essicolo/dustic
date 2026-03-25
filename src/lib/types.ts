// Core types for Dustic

export type TrackSource = 'internetarchive' | 'funkwhale';

export interface Track {
	identifier: string; // IA identifier or fw:<instance>:<id>
	filename: string; // Audio file
	title: string;
	artist: string;
	album?: string;
	date?: string;
	duration?: number; // seconds
	collection: string[];
	genre?: string[]; // from subject tags
	format: string; // mp3, ogg, etc.
	streamUrl: string;
	thumbnailUrl?: string;
	source?: TrackSource; // defaults to 'internetarchive' for backwards compat
	metadata: Record<string, any>; // raw metadata
}

export interface FunkwhaleInstance {
	url: string; // base URL, e.g. https://open.audio
	name: string; // display name
	enabled: boolean;
}

export interface ArchiveItem {
	identifier: string;
	title: string;
	creator?: string;
	[key: string]: any;
	tracks?: Track[];
}

export interface Playlist {
	id: string; // uuid
	name: string;
	description?: string;
	tracks: string[]; // Track identifiers
	created: number; // timestamp
	updated: number;
	thumbnail?: string; // First track's art
}

export interface HistoryEntry {
	trackId: string;
	playedAt: number; // timestamp
	completionRate: number; // 0-1 (did they finish it?)
}

export interface AutoplayRule {
	id: string;
	name: string;
	enabled: boolean;
	weight: number; // 0-100, relative probability
}

export type AudioQuality = 'lowest' | 'medium' | 'best';

export interface UserProfile {
	schemaVersion: number; // Storage schema version (only changes on breaking data structure changes)
	exported: number; // Timestamp
	favorites: string[]; // Track identifiers
	playlists: Record<string, Playlist>;
	history: HistoryEntry[]; // Last 100
	autoplayRules: AutoplayRule[]; // Custom rule configuration
	settings: {
		volume: number;
		repeat: 'off' | 'one' | 'all';
		audioQuality: AudioQuality; // Audio quality preference for streaming and downloads
		defaultCollection?: string;
		funkwhaleInstances?: FunkwhaleInstance[];
	};
}

export interface SearchParams {
	query: string;
	collection?: string[];
	format?: string[];
	sort?: 'relevance' | 'date' | 'downloads';
	page?: number;
	pageSize?: number;
	sources?: {
		ia?: boolean;
		fw?: boolean;
	};
}

export interface SearchResult {
	items: Track[];
	total: number;
	page: number;
	pageSize: number;
	error?: string; // Specific error (e.g., item is dark/private)
}

export interface IASearchResponse {
	response: {
		docs: IADocument[];
		numFound: number;
		start: number;
	};
}

export interface IADocument {
	identifier: string;
	title?: string;
	creator?: string | string[];
	date?: string;
	subject?: string | string[];
	description?: string;
	format?: string | string[];
	collection?: string | string[];
	downloads?: number;
	[key: string]: any;
}

export interface IAMetadataResponse {
	metadata: {
		identifier: string;
		title?: string;
		creator?: string | string[];
		date?: string;
		subject?: string | string[];
		description?: string;
		[key: string]: any;
	};
	files: IAFile[];
}

export interface IAFile {
	name: string;
	format: string;
	size?: string;
	length?: string;
	[key: string]: any;
}
