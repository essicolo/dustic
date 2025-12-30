<script lang="ts">
	import { search as searchAPI, getTrack } from '$lib/services/internetArchive';
	import { player, currentTrack } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { POPULAR_COLLECTIONS } from '$lib/utils/constants';
	import type { Track, SearchParams } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	let searchQuery = '';
	let selectedCollections: string[] = [];
	let sortBy: 'relevance' | 'date' | 'downloads' = 'relevance';
	let currentPage = 1;
	let pageSize = 50;

	let isSearching = false;
	let results: Track[] = [];
	let totalResults = 0;
	let error = '';
	let loadingTrack: string | null = null;

	// Read query params on mount
	onMount(() => {
		const urlParams = new URLSearchParams(window.location.search);
		const q = urlParams.get('q');
		if (q) {
			searchQuery = q;
			handleSearch();
		}
	});

	async function handleSearch() {
		if (!searchQuery.trim()) return;

		isSearching = true;
		error = '';

		const params: SearchParams = {
			query: searchQuery,
			sort: sortBy,
			page: currentPage,
			pageSize
		};

		if (selectedCollections.length > 0) {
			params.collection = selectedCollections;
		}

		try {
			const result = await searchAPI(params);
			results = result.items;
			totalResults = result.total;
		} catch (e) {
			error = 'Search failed. Please try again.';
			console.error(e);
		} finally {
			isSearching = false;
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

		// Load first 10 tracks
		const tracks = await Promise.all(
			results.slice(0, 10).map(async (item) => {
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

	function toggleCollection(collectionId: string) {
		if (selectedCollections.includes(collectionId)) {
			selectedCollections = selectedCollections.filter((c) => c !== collectionId);
		} else {
			selectedCollections = [...selectedCollections, collectionId];
		}
	}

	function clearFilters() {
		selectedCollections = [];
		sortBy = 'relevance';
		currentPage = 1;
	}

	function nextPage() {
		currentPage++;
		handleSearch();
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function prevPage() {
		if (currentPage > 1) {
			currentPage--;
			handleSearch();
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}

	function isCurrentTrack(identifier: string): boolean {
		return $currentTrack?.identifier === identifier;
	}

	$: totalPages = Math.ceil(totalResults / pageSize);
	$: {
		// Re-search when filters change
		if (selectedCollections || sortBy) {
			currentPage = 1;
			if (searchQuery.trim()) {
				handleSearch();
			}
		}
	}
</script>

<div class="p-8">
	<h2 class="text-3xl font-bold mb-6">Search</h2>

	<!-- Search Bar -->
	<div class="mb-6">
		<div class="join w-full max-w-3xl">
			<input
				type="text"
				bind:value={searchQuery}
				on:keydown={(e) => e.key === 'Enter' && handleSearch()}
				placeholder="Search for music, audiobooks, podcasts..."
				class="input input-bordered join-item flex-1"
			/>
			<button on:click={handleSearch} class="btn btn-primary join-item" disabled={isSearching}>
				{#if isSearching}
					<span class="loading loading-spinner"></span>
				{:else}
					Search
				{/if}
			</button>
		</div>
	</div>

	<div class="flex gap-6">
		<!-- Filters Sidebar -->
		<aside class="w-64 flex-shrink-0">
			<div class="bg-base-200 rounded-lg p-4 sticky top-4">
				<div class="flex items-center justify-between mb-4">
					<h3 class="font-bold">Filters</h3>
					{#if selectedCollections.length > 0 || sortBy !== 'relevance'}
						<button on:click={clearFilters} class="btn btn-ghost btn-xs">Clear</button>
					{/if}
				</div>

				<!-- Collections -->
				<div class="mb-6">
					<h4 class="text-sm font-semibold mb-2">Collections</h4>
					<div class="space-y-2">
						{#each POPULAR_COLLECTIONS as collection}
							<label class="flex items-center gap-2 cursor-pointer hover:bg-base-300 p-2 rounded">
								<input
									type="checkbox"
									checked={selectedCollections.includes(collection.id)}
									on:change={() => toggleCollection(collection.id)}
									class="checkbox checkbox-sm checkbox-primary"
								/>
								<span class="text-sm">
									{collection.icon} {collection.name}
								</span>
							</label>
						{/each}
					</div>
				</div>

				<!-- Sort -->
				<div>
					<h4 class="text-sm font-semibold mb-2">Sort By</h4>
					<div class="space-y-1">
						<label class="flex items-center gap-2 cursor-pointer hover:bg-base-300 p-2 rounded">
							<input
								type="radio"
								bind:group={sortBy}
								value="relevance"
								class="radio radio-sm radio-primary"
							/>
							<span class="text-sm">Relevance</span>
						</label>
						<label class="flex items-center gap-2 cursor-pointer hover:bg-base-300 p-2 rounded">
							<input
								type="radio"
								bind:group={sortBy}
								value="downloads"
								class="radio radio-sm radio-primary"
							/>
							<span class="text-sm">Most Popular</span>
						</label>
						<label class="flex items-center gap-2 cursor-pointer hover:bg-base-300 p-2 rounded">
							<input
								type="radio"
								bind:group={sortBy}
								value="date"
								class="radio radio-sm radio-primary"
							/>
							<span class="text-sm">Newest</span>
						</label>
					</div>
				</div>
			</div>
		</aside>

		<!-- Results -->
		<main class="flex-1">
			{#if error}
				<div class="alert alert-error mb-4">
					<span>{error}</span>
				</div>
			{/if}

			{#if results.length > 0}
				<!-- Results Header -->
				<div class="flex items-center justify-between mb-4">
					<div class="text-sm text-base-content/70">
						{totalResults.toLocaleString()} results
						{#if selectedCollections.length > 0}
							in selected collections
						{/if}
					</div>
					<button on:click={playAll} class="btn btn-primary btn-sm">
						Play All
					</button>
				</div>

				<!-- Results Grid -->
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
											class="btn btn-sm btn-square"
											class:btn-primary={!isCurrentTrack(item.identifier)}
											class:btn-ghost={isCurrentTrack(item.identifier)}
											disabled={loadingTrack === item.identifier}
											title={isCurrentTrack(item.identifier) ? 'Playing' : 'Play'}
										>
											{#if loadingTrack === item.identifier}
												<span class="loading loading-spinner loading-xs"></span>
											{:else if isCurrentTrack(item.identifier)}
												<Icon icon="solar:pause-bold" width="18" />
											{:else}
												<Icon icon="solar:play-bold" width="18" />
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
							disabled={currentPage === 1 || isSearching}
							class="btn btn-sm"
						>
							← Previous
						</button>
						<span class="text-sm">
							Page {currentPage} of {totalPages}
						</span>
						<button
							on:click={nextPage}
							disabled={currentPage >= totalPages || isSearching}
							class="btn btn-sm"
						>
							Next →
						</button>
					</div>
				{/if}
			{:else if isSearching}
				<div class="flex justify-center items-center py-20">
					<span class="loading loading-spinner loading-lg text-primary"></span>
				</div>
			{:else if searchQuery.trim()}
				<div class="text-center py-20 text-base-content/50">
					<p class="text-lg">No results found for "{searchQuery}"</p>
					<p class="text-sm mt-2">Try different keywords or filters</p>
				</div>
			{:else}
				<div class="text-center py-20 text-base-content/50">
					<p class="text-lg">Start searching for music, audiobooks, and podcasts</p>
					<p class="text-sm mt-2">from the Internet Archive</p>
				</div>
			{/if}
		</main>
	</div>
</div>
