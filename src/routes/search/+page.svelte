<script lang="ts">
	import { search as searchAPI, getTrack } from '$lib/services/internetArchive';
	import { player, currentTrack } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { POPULAR_COLLECTIONS } from '$lib/utils/constants';
	import type { Track, SearchParams } from '$lib/types';
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
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { shareTrack } from '$lib/utils/share';
	import { batchExecute, debounce } from '$lib/utils/throttle';
	import { browser } from '$app/environment';

	let searchQuery = '';
	let selectedCollections: string[] = [];
	let sortBy: 'relevance' | 'date' | 'downloads' = 'relevance';
	let currentPage = 1;
	let pageSize = 50;

	let isSearching = false;
	let isTyping = false;
	let results: Track[] = [];
	let totalResults = 0;
	let error = '';
	let loadingTrack: string | null = null;
	let showFilters = false;
	let showSearchHelp = false;
	let shareMessage = '';
	let showShareToast = false;
	let failedImages = new Set<string>(); // Track failed image loads

	// Track previous filter values to prevent unnecessary searches
	let prevCollections: string[] = [];
	let prevSortBy: string = 'relevance';

	function handleImageError(identifier: string) {
		failedImages.add(identifier);
		failedImages = failedImages; // Trigger reactivity
	}

	// Read query params on mount
	onMount(() => {
		if (browser) {
			const urlParams = new URLSearchParams(window.location.search);
			const q = urlParams.get('q');
			if (q) {
				searchQuery = q;
				handleSearch();
			}
		}
	});

	async function handleSearch() {
		if (!searchQuery.trim()) {
			results = [];
			totalResults = 0;
			isTyping = false;
			return;
		}

		isSearching = true;
		isTyping = false;
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
			// Clear any previous errors on successful search
			error = '';
		} catch (e: any) {
			// Provide more specific error messages
			if (e.message?.includes('Too many requests')) {
				error = 'Too many requests. Please wait a moment and try again.';
			} else if (e.message?.includes('experiencing issues')) {
				error = 'Internet Archive is experiencing issues. Please try again later.';
			} else if (e.message?.includes('Network error')) {
				error = 'Network error. Please check your internet connection.';
			} else {
				error = 'Search failed. The Internet Archive may be slow or unavailable. Please try again.';
			}
			console.error('Search error:', e);
		} finally {
			isSearching = false;
		}
	}

	// Debounced search function for search-as-you-type
	const debouncedSearch = debounce(() => {
		currentPage = 1; // Reset to first page on new search
		handleSearch();
	}, 400);

	function onSearchInput() {
		isTyping = true;
		debouncedSearch();
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
		// Re-search when filters change (compare previous values to detect actual changes)
		const collectionsChanged = JSON.stringify(selectedCollections) !== JSON.stringify(prevCollections);
		const sortChanged = sortBy !== prevSortBy;

		if (collectionsChanged || sortChanged) {
			prevCollections = [...selectedCollections];
			prevSortBy = sortBy;
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
		<div class="relative">
			<input
				type="search"
				bind:value={searchQuery}
				on:input={onSearchInput}
				on:keydown={(e) => e.key === 'Enter' && handleSearch()}
				placeholder='Try: jazz, creator:"Miles Davis", subject:"live concert"'
				class="input input-bordered w-full pr-12"
				autocomplete="off"
				enterkeyhint="search"
			/>
			<div class="absolute right-3 top-1/2 -translate-y-1/2">
				{#if isTyping}
					<span class="loading loading-spinner loading-sm text-base-content/50"></span>
				{:else if isSearching}
					<span class="loading loading-spinner loading-sm text-primary"></span>
				{:else if searchQuery.trim()}
					<Icon icon="solar:magnifer-bold" width="20" className="text-base-content/50" />
				{:else}
					<Icon icon="solar:magnifer-linear" width="20" className="text-base-content/30" />
				{/if}
			</div>
		</div>
		{#if searchQuery.trim() && totalResults > 0}
			<p class="text-sm text-base-content/60 mt-2">
				Found {totalResults.toLocaleString()} results
			</p>
		{/if}

		<!-- Search Help -->
		<button
			on:click={() => showSearchHelp = !showSearchHelp}
			class="text-xs text-base-content/50 hover:text-base-content/80 mt-2 flex items-center gap-1"
		>
			<Icon icon={showSearchHelp ? 'solar:minus-circle-linear' : 'solar:info-circle-linear'} width="14" />
			<span>{showSearchHelp ? 'Hide' : 'Show'} search tips</span>
		</button>

		{#if showSearchHelp}
			<div class="mt-2 p-3 bg-base-200 rounded-lg text-xs space-y-2">
				<p class="font-semibold text-sm">Search Tips:</p>
				<ul class="space-y-1 list-disc list-inside text-base-content/70">
					<li><code class="bg-base-300 px-1 rounded">creator:"Artist Name"</code> - Search by artist</li>
					<li><code class="bg-base-300 px-1 rounded">subject:"jazz"</code> - Search by genre/subject</li>
					<li><code class="bg-base-300 px-1 rounded">"exact phrase"</code> - Search for exact phrase</li>
					<li><code class="bg-base-300 px-1 rounded">title:album AND creator:artist</code> - Combine searches</li>
				</ul>
				<p class="text-base-content/60 pt-1">💡 Use collection filters for better results (Live Music, Audiobooks, etc.)</p>
			</div>
		{/if}
	</div>

	<!-- Mobile Filter Toggle -->
	<div class="md:hidden mb-4">
		<button on:click={toggleFilters} class="btn btn-outline btn-sm w-full {selectedCollections.length > 0 || sortBy !== 'relevance' ? 'btn-primary' : ''}">
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
						<AudioCard item={item} type="album" layout="list" />
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
