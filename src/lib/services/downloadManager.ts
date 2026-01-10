// Download Manager with pause/resume support (Issue #15)

import type { Track } from '$lib/types';

export interface DownloadState {
	track: Track;
	abortController: AbortController;
	bytesDownloaded: number;
	totalBytes: number;
	chunks: Uint8Array[];
	status: 'downloading' | 'paused' | 'completed' | 'error';
}

class DownloadManager {
	private downloads = new Map<string, DownloadState>();
	private readonly CHUNK_SIZE = 1024 * 1024; // 1MB chunks

	async startDownload(
		track: Track,
		onProgress: (progress: number) => void
	): Promise<void> {
		const controller = new AbortController();

		const state: DownloadState = {
			track,
			abortController: controller,
			bytesDownloaded: 0,
			totalBytes: 0,
			chunks: [],
			status: 'downloading'
		};

		this.downloads.set(track.identifier, state);

		try {
			await this.downloadWithRanges(track, state, onProgress);
		} catch (error: any) {
			if (error.name === 'AbortError') {
				state.status = 'paused';
			} else {
				state.status = 'error';
				throw error;
			}
		}
	}

	private async downloadWithRanges(
		track: Track,
		state: DownloadState,
		onProgress: (progress: number) => void
	): Promise<void> {
		// Get total size first
		if (state.totalBytes === 0) {
			const headResponse = await fetch(track.streamUrl, { method: 'HEAD' });
			state.totalBytes = parseInt(headResponse.headers.get('content-length') || '0');
		}

		let downloaded = state.bytesDownloaded;

		while (downloaded < state.totalBytes) {
			const rangeStart = downloaded;
			const rangeEnd = Math.min(downloaded + this.CHUNK_SIZE - 1, state.totalBytes - 1);

			const response = await fetch(track.streamUrl, {
				headers: { Range: `bytes=${rangeStart}-${rangeEnd}` },
				signal: state.abortController.signal
			});

			if (!response.ok && response.status !== 206) {
				throw new Error('Download failed');
			}

			const chunk = new Uint8Array(await response.arrayBuffer());
			state.chunks.push(chunk);
			downloaded += chunk.length;
			state.bytesDownloaded = downloaded;

			onProgress((downloaded / state.totalBytes) * 100);
		}

		// Complete - combine chunks and save
		const blob = new Blob(state.chunks as BlobPart[], { type: 'audio/mpeg' });
		await this.saveToCache(track.streamUrl, blob);
		state.status = 'completed';
	}

	pauseDownload(identifier: string): void {
		const state = this.downloads.get(identifier);
		if (state && state.status === 'downloading') {
			state.abortController.abort();
			state.status = 'paused';
		}
	}

	async resumeDownload(
		identifier: string,
		onProgress: (progress: number) => void
	): Promise<void> {
		const state = this.downloads.get(identifier);
		if (!state || state.status !== 'paused') return;

		state.abortController = new AbortController();
		state.status = 'downloading';

		await this.downloadWithRanges(state.track, state, onProgress);
	}

	cancelDownload(identifier: string): void {
		const state = this.downloads.get(identifier);
		if (state) {
			state.abortController.abort();
			this.downloads.delete(identifier);
		}
	}

	getDownloadState(identifier: string): DownloadState | null {
		return this.downloads.get(identifier) || null;
	}

	private async saveToCache(url: string, blob: Blob): Promise<void> {
		const cache = await caches.open('dustic-audio-cache');
		await cache.put(url, new Response(blob));
	}
}

export const downloadManager = new DownloadManager();
