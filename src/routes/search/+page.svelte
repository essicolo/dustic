<script lang="ts">
	import { search as searchAPI, getTrack } from '$lib/services/internetArchive';
	import { player, currentTrack } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { POPULAR_COLLECTIONS } from '$lib/utils/constants';
	import type { Track, SearchParams } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { shareTrack } from '$lib/utils/share';
	import { batchExecute } from '$lib/utils/throttle';

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
	let showFilters = false;
	let shareMessage = '';
	let showShareToast = false;

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

	function toggleFilters() {
		showFilters = !showFilters;
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
		if (!$currentTrack) return false;
		// Handle chapter identifiers (format: "itemId#index")
		const currentId = $currentTrack.identifier.split('#')[0];
		const trackId = identifier.split('#')[0];
		return currentId === trackId;
	}

	async function handleShare(item: Track) {
		const result = await shareTrack(item);
		shareMessage = result.message;
		showShareToast = true;
		setTimeout(() => {
			showShareToast = false;
		}, 3000);
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

<div class="p-4 md:p-8">
	<h2 class="text-2xl md:text-3xl font-bold mb-4 md:mb-6">Search</h2>

	<!-- Search Bar -->
	<div class="mb-4 md:mb-6">
		<div class="join w-full">
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
					<span class="hidden md:inline">Search</span>
					<Icon icon="solar:magnifer-bold-duotone" width="20" class="md:hidden" />
				{/if}
			</button>
		</div>
	</div>

	<!-- Mobile Filter Toggle -->
	<div class="md:hidden mb-4">
		<button on:click={toggleFilters} class="btn btn-outline btn-sm w-full">
			<Icon icon="solar:filter-bold" width="20" />
			<span>Filters</span>
			{#if selectedCollections.length > 0 || sortBy !== 'relevance'}
				<span class="badge badge-primary badge-sm">{selectedCollections.length}</span>
			{/if}
		</button>
	</div>

	<div class="flex gap-0 md:gap-6">
		<!-- Filters Sidebar -->
		<aside class="w-64 flex-shrink-0 hidden md:block">
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
									{collection.name}
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

		<!-- Mobile Filters Modal -->
		{#if showFilters}
			<div
				class="md:hidden fixed inset-0 bg-black/50 z-50"
				on:click={toggleFilters}
				on:keydown={(e) => e.key === 'Escape' && toggleFilters()}
				role="button"
				tabindex="0"
				aria-label="Close filters"
			>
				<div
					class="fixed inset-x-0 bottom-0 bg-base-200 rounded-t-2xl p-6 max-h-[80vh] overflow-y-auto"
					on:click={(e) => e.stopPropagation()}
					on:keydown={(e) => e.stopPropagation()}
					role="dialog"
					aria-label="Filter options"
					tabindex="-1"
				>
					<div class="flex items-center justify-between mb-4">
						<h3 class="font-bold text-lg">Filters</h3>
						<div class="flex gap-2">
							{#if selectedCollections.length > 0 || sortBy !== 'relevance'}
								<button on:click={clearFilters} class="btn btn-ghost btn-xs">Clear</button>
							{/if}
							<button on:click={toggleFilters} class="btn btn-ghost btn-sm btn-square">
								<Icon icon="solar:close-circle-bold" width="24" />
							</button>
						</div>
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
										{collection.name}
									</span>
								</label>
							{/each}
						</div>
					</div>

					<!-- Sort -->
					<div class="mb-6">
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

					<!-- Apply Button -->
					<button on:click={toggleFilters} class="btn btn-primary w-full">
						Apply Filters
					</button>
				</div>
			</div>
		{/if}

		<!-- Results -->
		<main class="flex-1 min-w-0">
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
								<div class="flex items-center gap-3 max-w-full">
									<!-- Album Art - Clickable -->
									<a href="/item/{item.identifier}" class="flex-shrink-0 hover:opacity-80 transition-opacity">
										{#if item.thumbnailUrl}
											<img
												src={item.thumbnailUrl}
												alt={item.title}
												class="w-12 h-12 rounded object-cover bg-base-300"
											/>
										{:else}
											<div class="w-12 h-12 rounded bg-base-300 flex items-center justify-center">
												<Icon icon="solar:music-note-bold" width="24" className="text-base-content/30" />
											</div>
										{/if}
									</a>

									<!-- Info - Clickable -->
									<a href="/item/{item.identifier}" class="flex-1 min-w-0 overflow-hidden hover:text-primary transition-colors">
										<h3
											class="font-medium truncate"
											class:text-primary={isCurrentTrack(item.identifier)}
										>
											{item.title}
										</h3>
										<p class="text-sm text-base-content/70 truncate">{item.artist}</p>
										{#if item.date}
											<p class="text-xs text-base-content/50 mt-1 truncate">{item.date}</p>
										{/if}
									</a>
									<div class="flex items-center gap-1 md:gap-2 flex-shrink-0">
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
											class="btn btn-ghost btn-sm btn-square hidden md:inline-flex opacity-0 group-hover:opacity-100 transition-opacity"
											disabled={loadingTrack === item.identifier}
											title="Add to queue"
										>
											<Icon icon="solar:add-circle-bold" width="18" />
										</button>
										<button
											on:click={() => handleShare(item)}
											class="btn btn-ghost btn-sm btn-square hidden md:inline-flex opacity-0 group-hover:opacity-100 transition-opacity"
											title="Share track"
										>
											<Icon icon="solar:share-bold" width="18" />
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
