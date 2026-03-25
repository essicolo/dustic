<script lang="ts">
	import { library } from '$lib/stores/library';
	import { player, currentTrack } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { unifiedGetTrack as getTrack } from '$lib/services/sources';
	import type { Track } from '$lib/types';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import DownloadButton from '$lib/components/DownloadButton.svelte';
	import AudioCard from '$lib/components/AudioCard.svelte';
	import PlayingIndicator from '$lib/components/PlayingIndicator.svelte';
	import SkeletonCard from '$lib/components/SkeletonCard.svelte';
	import { isOfflineAvailable } from '$lib/stores/offline';
	import { batchExecute } from '$lib/utils/throttle';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';

	let tracks: (Track | null)[] = [];
	let isLoading = false;
	let loadingTrack: string | null = null;
	let showOfflineOnly = false;
	let viewMode: 'grid' | 'list' = 'list';
	let failedImages = new Set<string>(); // Track failed image loads

	function handleImageError(identifier: string) {
		failedImages.add(identifier);
		failedImages = failedImages; // Trigger reactivity
	}

	// Load view preference from localStorage
	onMount(() => {
		if (browser) {
			const savedView = localStorage.getItem('favorites-view');
			if (savedView === 'grid' || savedView === 'list') {
				viewMode = savedView;
			}
		}
	});

	onMount(() => {
		loadFavorites();
	});

	async function loadFavorites() {
		isLoading = true;
		const favorites = $library.favorites;

		// Load track data in batches to avoid rate limiting
		const trackTasks = favorites.map((id) => async () => {
			try {
				return await getTrack(id);
			} catch {
				return null;
			}
		});

		// Execute in batches of 3 with 500ms delay between batches
		const loadedTracks = await batchExecute(trackTasks, 3, 500);

		tracks = loadedTracks;
		isLoading = false;
	}

	async function playTrack(identifier: string) {
		loadingTrack = identifier;
		try {
			const track = await getTrack(identifier);
			if (track) {
				queue.setQueue([track], 0);
				player.play(track);
			}
		} catch (e) {
			console.error('Failed to play track:', e);
		} finally {
			loadingTrack = null;
		}
	}

	async function playAll() {
		const validTracks = tracks.filter((t): t is Track => t !== null);
		if (validTracks.length > 0) {
			queue.setQueue(validTracks, 0);
			player.play(validTracks[0]);
		}
	}

	function removeFavorite(trackId: string) {
		library.toggleFavorite(trackId);
		tracks = tracks.filter((t) => t?.identifier !== trackId);
	}

	function isCurrentTrack(identifier: string): boolean {
		if (!$currentTrack) return false;
		// Handle chapter identifiers (format: "itemId#index")
		const currentId = $currentTrack.identifier.split('#')[0];
		const trackId = identifier.split('#')[0];
		return currentId === trackId;
	}

	function setViewMode(mode: 'grid' | 'list') {
		viewMode = mode;
		if (browser) {
			localStorage.setItem('favorites-view', mode);
		}
	}

	$: validTracks = tracks.filter((t): t is Track => t !== null);
	$: filteredTracks = showOfflineOnly
		? validTracks.filter((t) => $isOfflineAvailable(t.identifier))
		: validTracks;
</script>

<div class="p-4 md:p-8">
	<div class="flex items-center justify-between mb-6">
		<h2 class="text-2xl md:text-3xl font-bold">Favorites</h2>
		<div class="flex items-center gap-2 md:gap-3">
			<button on:click={() => goto(`${base}/library`)} class="btn btn-ghost btn-sm">
				<Icon icon="solar:arrow-left-linear" width="18" />
				Back
			</button>
			{#if validTracks.length > 0}
				<!-- View Mode Toggle -->
				<div class="btn-group">
					<button
						on:click={() => setViewMode('grid')}
						class="btn btn-sm"
						class:btn-active={viewMode === 'grid'}
						title="Grid view"
					>
						<Icon icon="solar:widget-5-bold" width="18" />
					</button>
					<button
						on:click={() => setViewMode('list')}
						class="btn btn-sm"
						class:btn-active={viewMode === 'list'}
						title="List view"
					>
						<Icon icon="solar:list-bold" width="18" />
					</button>
				</div>

				<label class="label cursor-pointer gap-2 hidden md:flex">
					<Icon icon="solar:download-minimalistic-bold" width="20" />
					<span class="label-text">Offline only</span>
					<input type="checkbox" bind:checked={showOfflineOnly} class="toggle toggle-primary" />
				</label>
				<button on:click={playAll} class="btn btn-primary btn-sm md:btn-md">
					<span class="hidden md:inline">Play All</span>
					<Icon icon="solar:play-bold" width="18" class="md:hidden" />
				</button>
			{/if}
		</div>
	</div>

	<!-- Mobile: Offline toggle -->
	{#if validTracks.length > 0}
		<div class="md:hidden mb-4">
			<label class="label cursor-pointer gap-2 justify-start">
				<input type="checkbox" bind:checked={showOfflineOnly} class="toggle toggle-primary" />
				<Icon icon="solar:download-minimalistic-bold" width="20" />
				<span class="label-text">Offline only</span>
			</label>
		</div>
	{/if}

	{#if isLoading}
		<!-- Skeleton loaders matching current view mode -->
		{#if viewMode === 'grid'}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
				{#each Array(8) as _}
					<SkeletonCard layout="grid" />
				{/each}
			</div>
		{:else}
			<div class="space-y-2">
				{#each Array(8) as _}
					<SkeletonCard layout="list" />
				{/each}
			</div>
		{/if}
	{:else if validTracks.length === 0}
		<div class="text-center py-20 text-base-content/50">
			<p class="text-lg">No favorites yet</p>
			<p class="text-sm mt-2">Add tracks to your favorites to see them here</p>
		</div>
	{:else if filteredTracks.length === 0}
		<div class="text-center py-20 text-base-content/50">
			<p class="text-lg">No offline favorites</p>
			<p class="text-sm mt-2">Download some favorites to see them here</p>
		</div>
	{:else if viewMode === 'grid'}
		<!-- Grid View -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
			{#each filteredTracks as track (track.identifier)}
				<AudioCard item={{ ...track, tracks: [track] }} type="track" layout="tile">
					<div slot="extra-actions" class="flex items-center gap-2">
						<button
							on:click={() => removeFavorite(track.identifier)}
							class="btn btn-ghost btn-sm btn-circle ml-auto"
							title="Remove from favorites"
						>
							<Icon icon="solar:heart-bold" width="16" className="text-red-500" />
						</button>
					</div>
				</AudioCard>
			{/each}
		</div>
	{:else}
		<!-- List View -->
		<div class="space-y-2">
			{#each filteredTracks as track (track.identifier)}
				<AudioCard item={{ ...track, tracks: [track] }} type="track" layout="list">
					<div slot="extra-actions" class="ml-auto flex items-center gap-2">
						<button
							on:click={() => playTrack(track.identifier)}
							class="btn btn-sm"
							class:btn-primary={!isCurrentTrack(track.identifier)}
							class:btn-ghost={isCurrentTrack(track.identifier)}
							disabled={loadingTrack === track.identifier}
						>
							{#if loadingTrack === track.identifier}
								<span class="loading loading-spinner loading-xs"></span>
							{:else if isCurrentTrack(track.identifier)}
								<Icon icon="solar:pause-bold" width="16" />
							{:else}
								<Icon icon="solar:play-bold" width="16" />
							{/if}
						</button>
						<button
							on:click={() => removeFavorite(track.identifier)}
							class="btn btn-ghost btn-sm"
							title="Remove from favorites"
						>
							<Icon icon="solar:close-circle-linear" width="16" />
						</button>
					</div>
				</AudioCard>
			{/each}
		</div>
	{/if}
</div>
