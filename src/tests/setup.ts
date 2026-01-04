import { vi } from 'vitest';

// Mock SvelteKit runtime modules
vi.mock('$app/environment', () => ({
	browser: true,
	dev: false,
	building: false,
	version: 'test'
}));

vi.mock('$app/stores', () => ({
	page: { subscribe: vi.fn() },
	navigating: { subscribe: vi.fn() },
	updated: { subscribe: vi.fn() }
}));

vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	invalidate: vi.fn(),
	invalidateAll: vi.fn(),
	preloadData: vi.fn(),
	preloadCode: vi.fn(),
	beforeNavigate: vi.fn(),
	afterNavigate: vi.fn()
}));

// Mock browser environment
global.window = global.window || ({} as any);
global.navigator = global.navigator || ({} as any);
global.localStorage = global.localStorage || {
	getItem: vi.fn(),
	setItem: vi.fn(),
	removeItem: vi.fn(),
	clear: vi.fn()
};

// Mock MediaMetadata
global.MediaMetadata = class MediaMetadata {
	title: string;
	artist: string;
	album: string;
	artwork: any[];

	constructor(metadata: any) {
		this.title = metadata.title || '';
		this.artist = metadata.artist || '';
		this.album = metadata.album || '';
		this.artwork = metadata.artwork || [];
	}
} as any;

// Mock Media Session API
global.navigator.mediaSession = {
	metadata: null,
	playbackState: 'none',
	setActionHandler: vi.fn(),
	setPositionState: vi.fn()
} as any;

// Mock Audio element
global.HTMLMediaElement.prototype.load = vi.fn();
global.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
global.HTMLMediaElement.prototype.pause = vi.fn();
