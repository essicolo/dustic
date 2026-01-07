<script lang="ts">
	import { page } from '$app/stores';
	import { search as searchAPI, getTrack } from '$lib/services/internetArchive';
	import { player, currentTrack } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { POPULAR_COLLECTIONS } from '$lib/utils/constants';
	import type { Track } from '$lib/types';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
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
	let sortBy: 'downloads' | 'date' | 'title' = 'downloads';

	$: collectionId = $page.params.id || '';
	$: collectionInfo =
		POPULAR_COLLECTIONS.find((c) => c.id === collectionId) || { name: collectionId, icon: '📁' };

	onMount(() => {
		loadCollection();
	});

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

<div class="p-8">
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

	<!-- Sort Options -->
	<div class="mb-6 flex items-center gap-2">
		<span class="text-sm text-base-content/70">Sort:</span>
		<div class="btn-group">
			<button
				on:click={() => (sortBy = 'downloads')}
				class="btn btn-sm"
				class:btn-active={sortBy === 'downloads'}
			>
				Popular
			</button>
			<button
				on:click={() => (sortBy = 'date')}
				class="btn btn-sm"
				class:btn-active={sortBy === 'date'}
			>
				Newest
			</button>
			<button
				on:click={() => (sortBy = 'title')}
				class="btn btn-sm"
				class:btn-active={sortBy === 'title'}
			>
				A-Z
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
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
			{#each results as item}
				<AudioCard item={item} type="album" showActions={true} layout="tile">
					<div slot="extra-actions" class="flex items-center gap-1 ml-auto">
						<button
							on:click={() => playTrack(item.identifier)}
							class="btn btn-ghost btn-sm btn-circle"
							disabled={loadingTrack === item.identifier}
							title={isCurrentTrack(item.identifier) ? 'Playing' : 'Play'}
						>
							{#if loadingTrack === item.identifier}
								<span class="loading loading-spinner loading-sm"></span>
							{:else if isCurrentTrack(item.identifier)}
								<Icon icon="solar:pause-bold" width="18" />
							{:else}
								<Icon icon="solar:play-bold" width="18" />
							{/if}
						</button>
						<button
							on:click={() => addToQueue(item.identifier)}
							class="btn btn-ghost btn-sm btn-circle"
							disabled={loadingTrack === item.identifier}
							title="Add to queue"
						>
							<Icon icon="solar:add-circle-linear" width="18" />
						</button>

						<!-- Lazy download -->
						<button
							on:click={() => lazyDownload(item.identifier)}
							class="btn btn-ghost btn-sm btn-circle"
							title="Download for offline"
						>
							{#if downloadingIds.has(item.identifier)}
								<span class="loading loading-spinner loading-sm"></span>
							{:else}
								<Icon icon="solar:download-minimalistic-linear" width="18" />
							{/if}
						</button>
					</div>
				</AudioCard>
			{/each}
		</div>

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
