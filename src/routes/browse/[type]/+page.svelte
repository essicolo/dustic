<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { unifiedSearch } from '$lib/services/sources';
	import { player } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { CONTENT_TYPES, POPULAR_TAGS } from '$lib/utils/constants';
	import type { Track, SearchParams } from '$lib/types';
	import AudioCard from '$lib/components/AudioCard.svelte';
	import SkeletonCard from '$lib/components/SkeletonCard.svelte';
	import Icon from '@iconify/svelte';

	let results: Track[] = [];
	let isLoading = false;
	let totalResults = 0;
	let viewMode: 'tiles' | 'list' = 'tiles';
	let currentPage = 1;
	let lastLoadKey = '';

	$: typeId = $page.params.type || 'music';
	$: contentType = CONTENT_TYPES.find((t) => t.id === typeId);
	$: activeTag = $page.url.searchParams.get('tag') || '';
	$: searchQuery = $page.url.searchParams.get('q') || '';
	$: loadKey = `${typeId}:${activeTag}:${searchQuery}:${currentPage}`;

	$: if (loadKey && typeof window !== 'undefined' && loadKey !== lastLoadKey) {
		lastLoadKey = loadKey;
		loadContent();
	}

	async function loadContent() {
		if (!contentType) return;
		isLoading = true;
		results = [];

		const params: SearchParams = {
			query: searchQuery || activeTag || contentType.name.toLowerCase(),
			contentType: typeId,
			tag: activeTag || undefined,
			page: currentPage,
			pageSize: 50
		};

		try {
			const result = await unifiedSearch(params);
			results = result.items;
			totalResults = result.total;
		} catch (e: any) {
			console.error('Browse error:', e);
		} finally {
			isLoading = false;
		}
	}

	function selectTag(tag: string) {
		const current = $page.url.searchParams.get('tag');
		if (current === tag) {
			// Deselect
			goto(`${base}/browse/${typeId}`, { replaceState: true });
		} else {
			goto(`${base}/browse/${typeId}?tag=${encodeURIComponent(tag)}`, { replaceState: true });
		}
	}

	function playAll() {
		const tracks = results.filter((t) => t.streamUrl);
		if (tracks.length > 0) {
			queue.setQueue(tracks.slice(0, 20), 0);
			player.play(tracks[0]);
		}
	}
</script>

<div class="p-4 md:p-8">
	{#if !contentType}
		<div class="text-center py-20">
			<p class="text-lg text-base-content/50">Unknown content type</p>
			<a href="{base}/browse/music" class="btn btn-primary mt-4">Browse Music</a>
		</div>
	{:else}
		<!-- Header -->
		<div class="flex items-center justify-between mb-6">
			<div>
				<div class="flex items-center gap-3">
					<Icon icon={contentType.icon} width="28" class="text-primary" />
					<h2 class="text-3xl font-bold">{contentType.name}</h2>
				</div>
				{#if activeTag}
					<p class="text-sm text-base-content/60 mt-1">
						Filtered by: <span class="font-medium text-primary">{activeTag}</span>
					</p>
				{/if}
				{#if totalResults > 0}
					<p class="text-sm text-base-content/50 mt-1">{totalResults.toLocaleString()} results</p>
				{/if}
			</div>
			{#if results.length > 0}
				<button on:click={playAll} class="btn btn-primary btn-sm">
					<Icon icon="solar:play-bold" width="16" />
					Play All
				</button>
			{/if}
		</div>

		<!-- Content type tabs -->
		<div class="flex gap-1 mb-4 overflow-x-auto pb-1">
			{#each CONTENT_TYPES as ct}
				<a
					href="{base}/browse/{ct.id}{activeTag ? `?tag=${encodeURIComponent(activeTag)}` : ''}"
					class="btn btn-sm whitespace-nowrap gap-1.5"
					class:btn-primary={typeId === ct.id}
					class:btn-ghost={typeId !== ct.id}
				>
					<Icon icon={ct.icon} width="16" />
					{ct.name}
				</a>
			{/each}
		</div>

		<!-- Tag chips (content-type-specific) -->
		<div class="flex flex-wrap gap-2 mb-6">
			{#each (contentType.tags || POPULAR_TAGS) as tag}
				<button
					on:click={() => selectTag(tag)}
					class="badge badge-lg cursor-pointer transition-colors hover:bg-base-300"
					class:badge-primary={activeTag === tag}
					class:badge-outline={activeTag !== tag}
				>
					{tag}
				</button>
			{/each}
		</div>

		<!-- View toggle -->
		<div class="flex items-center justify-between mb-4">
			<div class="text-sm text-base-content/50">
				{#if isLoading}
					Loading...
				{:else}
					Showing {results.length} tracks
				{/if}
			</div>
			<div class="btn-group">
				<button
					on:click={() => viewMode = 'tiles'}
					class="btn btn-sm btn-ghost"
					class:btn-active={viewMode === 'tiles'}
				>
					<Icon icon="solar:widget-5-bold" width="18" />
				</button>
				<button
					on:click={() => viewMode = 'list'}
					class="btn btn-sm btn-ghost"
					class:btn-active={viewMode === 'list'}
				>
					<Icon icon="solar:list-bold" width="18" />
				</button>
			</div>
		</div>

		<!-- Results -->
		{#if isLoading}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
				{#each Array(12) as _}
					<SkeletonCard layout="grid" />
				{/each}
			</div>
		{:else if results.length > 0}
			{#if viewMode === 'tiles'}
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
					{#each results as item}
						<AudioCard
							item={{ ...(item), creator: item.artist }}
							type="track"
							layout="tile"
						/>
					{/each}
				</div>
			{:else}
				<div class="space-y-2">
					{#each results as item}
						<AudioCard
							item={{ ...(item), creator: item.artist }}
							type="track"
							layout="list"
						/>
					{/each}
				</div>
			{/if}

			<!-- Pagination -->
			{#if totalResults > 50}
				<div class="flex justify-center gap-2 mt-8">
					<button
						on:click={() => { currentPage--; }}
						class="btn btn-sm"
						disabled={currentPage <= 1}
					>
						Previous
					</button>
					<span class="btn btn-sm btn-ghost no-animation">
						Page {currentPage}
					</span>
					<button
						on:click={() => { currentPage++; }}
						class="btn btn-sm"
						disabled={results.length < 50}
					>
						Next
					</button>
				</div>
			{/if}
		{:else}
			<div class="text-center py-20 text-base-content/50">
				<Icon icon={contentType.icon} width="48" class="mx-auto mb-4 opacity-30" />
				<p class="text-lg">No {contentType.name.toLowerCase()} found</p>
				{#if activeTag}
					<p class="text-sm mt-2">Try a different tag or browse all {contentType.name.toLowerCase()}</p>
					<button on:click={() => selectTag(activeTag)} class="btn btn-sm btn-ghost mt-3">
						Clear filter
					</button>
				{/if}
			</div>
		{/if}
	{/if}
</div>
