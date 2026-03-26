<script lang="ts">
	import { unifiedSearch as searchAPI, unifiedGetTrack as getTrack } from '$lib/services/sources';
	import { player, currentTrack } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { CONTENT_TYPES, POPULAR_TAGS } from '$lib/utils/constants';
	import { base } from '$app/paths';
	import type { Track, SearchParams } from '$lib/types';
	import Icon from '@iconify/svelte';
	import AudioCard from '$lib/components/AudioCard.svelte';
	import { offline } from '$lib/stores/offline';

	let downloadingIds = new Set<string>();

	async function lazyDownload(identifier: string) {
		if (downloadingIds.has(identifier)) return;
		downloadingIds.add(identifier);
		try {
			const cached = results.find((t) => t.identifier === identifier);
			const track = cached?.streamUrl ? cached : await getTrack(identifier);
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
	import { debounce } from '$lib/utils/throttle';
	import { browser } from '$app/environment';

	let searchQuery = '';
	let selectedContentType = '';
	let selectedTag = '';
	let sortBy: 'relevance' | 'date' | 'downloads' = 'relevance';
	let sourceIA = true;
	let sourceFW = true;
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

	let userIsEditing = false;

	let initialized = false;

	onMount(() => {
		if (browser) {
			const urlParams = new URLSearchParams(window.location.search);
			const q = urlParams.get('q');
			const ct = urlParams.get('type');
			const tag = urlParams.get('tag');
			if (ct) selectedContentType = ct;
			if (tag) selectedTag = tag;
			if (q) {
				searchQuery = q;
				handleSearch();
			}
			setTimeout(() => { initialized = true; }, 0);
		}
	});

	$: if (browser && initialized && !userIsEditing && $page.url.searchParams.get('q')) {
		const q = $page.url.searchParams.get('q');
		if (q && q !== searchQuery) {
			searchQuery = q;
			handleSearch();
		}
	}

	async function handleSearch() {
		if (!searchQuery.trim()) {
			results = [];
			totalResults = 0;
			isTyping = false;
			error = '';
			return;
		}

		isSearching = true;
		isTyping = false;
		error = '';

		const params: SearchParams = {
			query: searchQuery,
			sort: sortBy,
			page: currentPage,
			pageSize,
			sources: { ia: sourceIA, fw: sourceFW }
		};

		if (selectedContentType) {
			params.contentType = selectedContentType;
		}
		if (selectedTag) {
			params.tag = selectedTag;
		}

		try {
			const result = await searchAPI(params);
			results = result.items;
			totalResults = result.total;

			if (result.error) {
				error = result.error;
			} else {
				error = '';
			}
		} catch (e: any) {
			console.warn('[Search] Failed:', e.message || e);
			if (e.message?.includes('Network error') || e.message?.includes('network')) {
				error = 'Network error. Please check your internet connection.';
			}
		} finally {
			isSearching = false;
			userIsEditing = false;
		}
	}

	const debouncedSearch = debounce(() => {
		currentPage = 1;
		handleSearch();
	}, 400);

	function onSearchInput() {
		isTyping = true;
		userIsEditing = true;
		debouncedSearch();
	}

	function selectContentType(id: string) {
		selectedContentType = selectedContentType === id ? '' : id;
		// Clear tag when switching content types (tags differ per type)
		selectedTag = '';
		if (searchQuery.trim()) {
			currentPage = 1;
			handleSearch();
		}
	}

	function selectTag(tag: string) {
		selectedTag = selectedTag === tag ? '' : tag;
		if (searchQuery.trim()) {
			currentPage = 1;
			handleSearch();
		}
	}

	async function resolveTrack(identifier: string): Promise<Track | null> {
		const cached = results.find((t) => t.identifier === identifier);
		if (cached?.streamUrl) return cached;
		return getTrack(identifier);
	}

	async function playTrack(identifier: string) {
		loadingTrack = identifier;
		try {
			const track = await resolveTrack(identifier);
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
			const track = await resolveTrack(identifier);
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
		const validTracks = results.slice(0, 20).filter((t) => t.streamUrl);
		if (validTracks.length > 0) {
			queue.setQueue(validTracks, 0);
			player.play(validTracks[0]);
		}
	}

	function clearFilters() {
		selectedContentType = '';
		selectedTag = '';
		sortBy = 'relevance';
		currentPage = 1;
		if (searchQuery.trim()) handleSearch();
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

	async function handleShare(item: Track) {
		const result = await shareTrack(item);
		shareMessage = result.message;
		showShareToast = true;
		setTimeout(() => {
			showShareToast = false;
		}, 3000);
	}

	$: totalPages = Math.ceil(totalResults / pageSize);
	$: hasActiveFilters = selectedContentType !== '' || selectedTag !== '' || sortBy !== 'relevance' || !sourceIA || !sourceFW;
	$: activeTags = selectedContentType
		? (CONTENT_TYPES.find(ct => ct.id === selectedContentType)?.tags ?? POPULAR_TAGS)
		: POPULAR_TAGS;
</script>

<div class="p-4 md:p-8">
	<h2 class="text-2xl md:text-3xl font-bold mb-4 md:mb-6">Search</h2>

	<!-- Search Bar -->
	<div class="mb-4">
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
			</div>
		{/if}
	</div>

	<!-- Content Type Tabs -->
	<div class="flex gap-1 mb-3 overflow-x-auto pb-1">
		<button
			on:click={() => selectContentType('')}
			class="btn btn-sm whitespace-nowrap"
			class:btn-primary={selectedContentType === ''}
			class:btn-ghost={selectedContentType !== ''}
		>
			All
		</button>
		{#each CONTENT_TYPES as ct}
			<button
				on:click={() => selectContentType(ct.id)}
				class="btn btn-sm whitespace-nowrap gap-1.5"
				class:btn-primary={selectedContentType === ct.id}
				class:btn-ghost={selectedContentType !== ct.id}
			>
				<Icon icon={ct.icon} width="16" />
				{ct.name}
			</button>
		{/each}
	</div>

	<!-- Tag Chips (content-type-aware) -->
	<div class="flex flex-wrap gap-1.5 mb-4">
		{#each activeTags as tag}
			<button
				on:click={() => selectTag(tag)}
				class="badge badge-md cursor-pointer transition-colors hover:badge-primary"
				class:badge-primary={selectedTag === tag}
				class:badge-outline={selectedTag !== tag}
			>
				{tag}
			</button>
		{/each}
	</div>

	<!-- Active Filters & Controls Row -->
	<div class="flex items-center justify-between mb-4 gap-2">
		<div class="flex items-center gap-2 flex-wrap min-w-0">
			{#if searchQuery.trim() && totalResults > 0 && !isSearching}
				<span class="text-sm text-base-content/60">
					{totalResults.toLocaleString()} results
				</span>
			{/if}
			{#if selectedContentType}
				{@const ct = CONTENT_TYPES.find(t => t.id === selectedContentType)}
				{#if ct}
					<span class="badge badge-sm badge-primary gap-1">
						{ct.name}
						<button on:click={() => selectContentType('')} class="hover:text-primary-content/80">x</button>
					</span>
				{/if}
			{/if}
			{#if selectedTag}
				<span class="badge badge-sm badge-primary gap-1">
					{selectedTag}
					<button on:click={() => selectTag('')} class="hover:text-primary-content/80">x</button>
				</span>
			{/if}
			{#if hasActiveFilters}
				<button on:click={clearFilters} class="text-xs text-base-content/50 hover:text-base-content/80">
					Clear all
				</button>
			{/if}
		</div>

		<div class="flex items-center gap-2 flex-shrink-0">
			<!-- Filter Toggle (sources, sort) -->
			<button
				on:click={toggleFilters}
				class="btn btn-ghost btn-sm gap-1"
				class:btn-active={showFilters}
			>
				<Icon icon="solar:filter-bold" width="16" />
				<span class="hidden sm:inline">Filters</span>
			</button>

			{#if results.length > 0}
				<button on:click={playAll} class="btn btn-primary btn-sm gap-1">
					<Icon icon="solar:play-bold" width="16" />
					Play All
				</button>
			{/if}
		</div>
	</div>

	<!-- Collapsible Filter Panel -->
	{#if showFilters}
		<div class="bg-base-200 rounded-lg p-4 mb-4">
			<div class="flex flex-wrap gap-6">
				<!-- Source Toggles -->
				<div>
					<h4 class="text-xs font-semibold text-base-content/50 uppercase mb-2">Sources</h4>
					<div class="flex gap-3">
						<label class="flex items-center gap-2 cursor-pointer">
							<input
								type="checkbox"
								bind:checked={sourceIA}
								on:change={() => { if (searchQuery.trim()) handleSearch(); }}
								class="checkbox checkbox-sm checkbox-primary"
							/>
							<img src="{base}/internet-archive-icon.svg" alt="IA" class="w-4 h-4 opacity-60" />
							<span class="text-sm">archive.org</span>
						</label>
						<label class="flex items-center gap-2 cursor-pointer">
							<input
								type="checkbox"
								bind:checked={sourceFW}
								on:change={() => { if (searchQuery.trim()) handleSearch(); }}
								class="checkbox checkbox-sm checkbox-primary"
							/>
							<img src="{base}/funkwhale-icon.svg" alt="FW" class="w-4 h-4 opacity-60" />
							<span class="text-sm">open.audio</span>
						</label>
					</div>
				</div>

				<!-- Sort -->
				<div>
					<h4 class="text-xs font-semibold text-base-content/50 uppercase mb-2">Sort By</h4>
					<div class="flex gap-3">
						<label class="flex items-center gap-1.5 cursor-pointer">
							<input type="radio" bind:group={sortBy} value="relevance" on:change={() => { if (searchQuery.trim()) { currentPage = 1; handleSearch(); } }} class="radio radio-sm radio-primary" />
							<span class="text-sm">Relevance</span>
						</label>
						<label class="flex items-center gap-1.5 cursor-pointer">
							<input type="radio" bind:group={sortBy} value="downloads" on:change={() => { if (searchQuery.trim()) { currentPage = 1; handleSearch(); } }} class="radio radio-sm radio-primary" />
							<span class="text-sm">Popular</span>
						</label>
						<label class="flex items-center gap-1.5 cursor-pointer">
							<input type="radio" bind:group={sortBy} value="date" on:change={() => { if (searchQuery.trim()) { currentPage = 1; handleSearch(); } }} class="radio radio-sm radio-primary" />
							<span class="text-sm">Newest</span>
						</label>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Results -->
	{#if error}
		<div class="alert alert-error mb-4">
			<span>{error}</span>
		</div>
	{/if}

	{#if isSearching}
		<div class="flex justify-center items-center py-20">
			<span class="loading loading-spinner loading-lg text-primary"></span>
		</div>
	{:else if results.length > 0}
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
					Previous
				</button>
				<span class="text-sm">
					Page {currentPage} of {totalPages}
				</span>
				<button
					on:click={nextPage}
					disabled={currentPage >= totalPages || isSearching}
					class="btn btn-sm"
				>
					Next
				</button>
			</div>
		{/if}
	{:else if searchQuery.trim()}
		<div class="text-center py-20 text-base-content/50">
			<Icon icon="solar:magnifer-linear" width="48" class="mx-auto mb-4 opacity-30" />
			<p class="text-lg">No results for "{searchQuery}"</p>
			<p class="text-sm mt-2">Try different keywords, tags, or content types</p>
		</div>
	{:else}
		<div class="text-center py-20 text-base-content/50">
			<Icon icon="solar:magnifer-linear" width="48" class="mx-auto mb-4 opacity-30" />
			<p class="text-lg">Search for music, podcasts, audiobooks, and more</p>
			<p class="text-sm mt-2">from the Internet Archive and FunkWhale</p>
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
