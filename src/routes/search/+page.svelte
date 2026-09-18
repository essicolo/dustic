<script lang="ts">
	import { notifications } from '$lib/stores/notifications';
	import { unifiedSearch as searchAPI, unifiedGetTrack as getTrack } from '$lib/services/sources';
	import { player, currentTrack } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { settings } from '$lib/stores/settings';
	import { CONTENT_TYPES, POPULAR_TAGS } from '$lib/utils/constants';
	import { base } from '$app/paths';
	import type { Track, SearchParams } from '$lib/types';
	import Icon from '@iconify/svelte';
	import AudioCard from '$lib/components/AudioCard.svelte';
	import { offline } from '$lib/stores/offline';

	import { goto } from '$app/navigation';

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
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { shareTrack } from '$lib/utils/share';
	import { debounce } from '$lib/utils/throttle';
	import { browser } from '$app/environment';
	import { _ } from '$lib/i18n';

	let searchQuery = '';
	let searchCreator = ''; // Artist/creator filter (from artist click)
	let selectedContentType = '';
	let selectedTag = '';
	let sortBy: 'relevance' | 'date' | 'downloads' = 'relevance';
	let sourceIA = $settings.iaEnabled !== false;
	let sourceFW = true;
	let currentPage = 1;
	let pageSize = 50;

	let isSearching = false;
	let isTyping = false;
	let results: Track[] = [];
	let totalResults = 0;
	let pageCount = 0;
	let error = '';
	let loadingTrack: string | null = null;
	let showFilters = false;

	let userIsEditing = false;

	let initialized = false;

	onMount(() => {
		if (browser) {
			const urlParams = new URLSearchParams(window.location.search);
			const q = urlParams.get('q');
			const artist = urlParams.get('artist');
			const ct = urlParams.get('type');
			const tag = urlParams.get('tag');
			if (ct) selectedContentType = ct;
			if (tag) selectedTag = tag;
			if (artist) {
				searchCreator = artist;
				searchQuery = artist; // Show artist name in search box
				handleSearch();
			} else if (q) {
				searchQuery = q;
				handleSearch();
			} else if (ct || tag) {
				// A bookmarked or shared browse link. Selecting a tab or a
				// genre in the app runs a search, but arriving on the same
				// state by URL only set the variables and left the page
				// empty.
				handleSearch();
			}
			setTimeout(() => { initialized = true; }, 0);
		}
	});

	$: if (browser && initialized && !userIsEditing) {
		const q = $page.url.searchParams.get('q');
		const artist = $page.url.searchParams.get('artist');
		if (artist && artist !== searchCreator) {
			searchCreator = artist;
			searchQuery = artist;
			handleSearch();
		} else if (q && q !== searchQuery) {
			searchCreator = '';
			searchQuery = q;
			handleSearch();
		}
	}

	// Monotonic sequence so overlapping searches can't finish out of
	// order: a slow response from an older query must never overwrite
	// the results of a newer one.
	let searchSeq = 0;

	async function handleSearch() {
		// An explicit search supersedes any pending debounced one — without
		// this, Enter mid-debounce fires the same search twice.
		debouncedSearch.cancel();
		const seq = ++searchSeq;

		const hasFilters = selectedContentType || selectedTag;
		if (!searchQuery.trim() && !hasFilters) {
			results = [];
			totalResults = 0;
			pageCount = 0;
			isTyping = false;
			error = '';
			// Clearing the box supersedes any search still in flight: bumping
			// searchSeq above already made that response a no-op, so its
			// `finally` will not run and this is the only place left that can
			// put the page back into its resting state. Without these two
			// lines the skeletons spin forever and ?q= keeps the old term,
			// which the $page watcher then types back into the box.
			isSearching = false;
			syncUrl();
			return;
		}

		isSearching = true;
		isTyping = false;
		error = '';

		// A selected tag is deliberately NOT folded into the query. It is a
		// filter on the archive's `subject` field now; using it as a keyword
		// as well would reintroduce exactly the noise that change removed.
		// The content-type name is still used as a fallback when there is
		// nothing else to search on, so the tab alone returns something.
		const effectiveQuery =
			searchQuery.trim() ||
			(selectedTag
				? ''
				: selectedContentType
					? CONTENT_TYPES.find((ct) => ct.id === selectedContentType)?.name.toLowerCase() || ''
					: '');

		const params: SearchParams = {
			query: effectiveQuery,
			sort: sortBy,
			page: currentPage,
			pageSize,
			sources: { ia: sourceIA, fw: sourceFW }
		};

		if (searchCreator) {
			params.creator = searchCreator;
		}
		if (selectedContentType) {
			params.contentType = selectedContentType;
		}
		if (selectedTag) {
			params.tag = selectedTag;
		}

		try {
			const result = await searchAPI(params, {
				// Internet Archive answers in a few hundred milliseconds;
				// a FunkWhale instance can take two seconds and usually adds
				// nothing. Show the archive's rows straight away and let the
				// merged set replace them when it arrives.
				onPartial: (partial) => {
					if (seq !== searchSeq) return; // a newer search owns the UI now
					results = partial.items;
					totalResults = partial.total;
					pageCount = partial.pageCount ?? Math.ceil(partial.total / pageSize);
					isSearching = false;
				}
			});
			if (seq !== searchSeq) return; // a newer search owns the UI now

			results = result.items;
			totalResults = result.total;
			pageCount = result.pageCount ?? Math.ceil(result.total / pageSize);

			if (result.error) {
				error = result.error;
			} else {
				error = '';
			}
		} catch (e: any) {
			if (seq !== searchSeq) return;
			console.warn('[Search] Failed:', e.message || e);
			if (
				e.message?.includes('Network error') ||
				e.message?.includes('network') ||
				e.name === 'TimeoutError'
			) {
				error = $_('search.networkError');
			} else {
				// Don't swallow other failures — an outage rendered as
				// "No results" sends users away thinking the archive is empty.
				error = e.message || $_('search.networkError');
			}
		} finally {
			if (seq === searchSeq) {
				isSearching = false;
				syncUrl();
			}
		}
	}

	const debouncedSearch = debounce(() => {
		currentPage = 1;
		handleSearch();
	}, 400);

	// A search still queued when the user navigates away would fire against
	// the next page and syncUrl() would graft ?q= onto it.
	onDestroy(() => debouncedSearch.cancel());

	/** Keep URL in sync with current search state so the $page watcher doesn't reset stale params */
	function syncUrl() {
		if (!browser) return;
		const url = new URL(window.location.href);
		// Clear old params
		url.searchParams.delete('q');
		url.searchParams.delete('artist');
		url.searchParams.delete('type');
		url.searchParams.delete('tag');
		// Set current state
		if (searchCreator) {
			url.searchParams.set('artist', searchCreator);
		} else if (searchQuery.trim()) {
			url.searchParams.set('q', searchQuery.trim());
		}
		if (selectedContentType) url.searchParams.set('type', selectedContentType);
		if (selectedTag) url.searchParams.set('tag', selectedTag);
		goto(url.pathname + url.search, { replaceState: true, noScroll: true, keepFocus: true });
	}

	function onSearchInput() {
		isTyping = true;
		userIsEditing = true;
		searchCreator = ''; // Clear artist filter when user edits query
		debouncedSearch();
	}

	function selectContentType(id: string) {
		selectedContentType = selectedContentType === id ? '' : id;
		// Clear tag when switching content types (tags differ per type)
		selectedTag = '';
		currentPage = 1;
		handleSearch();
	}

	function selectTag(tag: string) {
		selectedTag = selectedTag === tag ? '' : tag;
		currentPage = 1;
		handleSearch();
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
			error = $_('search.loadTrackError');
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
		notifications[result.success ? 'info' : 'error'](result.messageKey);
	}

	$: totalPages = pageCount || Math.ceil(totalResults / pageSize);
	$: hasActiveFilters = selectedContentType !== '' || selectedTag !== '' || sortBy !== 'relevance' || !sourceIA || !sourceFW;
	$: activeTags = CONTENT_TYPES.find((ct) => ct.id === selectedContentType)?.tags ?? [];

	// Genre chips are a way to browse, not a way to refine. They filter on
	// the archive's `subject` field scoped to the current tab's collections,
	// which only works when there is a tab (the "All" tab has no collections
	// to scope to) and only makes sense when there is nothing to refine.
	//
	// They used to be shown always, and on "All" they showed the music genre
	// list regardless of the tab spanning podcasts and audiobooks.
	$: showTagChips = activeTags.length > 0 && !searchQuery.trim();
</script>

<div class="p-4 md:p-8">
	<h2 class="text-2xl md:text-3xl font-bold mb-4 md:mb-6">{$_('search.title')}</h2>

	<!-- Search Bar -->
	<div class="mb-4">
		<div class="relative">
			<input
				type="search"
				bind:value={searchQuery}
				on:input={onSearchInput}
				on:focus={() => { userIsEditing = true; }}
				on:blur={() => { userIsEditing = false; }}
				on:keydown={(e) => e.key === 'Enter' && handleSearch()}
				placeholder={$_('search.placeholder')}
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

	</div>

	<!-- Content Type Tabs -->
	<div class="flex gap-1 mb-3 overflow-x-auto pb-1">
		<button
			on:click={() => selectContentType('')}
			class="btn btn-sm whitespace-nowrap"
			class:btn-primary={selectedContentType === ''}
			class:btn-ghost={selectedContentType !== ''}
		>
			{$_('search.all')}
		</button>
		{#each CONTENT_TYPES as ct}
			<button
				on:click={() => selectContentType(ct.id)}
				class="btn btn-sm whitespace-nowrap gap-1.5"
				class:btn-primary={selectedContentType === ct.id}
				class:btn-ghost={selectedContentType !== ct.id}
			>
				<Icon icon={ct.icon} width="16" />
				{$_(`browse.types.${ct.id}`, { default: ct.name })}
			</button>
		{/each}
	</div>

	<!-- Genre chips: a browse affordance, shown only on a content-type tab
	     and only while the search box is empty (see showTagChips).
	     badge-md is 20px tall, which is a miss on a phone; h-8 with real
	     horizontal padding gives these a tappable target without turning
	     them into buttons visually. -->
	{#if showTagChips}
		<div class="flex flex-wrap gap-2 mb-4">
			{#each activeTags as tag}
				<button
					on:click={() => selectTag(tag)}
					class="badge h-8 px-3 text-sm cursor-pointer transition-colors hover:bg-base-300"
					class:badge-primary={selectedTag === tag}
					class:badge-outline={selectedTag !== tag}
				>
					{tag}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Active Filters & Controls Row -->
	<div class="flex items-center justify-between mb-4 gap-2">
		<div class="flex items-center gap-2 flex-wrap min-w-0">
			{#if searchQuery.trim() && totalResults > 0 && !isSearching}
				<span class="text-sm text-base-content/60">
					{$_('search.resultsCount', { values: { count: totalResults.toLocaleString() } })}
				</span>
			{/if}
			{#if selectedContentType}
				{@const ct = CONTENT_TYPES.find(t => t.id === selectedContentType)}
				{#if ct}
					<span class="badge badge-sm badge-primary gap-1">
						{$_(`browse.types.${ct.id}`, { default: ct.name })}
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
					{$_('search.clearAll')}
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
				<span class="hidden sm:inline">{$_('search.filters')}</span>
			</button>

			{#if results.length > 0}
				<button on:click={playAll} class="btn btn-primary btn-sm gap-1">
					<Icon icon="solar:play-bold" width="16" />
					{$_('common.playAll')}
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
					<h4 class="text-xs font-semibold text-base-content/50 uppercase mb-2">{$_('search.sourcesHeader')}</h4>
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
					<h4 class="text-xs font-semibold text-base-content/50 uppercase mb-2">{$_('search.sortHeader')}</h4>
					<div class="flex gap-3">
						<label class="flex items-center gap-1.5 cursor-pointer">
							<input type="radio" bind:group={sortBy} value="relevance" on:change={() => { if (searchQuery.trim()) { currentPage = 1; handleSearch(); } }} class="radio radio-sm radio-primary" />
							<span class="text-sm">{$_('search.sortRelevance')}</span>
						</label>
						<label class="flex items-center gap-1.5 cursor-pointer">
							<input type="radio" bind:group={sortBy} value="downloads" on:change={() => { if (searchQuery.trim()) { currentPage = 1; handleSearch(); } }} class="radio radio-sm radio-primary" />
							<span class="text-sm">{$_('search.sortPopular')}</span>
						</label>
						<label class="flex items-center gap-1.5 cursor-pointer">
							<input type="radio" bind:group={sortBy} value="date" on:change={() => { if (searchQuery.trim()) { currentPage = 1; handleSearch(); } }} class="radio radio-sm radio-primary" />
							<span class="text-sm">{$_('search.sortNewest')}</span>
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
		<div class="divide-y divide-base-300 border-y border-base-300 mb-6">
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
					{$_('search.previous')}
				</button>
				<span class="text-sm">
					{$_('search.pageOf', { values: { current: currentPage, total: totalPages } })}
				</span>
				<button
					on:click={nextPage}
					disabled={currentPage >= totalPages || isSearching}
					class="btn btn-sm"
				>
					{$_('search.next')}
				</button>
			</div>
		{/if}
	{:else if searchQuery.trim() && !error}
		<!-- Suppressed while an error is shown: "No results" would wrongly
		     suggest the query matched nothing when the sources were down. -->
		<div class="text-center py-20 text-base-content/50">
			<Icon icon="solar:magnifer-linear" width="48" class="mx-auto mb-4 opacity-30" />
			<p class="text-lg">{$_('search.noResults', { values: { query: searchQuery } })}</p>
			<p class="text-sm mt-2">{$_('search.noResultsHint')}</p>
		</div>
	{:else if !error}
		<div class="text-center py-20 text-base-content/50">
			<Icon icon="solar:magnifer-linear" width="48" class="mx-auto mb-4 opacity-30" />
			<p class="text-lg">{$_('search.emptyPrompt')}</p>
			<p class="text-sm mt-2">{$_('search.emptyPromptSub')}</p>
		</div>
	{/if}

</div>
