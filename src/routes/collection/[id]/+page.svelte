<script lang="ts">
	import { page } from '$app/stores';
	import { search as searchAPI } from '$lib/services/internetArchive';
	import { unifiedGetTrack as getTrack } from '$lib/services/sources';
	import { player, currentTrack } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { POPULAR_COLLECTIONS } from '$lib/utils/constants';
	import type { Track } from '$lib/types';
	import { onMount } from 'svelte';
	import Icon from '@iconify/svelte';
	import AudioCard from '$lib/components/AudioCard.svelte';
	import { offline } from '$lib/stores/offline';

	let downloadingIds = new Set<string>();

	async function lazyDownload(identifier: string) {
		if (downloadingIds.has(identifier)) return;
		downloadingIds.add(identifier);
		try {
			const track = await getTrack(identifier);
			if (track) {
				await offline.downloadTrack(track);
			}
		} catch (err) {
			console.error('Lazy download failed:', err);
		} finally {
			downloadingIds.delete(identifier);
			downloadingIds = new Set(downloadingIds);
		}
	}
	import PlayingIndicator from '$lib/components/PlayingIndicator.svelte';
	import SkeletonCard from '$lib/components/SkeletonCard.svelte';
	import { batchExecute } from '$lib/utils/throttle';

	let collectionId = '';
	let collectionInfo: { name: string; icon: string } | null = null;
	let results: Track[] = [];
	let isLoading = false;
	let error = '';
	let loadingTrack: string | null = null;
	let currentPage = 1;
	let totalResults = 0;
	let failedImages = new Set<string>(); // Track failed image loads

	function handleImageError(identifier: string) {
		failedImages.add(identifier);
		failedImages = failedImages; // Trigger reactivity
	}
	let sortBy: 'downloads' | 'date' | 'relevance' = 'downloads';
	let viewMode: 'tiles' | 'list' = 'tiles';

	$: collectionId = $page.params.id || '';
	$: collectionInfo =
		POPULAR_COLLECTIONS.find((c) => c.id === collectionId) || { name: collectionId, icon: '📁' };

	onMount(() => {
		const savedView = localStorage.getItem(`collection-view-${collectionId}`);
		if (savedView === 'tiles' || savedView === 'list') {
			viewMode = savedView;
		}
		loadCollection();
	});

	function setViewMode(mode: 'tiles' | 'list') {
		viewMode = mode;
		localStorage.setItem(`collection-view-${collectionId}`, mode);
	}

	async function loadCollection() {
		isLoading = true;
		error = '';

		try {
			const result = await searchAPI({
				query: `collection:${collectionId}`,
				sort: sortBy,
				page: currentPage,
				pageSize: 50
			});
			results = result.items;
			totalResults = result.total;
		} catch (e) {
			error = 'Failed to load collection.';
			console.error(e);
		} finally {
			isLoading = false;
		}
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
			error = 'Failed to load track. Please try another.';
		} finally {
			loadingTrack = null;
		}
	}

	async function addToQueue(identifier: string) {
		loadingTrack = identifier;
		try {
			const track = await getTrack(identifier);
			if (track) {
				queue.addToEnd(track);
			}
		} catch (e) {
			console.error('Failed to add track:', e);
		} finally {
			loadingTrack = null;
		}
	}

	async function playAll() {
		if (results.length === 0) return;

		// Load tracks in batches to avoid rate limiting
		const trackTasks = results.slice(0, 20).map((item) => async () => {
			try {
				return await getTrack(item.identifier);
			} catch {
				return null;
			}
		});

		// Execute in batches of 3 with 500ms delay between batches
		const tracks = await batchExecute(trackTasks, 3, 500);

		const validTracks = tracks.filter((t): t is Track => t !== null);
		if (validTracks.length > 0) {
			queue.setQueue(validTracks, 0);
			player.play(validTracks[0]);
		}
	}

	function nextPage() {
		currentPage++;
		loadCollection();
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function prevPage() {
		if (currentPage > 1) {
			currentPage--;
			loadCollection();
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}

	function isCurrentTrack(identifier: string): boolean {
		if (!$currentTrack) return false;
		// Handle chapter identifiers (format: "itemId#index")
		const currentId = $currentTrack.identifier.split('#')[0];
		const trackId = identifier.split('#')[0];
		return currentId === trackId;
	}

	$: totalPages = Math.ceil(totalResults / 50);
	$: if (collectionId || sortBy) {
		currentPage = 1;
		loadCollection();
	}
</script>

<div class="p-4 md:p-8">
	<div class="flex items-center justify-between mb-6">
		<div>
			<h2 class="text-3xl font-bold">
				{#if collectionInfo}
					{collectionInfo.name}
				{/if}
			</h2>
			{#if totalResults > 0}
				<p class="text-sm text-base-content/70 mt-1">
					{totalResults.toLocaleString()} items
				</p>
			{/if}
		</div>
		{#if results.length > 0}
			<button on:click={playAll} class="btn btn-primary">
				Play All
			</button>
		{/if}
	</div>

	<!-- Controls -->
	<div class="flex items-center justify-between mb-6">
		<!-- Sort Options -->
		<div class="flex items-center gap-2">
			<span class="text-sm text-base-content/70">Sort:</span>
			<div class="btn-group">
				<button
					on:click={() => (sortBy = 'downloads')}
					class="btn btn-sm {sortBy === 'downloads' ? 'btn-active' : ''}"
				>
					Popular
				</button>
				<button
					on:click={() => (sortBy = 'date')}
					class="btn btn-sm {sortBy === 'date' ? 'btn-active' : ''}"
				>
					Newest
				</button>
				<button
					on:click={() => (sortBy = 'relevance')}
					class="btn btn-sm {sortBy === 'relevance' ? 'btn-active' : ''}"
				>
					Relevance
				</button>
			</div>
		</div>
		<!-- View Mode Toggle -->
		<div class="btn-group">
			<button
				on:click={() => setViewMode('tiles')}
				class="btn btn-sm btn-ghost {viewMode === 'tiles' ? 'btn-active' : ''}"
				title="Tiles view"
			>
				<Icon icon="solar:widget-5-bold" width="18" />
			</button>
			<button
				on:click={() => setViewMode('list')}
				class="btn btn-sm btn-ghost {viewMode === 'list' ? 'btn-active' : ''}"
				title="List view"
			>
				<Icon icon="solar:list-bold" width="18" />
			</button>
		</div>
	</div>

	{#if error}
		<div class="alert alert-error mb-4">
			<span>{error}</span>
		</div>
	{/if}

	{#if isLoading}
		<!-- Skeleton loaders -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
			{#each Array(12) as _}
				<SkeletonCard layout="grid" />
			{/each}
		</div>
	{:else if results.length > 0}
		{#if viewMode === 'tiles'}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
				{#each results as item}
					<AudioCard
						item={{ ...(item as any), creator: item.artist }}
						type="album"
						layout="tile"
					/>
				{/each}
			</div>
		{:else}
			<div class="space-y-2 mb-6">
				{#each results as item}
					<AudioCard
						item={{ ...(item as any), creator: item.artist }}
						type="album"
						layout="list"
					/>
				{/each}
			</div>
		{/if}

		<!-- Pagination -->
		{#if totalPages > 1}
			<div class="flex items-center justify-center gap-2">
				<button
					on:click={prevPage}
					disabled={currentPage === 1 || isLoading}
					class="btn btn-sm"
				>
					← Previous
				</button>
				<span class="text-sm">
					Page {currentPage} of {totalPages}
				</span>
				<button
					on:click={nextPage}
					disabled={currentPage >= totalPages || isLoading}
					class="btn btn-sm"
				>
					Next →
				</button>
			</div>
		{/if}
	{:else}
		<div class="text-center py-20 text-base-content/50">
			<p class="text-lg">No items found in this collection</p>
		</div>
	{/if}
</div>
