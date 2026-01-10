<script lang="ts">
	import { page } from '$app/stores';
	import { getAllTracks, getItemMetadata } from '$lib/services/internetArchive';
	import { player, currentTrack } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { library } from '$lib/stores/library';
	import { offline } from '$lib/stores/offline';
	import type { Track } from '$lib/types';
	import Icon from '@iconify/svelte';
	import DownloadButton from '$lib/components/DownloadButton.svelte';
	import { onMount } from 'svelte';
	import { shareTrack } from '$lib/utils/share';
	import { goto } from '$app/navigation';

	let itemId = '';
	let tracks: Track[] = [];
	let itemMetadata: any = null;
	let isLoading = false;
	let error = '';
	let shareMessage = '';
	let showShareToast = false;
	let isDownloadingAll = false;

	$: itemId = $page.params.id || '';

	onMount(() => {
		if (itemId) {
			loadItem();
		}
	});

	async function loadItem() {
		isLoading = true;
		error = '';

		try {
			const [tracksData, metadata] = await Promise.all([
				getAllTracks(itemId),
				getItemMetadata(itemId)
			]);

			tracks = tracksData;
			itemMetadata = metadata.metadata;

			if (tracks.length === 0) {
				error = 'No audio files found in this item';
			}
		} catch (e) {
			console.error('Failed to load item:', e);
			error = 'Failed to load item. Please try again.';
		} finally {
			isLoading = false;
		}
	}

	async function playTrack(track: Track, index: number) {
		queue.setQueue(tracks, index);
		player.play(track);
	}

	async function playAll() {
		if (tracks.length > 0) {
			queue.setQueue(tracks, 0);
			player.play(tracks[0]);
		}
	}

	function toggleFavorite() {
		library.toggleFavorite(itemId);
	}

	async function handleShare(track: Track) {
		const result = await shareTrack(track);
		shareMessage = result.message;
		showShareToast = true;
		setTimeout(() => {
			showShareToast = false;
		}, 3000);
	}

	function isCurrentTrack(identifier: string): boolean {
		if (!$currentTrack) return false;
		// Handle chapter identifiers (format: "itemId#index")
		const currentId = $currentTrack.identifier.split('#')[0];
		const trackId = identifier.split('#')[0];
		return currentId === trackId;
	}

	function formatDuration(seconds?: number): string {
		if (!seconds) return '--:--';
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${String(secs).padStart(2, '0')}`;
	}

	function getTotalDuration(): string {
		const total = tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
		const hours = Math.floor(total / 3600);
		const mins = Math.floor((total % 3600) / 60);
		if (hours > 0) {
			return `${hours}h ${mins}m`;
		}
		return `${mins}m`;
	}

	async function downloadAll() {
		if (tracks.length === 0) return;
		isDownloadingAll = true;

		try {
			// Download all tracks sequentially
			for (const track of tracks) {
				await offline.downloadTrack(track);
			}
		} catch (e) {
			console.error('Failed to download all tracks:', e);
			error = 'Failed to download some tracks. Please try again.';
		} finally {
			isDownloadingAll = false;
		}
	}
</script>

<div class="p-4 md:p-8 max-w-6xl mx-auto">
	<!-- Back Button -->
	<button on:click={() => goto('/')} class="btn btn-ghost btn-sm mb-6">
		<Icon icon="solar:arrow-left-linear" width="20" />
		<span>Back</span>
	</button>

	{#if error}
		<div class="alert alert-error mb-4">
			<span>{error}</span>
		</div>
	{/if}

	{#if isLoading}
		<div class="flex justify-center items-center py-20">
			<span class="loading loading-spinner loading-lg text-primary"></span>
		</div>
	{:else if itemMetadata && tracks.length > 0}
		<!-- Item Header -->
		<div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
			<!-- Thumbnail -->
			<div class="md:col-span-1">
				{#if tracks[0].thumbnailUrl}
					<img
						src={tracks[0].thumbnailUrl}
						alt={itemMetadata.title}
						class="w-full aspect-square object-cover rounded-lg shadow-lg bg-base-300"
					/>
				{:else}
					<div
						class="w-full aspect-square flex items-center justify-center bg-base-300 rounded-lg shadow-lg"
					>
						<Icon icon="solar:music-note-bold" width="128" className="text-base-content/30" />
					</div>
				{/if}
			</div>

			<!-- Info -->
			<div class="md:col-span-2 flex flex-col justify-center">
				<h1 class="text-3xl md:text-4xl font-bold mb-3">{itemMetadata.title || 'Untitled'}</h1>

				{#if itemMetadata.creator}
					<p class="text-xl text-base-content/80 mb-4">
						{Array.isArray(itemMetadata.creator) ? itemMetadata.creator.join(', ') : itemMetadata.creator}
					</p>
				{/if}

				<!-- Stats -->
				<div class="flex flex-wrap gap-4 mb-4 text-sm text-base-content/70">
					<div class="flex items-center gap-2">
						<Icon icon="solar:music-library-2-bold" width="16" />
						<span>{tracks.length} track{tracks.length !== 1 ? 's' : ''}</span>
					</div>
					<div class="flex items-center gap-2">
						<Icon icon="solar:clock-circle-bold" width="16" />
						<span>{getTotalDuration()}</span>
					</div>
					{#if itemMetadata.date}
						<div class="flex items-center gap-2">
							<Icon icon="solar:calendar-bold" width="16" />
							<span>{itemMetadata.date}</span>
						</div>
					{/if}
					{#if itemMetadata.language}
						<div class="flex items-center gap-2">
							<Icon icon="solar:global-bold" width="16" />
							<span>{Array.isArray(itemMetadata.language) ? itemMetadata.language[0] : itemMetadata.language}</span>
						</div>
					{/if}
				</div>

				<!-- Description -->
				{#if itemMetadata.description}
					<div class="mb-6 text-sm text-base-content/70 max-w-2xl">
						<p class="line-clamp-3">
							{Array.isArray(itemMetadata.description) ? itemMetadata.description[0] : itemMetadata.description}
						</p>
					</div>
				{/if}

				<!-- Actions -->
				<div class="flex flex-wrap items-center gap-2">
					<button on:click={playAll} class="btn btn-primary gap-2">
						<Icon icon="solar:play-bold" width="20" />
						<span>Play All</span>
					</button>
					<button
						on:click={downloadAll}
						class="btn btn-outline gap-2"
						disabled={isDownloadingAll}
						title="Download all tracks for offline playback"
					>
						{#if isDownloadingAll}
							<span class="loading loading-spinner loading-sm"></span>
							<span>Downloading...</span>
						{:else}
							<Icon icon="solar:download-minimalistic-bold" width="20" />
							<span>Download All</span>
						{/if}
					</button>
					<button
						on:click={toggleFavorite}
						class="btn btn-ghost btn-circle"
						title={$library.favorites.includes(itemId) ? 'Remove from favorites' : 'Add to favorites'}
					>
						<Icon
							icon={$library.favorites.includes(itemId) ? 'solar:heart-bold' : 'solar:heart-linear'}
							width="24"
							className={$library.favorites.includes(itemId) ? 'text-red-500' : ''}
						/>
					</button>
					<button
						on:click={() => handleShare(tracks[0])}
						class="btn btn-ghost btn-circle"
						title="Share"
					>
						<Icon icon="solar:share-linear" width="24" />
					</button>
				</div>

				<!-- Description/Metadata -->
				{#if itemMetadata.description}
					<div class="mt-6">
						<p class="text-sm text-base-content/70 line-clamp-3">
							{Array.isArray(itemMetadata.description) ? itemMetadata.description[0] : itemMetadata.description}
						</p>
					</div>
				{/if}

				<!-- Subjects/Tags -->
				{#if itemMetadata.subject}
					{@const subjects = Array.isArray(itemMetadata.subject) ? itemMetadata.subject : [itemMetadata.subject]}
					<div class="flex flex-wrap gap-2 mt-4">
						{#each subjects.slice(0, 5) as subject}
							<span class="badge badge-sm">{subject}</span>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Track List -->
		<div class="card bg-base-200">
			<div class="card-body p-4">
				<h2 class="text-xl font-bold mb-4">Tracks</h2>
				<div class="space-y-1">
					{#each tracks as track, index}
						<div
							on:click={() => playTrack(track, index)}
							on:keydown={(e) => e.key === 'Enter' && playTrack(track, index)}
							role="button"
							tabindex="0"
							class="w-full text-left px-4 py-3 rounded-lg hover:bg-base-300 transition-colors flex items-center gap-4 group cursor-pointer {isCurrentTrack(track.identifier) ? 'bg-base-300 text-primary' : ''}"
						>
							<!-- Track Number / Play Icon -->
							<div class="w-8 text-center flex-shrink-0">
								{#if isCurrentTrack(track.identifier)}
									<Icon icon="solar:play-bold" width="20" className="text-primary" />
								{:else}
									<span class="text-base-content/50 group-hover:hidden">{index + 1}</span>
									<Icon icon="solar:play-linear" width="20" className="hidden group-hover:block" />
								{/if}
							</div>

							<!-- Title -->
							<div class="flex-1 min-w-0">
								<p class="font-medium truncate">{track.title}</p>
								{#if track.artist && track.artist !== itemMetadata.creator}
									<p class="text-sm text-base-content/60 truncate">{track.artist}</p>
								{/if}
							</div>

							<!-- Duration -->
							<div class="text-sm text-base-content/60 flex-shrink-0">
								{formatDuration(track.duration)}
							</div>

							<!-- Actions - Always visible on mobile, hover on desktop -->
							<div class="flex items-center gap-1 flex-shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
								<div on:click|stopPropagation on:keydown|stopPropagation role="none">
									<DownloadButton {track} size="sm" lazy={false} />
								</div>
								<button
									on:click|stopPropagation={() => queue.addToEnd(track)}
									class="btn btn-ghost btn-sm btn-circle"
									title="Add to queue"
								>
									<Icon icon="solar:add-circle-linear" width="18" />
								</button>
								<button
									on:click|stopPropagation={() => handleShare(track)}
									class="btn btn-ghost btn-sm btn-circle"
									title="Share"
								>
									<Icon icon="solar:share-linear" width="18" />
								</button>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Share Toast -->
	{#if showShareToast}
		<div class="toast toast-top toast-center z-50">
			<div class="alert alert-success">
				<Icon icon="solar:check-circle-bold" width="20" />
				<span>{shareMessage}</span>
			</div>
		</div>
	{/if}
</div>
