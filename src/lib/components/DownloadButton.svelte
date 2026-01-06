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
		if (status === 'downloading') return; // Already downloading

		// If already downloaded, allow re-download without confirmation
		await offline.downloadTrack(track);
	}
</script>

{#if status === 'downloading'}
	<!-- Downloading state - subtle progress indicator -->
	<button class="btn btn-{size} btn-circle btn-ghost relative touch-target" disabled title="Downloading... {progress}%">
		<div class="radial-progress text-[10px]" style="--value:{progress}; --size:1.25rem; --thickness: 2px;">
			<Icon icon="solar:download-minimalistic-linear" width={size === 'xs' ? 12 : 14} className="text-base-content/50" />
		</div>
	</button>
{:else if isOffline}
	<!-- Downloaded state - subtle filled icon with small checkmark -->
	<button
		on:click={handleDownload}
		class="btn btn-{size} btn-circle btn-ghost relative overflow-visible touch-target"
		title="Downloaded - Click to re-download"
	>
		<Icon icon="solar:download-minimalistic-bold" width={size === 'xs' ? 14 : 16} className="text-base-content" />
		<div class="absolute top-1 right-1 w-3 h-3 bg-success rounded-full flex items-center justify-center">
			<Icon icon="solar:check-circle-bold" width="10" className="text-success-content" />
		</div>
	</button>
{:else}
	<!-- Not downloaded state - subtle outline icon -->
	<button
		on:click={handleDownload}
		class="btn btn-{size} btn-circle btn-ghost touch-target"
		title="Download for offline"
	>
		<Icon icon="solar:download-minimalistic-linear" width={size === 'xs' ? 14 : 16} className="text-base-content/50" />
	</button>
{/if}

<style>
	/* Increase touch target on mobile using padding */
	@media (max-width: 768px) {
		.touch-target {
			/* Add invisible padding to expand click area */
			padding: 0.5rem;
			/* Compensate with negative margin to keep visual position */
			margin: -0.5rem;
			/* Ensure it's clickable */
			min-width: 44px;
			min-height: 44px;
		}
	}
</style>
