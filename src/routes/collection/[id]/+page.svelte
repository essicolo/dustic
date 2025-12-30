<script lang="ts">
	import { page } from '$app/stores';
	import { search as searchAPI, getTrack } from '$lib/services/internetArchive';
	import { player, currentTrack } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { POPULAR_COLLECTIONS } from '$lib/utils/constants';
	import type { Track } from '$lib/types';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';

	let collectionId = '';
	let collectionInfo: { name: string; icon: string } | null = null;
	let results: Track[] = [];
	let isLoading = false;
	let error = '';
	let loadingTrack: string | null = null;
	let currentPage = 1;
	let totalResults = 0;
	let sortBy: 'relevance' | 'date' | 'downloads' = 'downloads';

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

		const tracks = await Promise.all(
			results.slice(0, 20).map(async (item) => {
				try {
					return await getTrack(item.identifier);
				} catch {
					return null;
				}
			})
		);

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
		return $currentTrack?.identifier === identifier;
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
				on:click={() => (sortBy = 'relevance')}
				class="btn btn-sm"
				class:btn-active={sortBy === 'relevance'}
			>
				Relevance
			</button>
		</div>
	</div>

	{#if error}
		<div class="alert alert-error mb-4">
			<span>{error}</span>
		</div>
	{/if}

	{#if isLoading}
		<div class="flex justify-center items-center py-20">
			<span class="loading loading-spinner loading-lg text-primary"></span>
		</div>
	{:else if results.length > 0}
		<div class="space-y-2 mb-6">
			{#each results as item}
				<div
					class="card bg-base-200 hover:bg-base-300 transition-colors group"
					class:ring-2={isCurrentTrack(item.identifier)}
					class:ring-primary={isCurrentTrack(item.identifier)}
				>
					<div class="card-body p-4">
						<div class="flex items-center gap-3">
							<!-- Album Art -->
							{#if item.thumbnailUrl}
								<img
									src={item.thumbnailUrl}
									alt={item.title}
									class="w-12 h-12 rounded object-cover bg-base-300 flex-shrink-0"
								/>
							{:else}
								<div class="w-12 h-12 rounded bg-base-300 flex items-center justify-center flex-shrink-0">
									<Icon icon="solar:music-note-bold" width="24" className="text-base-content/30" />
								</div>
							{/if}

							<div class="flex-1 min-w-0">
								<h3
									class="font-medium truncate"
									class:text-primary={isCurrentTrack(item.identifier)}
								>
									{item.title}
								</h3>
								<p class="text-sm text-base-content/70 truncate">{item.artist}</p>
								{#if item.date}
									<p class="text-xs text-base-content/50 mt-1">{item.date}</p>
								{/if}
							</div>
							<div class="flex items-center gap-2">
								<button
									on:click={() => playTrack(item.identifier)}
									class="btn btn-sm"
									class:btn-primary={!isCurrentTrack(item.identifier)}
									class:btn-ghost={isCurrentTrack(item.identifier)}
									disabled={loadingTrack === item.identifier}
								>
									{#if loadingTrack === item.identifier}
										<span class="loading loading-spinner loading-xs"></span>
									{:else if isCurrentTrack(item.identifier)}
										Playing
									{:else}
										Play
									{/if}
								</button>
								<button
									on:click={() => addToQueue(item.identifier)}
									class="btn btn-ghost btn-sm btn-square opacity-0 group-hover:opacity-100 transition-opacity"
									disabled={loadingTrack === item.identifier}
									title="Add to queue"
								>
									<Icon icon="solar:add-circle-bold" width="18" />
								</button>
								<div class="text-xs text-base-content/50 w-12 text-right">
									{item.format?.toUpperCase()}
								</div>
							</div>
						</div>
					</div>
				</div>
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
