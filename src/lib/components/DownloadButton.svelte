<script lang="ts">
	import { offline, isOfflineAvailable } from '$lib/stores/offline';
	import type { Track, ArchiveItem } from '$lib/types';
	import Icon from '@iconify/svelte';
	import { getTrack } from '$lib/services/internetArchive';

	export let track: Track | ArchiveItem;
	export let size: 'xs' | 'sm' | 'md' = 'sm';
	export let lazy = false;
	export let showText = false;
	export let className = '';

	let progress = 0;
	let status: 'idle' | 'downloading' | 'completed' | 'error' | 'fetching' = 'idle';
	let fullTrack: Track | null = lazy ? null : (track as Track);

	$: identifier = track.identifier;
	$: isOffline = $isOfflineAvailable(identifier);
	$: downloadProgress = $offline.downloadQueue.get(identifier);

	$: {
		if (downloadProgress) {
			progress = downloadProgress.progress;
			status = downloadProgress.status;
		} else {
			status = isOffline ? 'completed' : 'idle';
		}
	}

	async function handleDownload() {
		if (status === 'downloading' || status === 'fetching') return;

		if (!fullTrack && lazy) {
			status = 'fetching';
			try {
				fullTrack = await getTrack(identifier);
			} catch (err) {
				console.error('Failed to fetch track details for download', err);
				status = 'error';
				return;
			}
		}

		if (fullTrack) {
			await offline.downloadTrack(fullTrack);
		} else {
			console.warn('No track data available to start download');
		}
	}
</script>

{#if status === 'fetching'}
	<button class="btn btn-{size} btn-ghost {className}" class:btn-circle={!showText} disabled title="Preparing download...">
		<span class="loading loading-spinner text-primary"></span>
		{#if showText}
			<span>Preparing...</span>
		{/if}
	</button>
{:else if status === 'downloading'}
	<!-- Downloading state - subtle progress indicator -->
	<button
		class="btn btn-{size} btn-ghost relative {className}"
		class:btn-circle={!showText}
		disabled
		title="Downloading... {progress}%"
	>
		{#if !showText}
			<div
				class="radial-progress text-xs"
				style="--value:{progress}; --size:1.5rem; --thickness: 2px;"
			>
				<Icon icon="solar:download-minimalistic-linear" width={size === 'xs' ? 14 : 16} />
			</div>
		{:else}
			<Icon icon="solar:download-minimalistic-linear" width={size === 'xs' ? 14 : 16} />
			<span>Downloading...</span>
			<progress class="progress progress-primary w-12" value={progress} max="100"></progress>
		{/if}
	</button>
{:else if status === 'completed'}
	<!-- Downloaded state - subtle filled icon -->
	<button
		on:click|stopPropagation={handleDownload}
		class="btn btn-{size} btn-ghost {className}"
		class:btn-circle={!showText}
		title="Downloaded - Click to re-download"
	>
		<Icon
			icon="solar:download-minimalistic-bold"
			width={size === 'xs' ? 14 : 16}
			class="text-primary"
		/>
		{#if showText}
			<span>Downloaded</span>
		{/if}
	</button>
{:else if status === 'error'}
	<button
		class="btn btn-{size} btn-ghost {className}"
		class:btn-circle={!showText}
		disabled
		title="Download failed"
	>
		<Icon
			icon="solar:danger-triangle-linear"
			width={size === 'xs' ? 14 : 16}
			class="text-error"
		/>
		{#if showText}
			<span>Error</span>
		{/if}
	</button>
{:else}
	<!-- Not downloaded state - subtle outline icon -->
	<button
		on:click|stopPropagation={handleDownload}
		class="btn btn-{size} btn-ghost {className}"
		class:btn-circle={!showText}
		title="Download for offline"
	>
		<Icon icon="solar:download-minimalistic-linear" width={size === 'xs' ? 14 : 16} />
		{#if showText}
			<span>Download</span>
		{/if}
	</button>
{/if}

