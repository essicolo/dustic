<script lang="ts">
	import { offline, isOfflineAvailable } from '$lib/stores/offline';
	import type { Track, ArchiveItem } from '$lib/types';
	import Icon from '@iconify/svelte';
	import { unifiedGetTrack as getTrack } from '$lib/services/sources';
	import { _ } from '$lib/i18n';

	export let track: Track | ArchiveItem;
	export let size: 'xs' | 'sm' | 'md' = 'sm';
	export let lazy = false;
	export let showLabel = false;
	export let className = '';

	let progress = 0;
	let status: 'idle' | 'downloading' | 'completed' | 'error' | 'fetching' = 'idle';
	let fullTrack: Track | null = lazy ? null : (track as Track);

	// Keep `fullTrack` in sync with the `track` prop for non-lazy mode.
	// Without this, the DownloadButton in PlayerBar captures whatever track
	// was current at first mount (e.g. the restored lastPlayedTrack) and
	// downloads *that* on every click, regardless of what's actually playing.
	$: if (!lazy) fullTrack = track as Track;

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
	<button class="btn btn-{size} btn-ghost {showLabel ? '' : 'btn-circle'} {className}" disabled title={$_('components.download.preparing')}>
		<span class="loading loading-spinner text-primary"></span>
		{#if showLabel}<span>{$_('components.download.preparingLabel')}</span>{/if}
	</button>
{:else if status === 'downloading'}
	<!-- Downloading state - subtle progress indicator -->
	<button class="btn btn-{size} btn-ghost relative {showLabel ? '' : 'btn-circle'} {className}" disabled title={$_('components.download.downloading', { values: { percent: progress } })}>
		<div class="radial-progress text-xs" style="--value:{progress}; --size:1.5rem; --thickness: 2px;">
			<Icon icon="solar:download-minimalistic-linear" width={size === 'xs' ? 14 : 16} />
		</div>
		{#if showLabel}<span>{$_('components.download.downloadingLabel', { values: { percent: Math.round(progress) } })}</span>{/if}
	</button>
{:else if status === 'completed'}
	<!-- Downloaded state - subtle filled icon -->
	<button
		on:click|stopPropagation={handleDownload}
		class="btn btn-{size} btn-ghost {showLabel ? '' : 'btn-circle'} {className}"
		title={$_('components.download.downloadedTitle')}
	>
		<Icon icon="solar:check-circle-bold" width={size === 'xs' ? 14 : 16} class="text-success" />
		{#if showLabel}<span>{$_('components.download.downloadedLabel')}</span>{/if}
	</button>
{:else if status === 'error'}
	<button class="btn btn-{size} btn-ghost {showLabel ? '' : 'btn-circle'} {className}" disabled title={$_('components.download.failedTitle')}>
		<Icon icon="solar:danger-triangle-linear" width={size === 'xs' ? 14 : 16} class="text-error" />
		{#if showLabel}<span>{$_('components.download.errorLabel')}</span>{/if}
	</button>
{:else}
	<!-- Not downloaded state - subtle outline icon -->
	<button
		on:click|stopPropagation={handleDownload}
		class="btn btn-{size} btn-ghost {showLabel ? '' : 'btn-circle'} {className}"
		title={$_('components.download.forOffline')}
	>
		<Icon icon="solar:download-minimalistic-linear" width={size === 'xs' ? 14 : 16} />
		{#if showLabel}<span>{$_('components.download.downloadLabel')}</span>{/if}
	</button>
{/if}

