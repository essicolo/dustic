// Offline download manager store

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { offlineStorage, type OfflineTrack } from '$lib/services/offlineStorage';
import type { Track } from '$lib/types';
import { library } from './library';
import { decodeIdentifier, isPathInside } from '$lib/services/webdavLibrary';

export interface DownloadProgress {
	trackId: string;
	progress: number; // 0-100
	status: 'queued' | 'downloading' | 'completed' | 'error';
	error?: string;
}

/** A WebDAV folder the user asked to keep available offline. */
export interface OfflineFolder {
	id: string; // `${libraryId}:${path}`
	libraryId: string;
	/** Server-absolute folder path (same convention as WebDAVEntry.path). */
	path: string;
	name: string;
	addedAt: number;
	lastSyncedAt?: number;
	/** Set when the last sync stopped at the file limit. */
	truncated?: boolean;
}

export interface FolderJob {
	folderId: string;
	phase: 'listing' | 'downloading' | 'done' | 'error';
	total: number;
	done: number;
	failed: number;
	skipped: number;
	error?: string;
}

export type SourceKey = 'ia' | 'funkwhale' | 'webdav';

export interface SourceBreakdown {
	tracks: number;
	bytes: number;
}

interface OfflineState {
	downloadQueue: Map<string, DownloadProgress>;
	offlineTracks: OfflineTrack[];
	storageUsed: number;
	storageQuota: number;
	appUsage: number;
	persisted: boolean | null;
	isLoading: boolean;
	folders: OfflineFolder[];
	folderJobs: Map<string, FolderJob>;
}

const FOLDERS_KEY = 'dustic-offline-folders';
/** Parallel downloads. Two keeps the UI responsive and servers happy. */
const MAX_CONCURRENT = 2;

function loadFolders(): OfflineFolder[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(FOLDERS_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function saveFolders(folders: OfflineFolder[]): void {
	if (!browser) return;
	try {
		localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
	} catch {
		// storage full / private mode — folders just won't persist
	}
}

export function folderId(libraryId: string, path: string): string {
	return `${libraryId}:${path}`;
}

export function sourceOf(track: Track): SourceKey {
	if (track.source === 'webdav' || track.identifier.startsWith('wd:')) return 'webdav';
	if (track.source === 'funkwhale') return 'funkwhale';
	return 'ia';
}

const initialState: OfflineState = {
	downloadQueue: new Map(),
	offlineTracks: [],
	storageUsed: 0,
	storageQuota: 0,
	appUsage: 0,
	persisted: null,
	isLoading: false,
	folders: loadFolders(),
	folderJobs: new Map()
};

// Simple semaphore shared by every download entry point, so "download all"
// on a 300-track folder doesn't open 300 connections at once.
let active = 0;
const waiters: (() => void)[] = [];
async function acquire(): Promise<void> {
	if (active < MAX_CONCURRENT) {
		active++;
		return;
	}
	await new Promise<void>((resolve) => waiters.push(resolve));
	active++;
}
function release(): void {
	active--;
	waiters.shift()?.();
}

function createOfflineStore() {
	const store = writable<OfflineState>(initialState);
	const { subscribe, update } = store;
	let integrityChecked = false;
	let reloadTimer: ReturnType<typeof setTimeout> | null = null;

	function setProgress(id: string, patch: Partial<DownloadProgress> | null) {
		update((state) => {
			const queue = new Map(state.downloadQueue);
			if (patch === null) queue.delete(id);
			else {
				const current = queue.get(id) || { trackId: id, progress: 0, status: 'queued' as const };
				queue.set(id, { ...current, ...patch });
			}
			return { ...state, downloadQueue: queue };
		});
	}

	function setJob(id: string, patch: Partial<FolderJob> | null) {
		update((state) => {
			const jobs = new Map(state.folderJobs);
			if (patch === null) jobs.delete(id);
			else {
				const current = jobs.get(id) || {
					folderId: id,
					phase: 'listing' as const,
					total: 0,
					done: 0,
					failed: 0,
					skipped: 0
				};
				jobs.set(id, { ...current, ...patch });
			}
			return { ...state, folderJobs: jobs };
		});
	}

	function setFolders(mutator: (folders: OfflineFolder[]) => OfflineFolder[]) {
		update((state) => {
			const folders = mutator(state.folders);
			saveFolders(folders);
			return { ...state, folders };
		});
	}

	/** Debounced reload, so bulk downloads don't re-read IndexedDB per file. */
	function scheduleReload(delay = 400) {
		if (reloadTimer) clearTimeout(reloadTimer);
		reloadTimer = setTimeout(() => {
			reloadTimer = null;
			void api.loadOfflineTracks();
		}, delay);
	}

	/**
	 * Download one track. Resolves to true on success, false on failure
	 * (errors are reflected in downloadQueue rather than thrown).
	 */
	async function downloadOne(track: Track, opts: { addToFavorites: boolean; reload: boolean }): Promise<boolean> {
		setProgress(track.identifier, { progress: 0, status: 'queued', error: undefined });
		await acquire();
		try {
			setProgress(track.identifier, { status: 'downloading' });
			let lastPct = -1;
			await offlineStorage.downloadTrack(track, (progress) => {
				const pct = Math.round(progress);
				if (pct === lastPct) return; // avoid a store update per network chunk
				lastPct = pct;
				setProgress(track.identifier, { progress: pct });
			});
			setProgress(track.identifier, { status: 'completed', progress: 100 });

			if (opts.addToFavorites) {
				const baseId = track.identifier.split('#')[0];
				if (!library.isFavorite(baseId)) library.toggleFavorite(baseId);
			}

			setTimeout(() => setProgress(track.identifier, null), 2000);
			if (opts.reload) scheduleReload(0);
			return true;
		} catch (error: any) {
			console.error('Download failed:', track.identifier, error);
			const quota = error?.name === 'QuotaExceededError';
			setProgress(track.identifier, {
				status: 'error',
				error: quota ? 'quota' : error?.message || 'Download failed'
			});
			setTimeout(() => setProgress(track.identifier, null), 3000);
			return false;
		} finally {
			release();
		}
	}

	const api = {
		subscribe,

		/** Load offline tracks and storage figures. Verifies cache integrity once per session. */
		async loadOfflineTracks() {
			update((state) => ({ ...state, isLoading: true }));
			try {
				if (!integrityChecked) {
					integrityChecked = true;
					const removed = await offlineStorage.verifyIntegrity();
					if (removed.length > 0) {
						console.warn(`[Offline] ${removed.length} download(s) lost their audio (evicted?) and were removed`);
					}
				}
				const tracks = await offlineStorage.getAllTracks();
				const info = await offlineStorage.getStorageInfo();
				update((state) => ({
					...state,
					offlineTracks: tracks,
					storageUsed: info.used,
					storageQuota: info.quota,
					appUsage: info.appUsage,
					persisted: info.persisted,
					isLoading: false
				}));
			} catch (error) {
				console.error('Failed to load offline tracks:', error);
				update((state) => ({ ...state, isLoading: false }));
			}
		},

		/** Download a single track (the per-track download button). */
		async downloadTrack(track: Track) {
			const state = get(store);
			const existing = state.downloadQueue.get(track.identifier);
			if (existing && (existing.status === 'downloading' || existing.status === 'queued')) return;
			await downloadOne(track, { addToFavorites: true, reload: true });
		},

		/**
		 * Download many tracks with bounded concurrency. Already-downloaded
		 * tracks are skipped unless `force` is set.
		 */
		async downloadTracks(
			tracks: Track[],
			opts: { addToFavorites?: boolean; force?: boolean; onEach?: (ok: boolean | null) => void } = {}
		): Promise<{ ok: number; failed: number; skipped: number }> {
			const result = { ok: 0, failed: 0, skipped: 0 };
			const have = opts.force
				? new Set<string>()
				: new Set(get(store).offlineTracks.map((t) => t.track.identifier));

			await Promise.all(
				tracks.map(async (track) => {
					if (have.has(track.identifier)) {
						result.skipped++;
						opts.onEach?.(null);
						return;
					}
					const ok = await downloadOne(track, {
						addToFavorites: opts.addToFavorites ?? false,
						reload: false
					});
					if (ok) result.ok++;
					else result.failed++;
					opts.onEach?.(ok);
					scheduleReload();
				})
			);
			await api.loadOfflineTracks();
			return result;
		},

		async deleteTrack(identifier: string) {
			await offlineStorage.deleteTrack(identifier);
			await api.loadOfflineTracks();
		},

		async isOffline(identifier: string): Promise<boolean> {
			return offlineStorage.isDownloaded(identifier);
		},

		async getOfflineTrack(identifier: string): Promise<Track | null> {
			return offlineStorage.getOfflineTrack(identifier);
		},

		async clearAll() {
			await offlineStorage.clearAll();
			setFolders(() => []);
			update((state) => ({ ...state, downloadQueue: new Map(), folderJobs: new Map() }));
			await api.loadOfflineTracks();
		},

		async requestPersistence() {
			const persisted = await offlineStorage.requestPersistence();
			update((state) => ({ ...state, persisted }));
			return persisted;
		},

		getDownloadProgress(identifier: string): DownloadProgress | null {
			return get(store).downloadQueue.get(identifier) || null;
		},

		// ---------------------------------------------------------------
		// WebDAV offline folders
		// ---------------------------------------------------------------

		isFolderPinned(libraryId: string, path: string): boolean {
			return get(store).folders.some((f) => f.id === folderId(libraryId, path));
		},

		/**
		 * Keep a WebDAV folder (and everything below it) available offline.
		 * Lists it recursively and downloads every audio file not yet stored.
		 * Calling it again on a pinned folder re-syncs (fetches new files).
		 */
		async syncFolder(libraryId: string, absolutePath: string, name?: string) {
			const id = folderId(libraryId, absolutePath);
			const job = get(store).folderJobs.get(id);
			if (job && (job.phase === 'listing' || job.phase === 'downloading')) return;

			const { settings } = await import('./settings');
			const { findLibrary, listAudioFilesRecursive, buildTrack, toRelativePath } = await import(
				'$lib/services/webdavLibrary'
			);
			const lib = findLibrary(settings.getWebDAVLibraries(), libraryId);
			if (!lib) {
				setJob(id, { phase: 'error', error: 'library' });
				return;
			}

			const label = name || absolutePath.split('/').filter(Boolean).pop() || lib.name;
			setFolders((folders) =>
				folders.some((f) => f.id === id)
					? folders
					: [...folders, { id, libraryId, path: absolutePath, name: label, addedAt: Date.now() }]
			);

			setJob(id, { phase: 'listing', total: 0, done: 0, failed: 0, skipped: 0, error: undefined });
			try {
				const { files, truncated } = await listAudioFilesRecursive(lib, toRelativePath(lib, absolutePath));
				const tracks = files.map((f) => buildTrack(lib, f));
				setJob(id, { phase: 'downloading', total: tracks.length });

				const res = await api.downloadTracks(tracks, {
					onEach: (ok) => {
						const cur = get(store).folderJobs.get(id);
						if (!cur) return;
						setJob(id, {
							done: cur.done + 1,
							failed: cur.failed + (ok === false ? 1 : 0),
							skipped: cur.skipped + (ok === null ? 1 : 0)
						});
					}
				});

				setFolders((folders) =>
					folders.map((f) => (f.id === id ? { ...f, lastSyncedAt: Date.now(), truncated } : f))
				);
				setJob(id, { phase: 'done', failed: res.failed });
				if (res.failed === 0) setTimeout(() => setJob(id, null), 4000);
			} catch (err) {
				console.error('[Offline] Folder sync failed:', err);
				setJob(id, { phase: 'error', error: err instanceof Error ? err.message : String(err) });
			}
		},

		/**
		 * Stop keeping a folder offline and delete its downloads — except
		 * tracks still covered by another pinned folder, favorited, or in a
		 * playlist.
		 */
		async removeFolder(id: string, deleteFiles = true) {
			const state = get(store);
			const folder = state.folders.find((f) => f.id === id);
			setFolders((folders) => folders.filter((f) => f.id !== id));
			setJob(id, null);
			if (!folder || !deleteFiles) return;

			const remaining = get(store).folders;
			const lib = get(library);
			const referenced = new Set<string>([
				...lib.favorites.map((f) => f.id),
				...Object.values(lib.playlists).flatMap((p) => p.tracks)
			]);

			for (const ot of state.offlineTracks) {
				const decoded = decodeIdentifier(ot.track.identifier);
				if (!decoded || decoded.libraryId !== folder.libraryId) continue;
				if (!isPathInside(decoded.path, folder.path)) continue;
				if (referenced.has(ot.track.identifier)) continue;
				const stillPinned = remaining.some(
					(f) => f.libraryId === decoded.libraryId && isPathInside(decoded.path, f.path)
				);
				if (stillPinned) continue;
				await offlineStorage.deleteTrack(ot.track.identifier);
			}
			await api.loadOfflineTracks();
		}
	};

	return api;
}

export const offline = createOfflineStore();

// Derived store for checking if track is downloading
export const isDownloading = derived(offline, ($offline) => (identifier: string) => {
	const progress = $offline.downloadQueue.get(identifier);
	return progress?.status === 'downloading' || progress?.status === 'queued';
});

// Derived store for Set-based lookups (Issue #6 - O(1) instead of O(n))
export const offlineTrackSet = derived(offline, ($offline) => {
	const set = new Set<string>();
	$offline.offlineTracks.forEach((t) => {
		const trackId = t.track.identifier;
		set.add(trackId);

		// Also add base ID variants for "foo" and "foo#0" equivalence
		const baseId = trackId.split('#')[0];
		const index = trackId.includes('#') ? parseInt(trackId.split('#')[1]) : 0;
		if (index === 0) {
			set.add(baseId);
		}
	});
	return set;
});

// Optimized offline availability check with Set (Issue #6)
export const isOfflineAvailable = derived(offlineTrackSet, ($set) => (identifier: string) => {
	if ($set.has(identifier)) return true;

	// Check base ID variant
	const baseId = identifier.split('#')[0];
	const index = identifier.includes('#') ? parseInt(identifier.split('#')[1]) : 0;
	if (index === 0 && $set.has(baseId)) return true;
	if (!identifier.includes('#') && $set.has(`${baseId}#0`)) return true;

	return false;
});

/** Count and bytes downloaded per source. */
export const offlineBreakdown = derived(offline, ($offline) => {
	const out: Record<SourceKey, SourceBreakdown> = {
		ia: { tracks: 0, bytes: 0 },
		funkwhale: { tracks: 0, bytes: 0 },
		webdav: { tracks: 0, bytes: 0 }
	};
	for (const ot of $offline.offlineTracks) {
		const key = sourceOf(ot.track);
		out[key].tracks++;
		out[key].bytes += ot.fileSize || 0;
	}
	return out;
});

/**
 * Predicate: is this identifier a WebDAV track kept alive by a pinned
 * folder? Used to keep folder downloads out of the "orphans" list.
 */
export const isInOfflineFolder = derived(offline, ($offline) => {
	const folders = $offline.folders;
	return (identifier: string): boolean => {
		if (folders.length === 0) return false;
		const decoded = decodeIdentifier(identifier);
		if (!decoded) return false;
		return folders.some((f) => f.libraryId === decoded.libraryId && isPathInside(decoded.path, f.path));
	};
});
