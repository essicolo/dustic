<script lang="ts">
	import { library } from '$lib/stores/library';
	import { player } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { unifiedGetTrack as getTrack } from '$lib/services/sources';
	import { getItemMetadata } from '$lib/services/internetArchive';
	import type { Track, ArchiveItem, FavoriteType } from '$lib/types';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import AudioCard from '$lib/components/AudioCard.svelte';
	import SkeletonCard from '$lib/components/SkeletonCard.svelte';
	import { isOfflineAvailable } from '$lib/stores/offline';
	import { batchExecute } from '$lib/utils/throttle';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';

	let tracks: (Track | null)[] = [];
	let albums: (ArchiveItem | null)[] = [];
	let isLoading = false;
	let showOfflineOnly = false;
	let viewMode: 'grid' | 'list' = 'list';
	let filterType: 'all' | 'tracks' | 'albums' = 'all';

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

		const trackFavorites = favorites.filter((f) => f.type === 'track');
		const albumFavorites = favorites.filter((f) => f.type === 'album');

		// Load track data in batches
		const trackTasks = trackFavorites.map((f) => async () => {
			try {
				return await getTrack(f.id);
			} catch {
				return null;
			}
		});

		// Load album data in batches
		const albumTasks = albumFavorites.map((f) => async () => {
			try {
				const meta = await getItemMetadata(f.id);
				if (!meta) return null;
				return {
					identifier: meta.metadata.identifier,
					title: meta.metadata.title || 'Untitled',
					creator: Array.isArray(meta.metadata.creator) ? meta.metadata.creator[0] : meta.metadata.creator
				} as ArchiveItem;
			} catch {
				return null;
			}
		});

		const [loadedTracks, loadedAlbums] = await Promise.all([
			batchExecute(trackTasks, 3, 500),
			batchExecute(albumTasks, 3, 500)
		]);

		tracks = loadedTracks;
		albums = loadedAlbums;
		isLoading = false;
	}

	async function playAll() {
		const validTracks = tracks.filter((t): t is Track => t !== null);
		if (validTracks.length > 0) {
			queue.setQueue(validTracks, 0);
			player.play(validTracks[0]);
		}
	}

	function setViewMode(mode: 'grid' | 'list') {
		viewMode = mode;
		if (browser) {
			localStorage.setItem('favorites-view', mode);
		}
	}

	$: validTracks = tracks.filter((t): t is Track => t !== null);
	$: validAlbums = albums.filter((a): a is ArchiveItem => a !== null);
	$: filteredTracks = showOfflineOnly
		? validTracks.filter((t) => $isOfflineAvailable(t.identifier))
		: validTracks;
	$: trackCount = $library.favorites.filter((f) => f.type === 'track').length;
	$: albumCount = $library.favorites.filter((f) => f.type === 'album').length;
</script>

<div class="p-4 md:p-8">
	<div class="flex items-center justify-between mb-6">
		<h2 class="text-2xl md:text-3xl font-bold">Favorites</h2>
		<div class="flex items-center gap-2 md:gap-3">
			<button on:click={() => goto(`${base}/library`)} class="btn btn-ghost btn-sm">
				<Icon icon="solar:arrow-left-linear" width="18" />
				Back
			</button>
			{#if validTracks.length > 0 || validAlbums.length > 0}
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

				{#if filterType !== 'albums'}
					<label class="label cursor-pointer gap-2 hidden md:flex">
						<Icon icon="solar:download-minimalistic-bold" width="20" />
						<span class="label-text">Offline only</span>
						<input type="checkbox" bind:checked={showOfflineOnly} class="toggle toggle-primary" />
					</label>
				{/if}
				{#if filterType !== 'albums' && filteredTracks.length > 0}
					<button on:click={playAll} class="btn btn-primary btn-sm md:btn-md">
						<span class="hidden md:inline">Play All</span>
						<Icon icon="solar:play-bold" width="18" class="md:hidden" />
					</button>
				{/if}
			{/if}
		</div>
	</div>

	<!-- Filter Tabs -->
	{#if trackCount > 0 && albumCount > 0}
		<div class="tabs tabs-boxed mb-4 w-fit">
			<button class="tab" class:tab-active={filterType === 'all'} on:click={() => (filterType = 'all')}>
				All ({trackCount + albumCount})
			</button>
			<button class="tab" class:tab-active={filterType === 'tracks'} on:click={() => (filterType = 'tracks')}>
				Tracks ({trackCount})
			</button>
			<button class="tab" class:tab-active={filterType === 'albums'} on:click={() => (filterType = 'albums')}>
				Albums ({albumCount})
			</button>
		</div>
	{/if}

	<!-- Mobile: Offline toggle -->
	{#if validTracks.length > 0 && filterType !== 'albums'}
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
	{:else if validTracks.length === 0 && validAlbums.length === 0}
		<div class="text-center py-20 text-base-content/50">
			<p class="text-lg">No favorites yet</p>
			<p class="text-sm mt-2">Add tracks or albums to your favorites to see them here</p>
		</div>
	{:else}
		<!-- Albums Section -->
		{#if (filterType === 'all' || filterType === 'albums') && validAlbums.length > 0}
			{#if filterType === 'all'}
				<h3 class="text-lg font-semibold mb-3">Albums</h3>
			{/if}
			{#if viewMode === 'grid'}
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
					{#each validAlbums as album (album.identifier)}
						<AudioCard item={album} type="album" layout="tile" />
					{/each}
				</div>
			{:else}
				<div class="space-y-2 mb-8">
					{#each validAlbums as album (album.identifier)}
						<AudioCard item={album} type="album" layout="list" />
					{/each}
				</div>
			{/if}
		{/if}

		<!-- Tracks Section -->
		{#if (filterType === 'all' || filterType === 'tracks')}
			{#if filterType === 'all' && validTracks.length > 0 && validAlbums.length > 0}
				<h3 class="text-lg font-semibold mb-3">Tracks</h3>
			{/if}
			{#if filteredTracks.length === 0 && showOfflineOnly}
				<div class="text-center py-20 text-base-content/50">
					<p class="text-lg">No offline favorites</p>
					<p class="text-sm mt-2">Download some favorites to see them here</p>
				</div>
			{:else if viewMode === 'grid'}
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
					{#each filteredTracks as track (track.identifier)}
						<AudioCard item={{ ...track, tracks: [track] }} type="track" layout="tile" />
					{/each}
				</div>
			{:else}
				<div class="space-y-2">
					{#each filteredTracks as track (track.identifier)}
						<AudioCard item={{ ...track, tracks: [track] }} type="track" layout="list" />
					{/each}
				</div>
			{/if}
		{/if}
	{/if}
</div>
