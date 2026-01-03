// IndexedDB wrapper for offline storage

import type { Track } from '$lib/types';
import { browser } from '$app/environment';

const DB_NAME = 'dustic-offline';
const DB_VERSION = 1;
const STORE_NAME = 'tracks';
const CACHE_NAME = 'dustic-audio-cache';

export interface OfflineTrack {
	track: Track;
	downloadedAt: number;
	fileSize?: number;
	blobUrl?: string; // For offline playback
}

class OfflineStorage {
	private db: IDBDatabase | null = null;

	/**
	 * Initialize the database
	 */
	async init(): Promise<void> {
		if (!browser) return;

		return new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);

			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				this.db = request.result;
				resolve();
			};

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;

				// Create object store for tracks
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					const store = db.createObjectStore(STORE_NAME, { keyPath: 'track.identifier' });
					store.createIndex('downloadedAt', 'downloadedAt', { unique: false });
				}
			};
		});
	}

	/**
	 * Download a track for offline use
	 */
	async downloadTrack(track: Track, onProgress?: (progress: number) => void): Promise<void> {
		if (!browser) throw new Error('Cannot download in non-browser environment');

		try {
			// Download the audio file
			const response = await fetch(track.streamUrl);
			if (!response.ok) throw new Error('Failed to download track');

			const reader = response.body?.getReader();
			const contentLength = parseInt(response.headers.get('content-length') || '0');

			if (!reader) throw new Error('No response body');

			// Read the stream
			const chunks: Uint8Array[] = [];
			let receivedLength = 0;

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				chunks.push(value);
				receivedLength += value.length;

				// Report progress
				if (onProgress && contentLength) {
					onProgress((receivedLength / contentLength) * 100);
				}
			}

			// Combine chunks into a single blob
			const blob = new Blob(chunks, { type: 'audio/mpeg' });
			const fileSize = blob.size;

			// Store in Cache API
			const cache = await caches.open(CACHE_NAME);
			const blobResponse = new Response(blob);
			await cache.put(track.streamUrl, blobResponse);

			// Create blob URL for offline playback
			const blobUrl = URL.createObjectURL(blob);

			// Save metadata to IndexedDB
			const offlineTrack: OfflineTrack = {
				track,
				downloadedAt: Date.now(),
				fileSize,
				blobUrl
			};

			await this.saveTrack(offlineTrack);
		} catch (error) {
			console.error('Failed to download track:', error);
			throw error;
		}
	}

	/**
	 * Save track metadata to IndexedDB
	 */
	private async saveTrack(offlineTrack: OfflineTrack): Promise<void> {
		if (!this.db) await this.init();
		if (!this.db) throw new Error('Database not initialized');

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
			const store = transaction.objectStore(STORE_NAME);
			const request = store.put(offlineTrack);

			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	/**
	 * Get all offline tracks
	 */
	async getAllTracks(): Promise<OfflineTrack[]> {
		if (!this.db) await this.init();
		if (!this.db) return [];

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_NAME], 'readonly');
			const store = transaction.objectStore(STORE_NAME);
			const request = store.getAll();

			request.onsuccess = () => resolve(request.result || []);
			request.onerror = () => reject(request.error);
		});
	}

	/**
	 * Get a specific offline track
	 */
	async getTrack(identifier: string): Promise<OfflineTrack | null> {
		if (!this.db) await this.init();
		if (!this.db) return null;

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_NAME], 'readonly');
			const store = transaction.objectStore(STORE_NAME);
			const request = store.get(identifier);

			request.onsuccess = () => resolve(request.result || null);
			request.onerror = () => reject(request.error);
		});
	}

	/**
	 * Check if a track is downloaded
	 */
	async isDownloaded(identifier: string): Promise<boolean> {
		const track = await this.getTrack(identifier);
		return track !== null;
	}

	/**
	 * Delete an offline track
	 */
	async deleteTrack(identifier: string): Promise<void> {
		if (!this.db) await this.init();
		if (!this.db) throw new Error('Database not initialized');

		// Get track info first to get the stream URL
		const offlineTrack = await this.getTrack(identifier);
		if (!offlineTrack) return;

		// Delete from Cache API
		const cache = await caches.open(CACHE_NAME);
		await cache.delete(offlineTrack.track.streamUrl);

		// Revoke blob URL
		if (offlineTrack.blobUrl) {
			URL.revokeObjectURL(offlineTrack.blobUrl);
		}

		// Delete from IndexedDB
		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
			const store = transaction.objectStore(STORE_NAME);
			const request = store.delete(identifier);

			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	/**
	 * Get total storage usage
	 */
	async getStorageInfo(): Promise<{ used: number; quota: number; tracks: number }> {
		if (!browser) return { used: 0, quota: 0, tracks: 0 };

		const tracks = await this.getAllTracks();
		const totalSize = tracks.reduce((sum, t) => sum + (t.fileSize || 0), 0);

		// Get storage estimate if available
		if ('storage' in navigator && 'estimate' in navigator.storage) {
			const estimate = await navigator.storage.estimate();
			return {
				used: totalSize,
				quota: estimate.quota || 0,
				tracks: tracks.length
			};
		}

		return { used: totalSize, quota: 0, tracks: tracks.length };
	}

	/**
	 * Clear all offline data
	 */
	async clearAll(): Promise<void> {
		if (!this.db) await this.init();
		if (!this.db) throw new Error('Database not initialized');

		// Delete all from IndexedDB
		const tracks = await this.getAllTracks();
		for (const offlineTrack of tracks) {
			if (offlineTrack.blobUrl) {
				URL.revokeObjectURL(offlineTrack.blobUrl);
			}
		}

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
			const store = transaction.objectStore(STORE_NAME);
			const request = store.clear();

			request.onsuccess = async () => {
				// Clear cache
				await caches.delete(CACHE_NAME);
				resolve();
			};
			request.onerror = () => reject(request.error);
		});
	}

	/**
	 * Get offline-ready track for playback
	 */
	async getOfflineTrack(identifier: string): Promise<Track | null> {
		const offlineTrack = await this.getTrack(identifier);
		if (!offlineTrack) return null;

		// Return track with blob URL for offline playback
		return {
			...offlineTrack.track,
			streamUrl: offlineTrack.blobUrl || offlineTrack.track.streamUrl
		};
	}
}

// Singleton instance
export const offlineStorage = new OfflineStorage();

// Initialize on load
if (browser) {
	offlineStorage.init().catch((error) => {
		console.error('Failed to initialize offline storage:', error);
	});
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 Bytes';

	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
