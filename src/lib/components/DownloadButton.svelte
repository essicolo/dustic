<script lang="ts">
	import { offline, isOfflineAvailable } from '$lib/stores/offline';
	import type { Track } from '$lib/types';
	import Icon from './Icon.svelte';

	export let track: Track;
	export let size: 'xs' | 'sm' | 'md' = 'sm';

	let progress = 0;
	let status: 'idle' | 'downloading' | 'completed' | 'error' = 'idle';

	$: isOffline = $isOfflineAvailable(track.identifier);
	$: downloadProgress = $offline.downloadQueue.get(track.identifier);
	$: {
		if (downloadProgress) {
			progress = downloadProgress.progress;
			status = downloadProgress.status;
		} else {
			status = isOffline ? 'completed' : 'idle';
		}
	}

	async function handleDownload() {
		if (isOffline) return; // Already downloaded
		if (status === 'downloading') return; // Already downloading

		await offline.downloadTrack(track);
	}

	async function handleDelete() {
		if (confirm('Remove this track from offline storage?')) {
			await offline.deleteTrack(track.identifier);
		}
	}
</script>

{#if status === 'downloading'}
	<!-- Downloading state -->
	<button class="btn btn-{size} btn-square relative" disabled title="Downloading... {progress}%">
		<div class="radial-progress text-xs" style="--value:{progress}; --size:1.5rem;">
			{progress}
		</div>
	</button>
{:else if isOffline}
	<!-- Downloaded state -->
	<button
		on:click={handleDelete}
		class="btn btn-{size} btn-square btn-success"
		title="Downloaded - Click to remove"
	>
		<Icon icon="solar:download-minimalistic-bold" width={size === 'xs' ? 14 : 16} />
	</button>
{:else}
	<!-- Not downloaded state -->
	<button
		on:click={handleDownload}
		class="btn btn-{size} btn-square btn-ghost"
		title="Download for offline"
	>
		<Icon icon="solar:download-minimalistic-linear" width={size === 'xs' ? 14 : 16} />
	</button>
{/if}
