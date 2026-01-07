<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { library } from '$lib/stores/library';
	import { queue } from '$lib/stores/queue';
	import { player } from '$lib/stores/player';
	import type { Track } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';
	import DownloadButton from '$lib/components/DownloadButton.svelte';
	import { shareTrack } from '$lib/utils/share';

	export let item: {
		identifier: string;
		title: string;
		artist?: string;
		thumbnailUrl?: string;
		trackCount?: number;
		tracks?: Track[];
	};
	export let type: 'album' | 'track' = 'album';
	export let showActions: boolean = true;
	export let layout: 'tile' | 'list' = 'tile';

	let showPlaylistSelector = false;
	let showShareToast = false;
	let shareMessage = '';

	$: isFavorite = $library.favorites.includes(item.identifier);
	$: playlists = Object.values($library.playlists).sort((a, b) => b.updated - a.updated);

	function handleClick() {
		if (type === 'album') {
			goto(`${base}/item/${item.identifier}`);
		} else if (type === 'track' && item.tracks && item.tracks[0]) {
			playTrack(item.tracks[0]);
		}
	}

	function playTrack(track: Track) {
		if (item.tracks) {
			queue.setQueue(item.tracks, 0);
		}
		player.play(track);
	}

	function toggleFavorite(e: Event) {
		e.stopPropagation();
		library.toggleFavorite(item.identifier);
	}

	function togglePlaylistSelector(e: Event) {
		e.stopPropagation();
		showPlaylistSelector = !showPlaylistSelector;
	}

	function addToPlaylist(playlistId: string, e: Event) {
		e.stopPropagation();
		library.addToPlaylist(playlistId, item.identifier);
		showPlaylistSelector = false;
	}

	async function handleShare(e: Event) {
		e.stopPropagation();
		if (item.tracks && item.tracks[0]) {
			const result = await shareTrack(item.tracks[0]);
			shareMessage = result.message;
			showShareToast = true;
			setTimeout(() => {
				showShareToast = false;
			}, 3000);
		}
	}

	function handleAddToQueue(e: Event) {
		e.stopPropagation();
		if (item.tracks && item.tracks[0]) {
			queue.addToEnd(item.tracks[0]);
		}
	}
</script>

<script lang="ts">
	// compute classes for layout
	$: containerClass =
		layout === 'list'
			? 'card card-side bg-base-200 hover:bg-base-300 transition-all duration-200 cursor-pointer group items-center'
			: 'card bg-base-200 hover:bg-base-300 transition-all duration-200 cursor-pointer group';

</script>

<div
	class={containerClass}
	on:click={handleClick}
	on:keydown={(e) => e.key === 'Enter' && handleClick()}
	role="button"
	tabindex="0"
>
	<!-- Thumbnail -->
	{#if layout === 'list'}
		<figure class="relative w-24 h-24 flex-shrink-0">
			{#if item.thumbnailUrl}
				<img src={item.thumbnailUrl} alt={item.title} class="w-full h-full object-cover rounded" loading="lazy" />
			{:else}
				<div class="w-full h-full flex items-center justify-center bg-base-300 rounded">
					<Icon icon="solar:music-note-bold" width="48" className="text-base-content/30" />
				</div>
			{/if}

			{#if showActions}
				<div class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded">
					<button
						on:click|stopPropagation={() => item.tracks && item.tracks[0] && playTrack(item.tracks[0])}
						class="btn btn-circle btn-primary btn-sm"
					>
						<Icon icon="solar:play-bold" width="20" className="text-primary-content" />
					</button>
				</div>
			{/if}
		</figure>
	{:else}
		<figure class="relative aspect-square">
			{#if item.thumbnailUrl}
				<img
					src={item.thumbnailUrl}
					alt={item.title}
					class="w-full h-full object-cover"
					loading="lazy"
				/>
			{:else}
				<div class="w-full h-full flex items-center justify-center bg-base-300">
					<Icon icon="solar:music-note-bold" width="64" className="text-base-content/30" />
				</div>
			{/if}
            
			{#if showActions}
				<!-- Play button overlay -->
				<div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
					<button
						on:click|stopPropagation={() => item.tracks && item.tracks[0] && playTrack(item.tracks[0])}
						class="btn btn-circle btn-primary btn-lg"
					>
						<Icon icon="solar:play-bold" width="32" className="text-primary-content" />
					</button>
				</div>
			{/if}
		</figure>
	{/if}

	<div class="card-body p-4">
		<!-- Title & Artist -->
		<h3 class="card-title text-base line-clamp-1">{item.title}</h3>
		{#if item.artist}
			<p class="text-sm text-base-content/70 line-clamp-1">{item.artist}</p>
		{/if}
		{#if item.trackCount !== undefined}
			<p class="text-xs text-base-content/50">{item.trackCount} track{item.trackCount !== 1 ? 's' : ''}</p>
		{/if}

		{#if showActions}
			<!-- Actions -->
			<div class="card-actions justify-end mt-2 gap-1">
				<!-- Favorite -->
				<button
					on:click={toggleFavorite}
					class="btn btn-ghost btn-sm btn-circle"
					title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
				>
					<Icon
						icon={isFavorite ? 'solar:heart-bold' : 'solar:heart-linear'}
						width="18"
						className={isFavorite ? 'text-red-500' : ''}
					/>
				</button>

				<!-- Add to Playlist -->
				<div class="relative">
					<button
						on:click={togglePlaylistSelector}
						class="btn btn-ghost btn-sm btn-circle"
						title="Add to playlist"
					>
						<Icon icon="solar:add-circle-linear" width="18" />
					</button>

					{#if showPlaylistSelector}
						<div
							class="absolute bottom-full right-0 mb-2 w-48 bg-base-100 rounded-lg shadow-xl z-20 border border-base-content/10 max-h-60 overflow-y-auto"
							on:click|stopPropagation
							on:keydown|stopPropagation
							role="none"
						>
							{#if playlists.length === 0}
								<div class="p-3 text-center text-sm text-base-content/50">
									<p class="mb-2">No playlists yet</p>
									<a
										href="{base}/library/playlists"
										class="btn btn-primary btn-xs"
										on:click|stopPropagation
									>
										Create Playlist
									</a>
								</div>
							{:else}
								{#each playlists as playlist}
									<button
										on:click={(e) => addToPlaylist(playlist.id, e)}
										class="w-full text-left px-3 py-2 hover:bg-base-300 text-sm flex items-center justify-between gap-2"
									>
										<span class="truncate">{playlist.name}</span>
										<span class="text-xs text-base-content/50">{playlist.tracks.length}</span>
									</button>
								{/each}
								<div class="border-t border-base-content/10">
									<a
										href="{base}/library/playlists"
										class="w-full text-left px-3 py-2 hover:bg-base-300 text-sm flex items-center gap-2 text-primary"
										on:click|stopPropagation
									>
										<Icon icon="solar:add-circle-bold" width="14" />
										<span>New Playlist</span>
									</a>
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Add to Queue -->
				{#if type === 'track'}
					<button
						on:click={handleAddToQueue}
						class="btn btn-ghost btn-sm btn-circle"
						title="Add to queue"
					>
						<Icon icon="solar:playlist-minimalistic-2-linear" width="18" />
					</button>
				{/if}

				<!-- Download -->
				{#if item.tracks && item.tracks[0]}
					<div on:click|stopPropagation on:keydown|stopPropagation role="none">
						<DownloadButton track={item.tracks[0]} size="sm" />
					</div>
				{/if}

				<!-- Share -->
				<button
					on:click={handleShare}
					class="btn btn-ghost btn-sm btn-circle"
					title="Share"
				>
					<Icon icon="solar:share-linear" width="18" />
				</button>
			</div>
		{/if}

		<!-- Extra actions slot (for page-specific controls like remove from history) -->
		<slot name="extra-actions" />
	</div>
</div>

<!-- Share Toast -->
{#if showShareToast}
	<div class="toast toast-top toast-center z-50">
		<div class="alert alert-success">
			<Icon icon="solar:check-circle-bold" width="20" />
			<span>{shareMessage}</span>
		</div>
	</div>
{/if}

<!-- Click outside to close playlist selector -->
{#if showPlaylistSelector}
	<div
		class="fixed inset-0 z-10"
		on:click={() => (showPlaylistSelector = false)}
		on:keydown={(e) => e.key === 'Escape' && (showPlaylistSelector = false)}
		role="button"
		tabindex="-1"
		aria-label="Close playlist selector"
	></div>
{/if}
