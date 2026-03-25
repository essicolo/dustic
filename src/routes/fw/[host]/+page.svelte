<script lang="ts">
	import { page } from '$app/stores';
	import { searchInstance, getRandomTracks } from '$lib/services/funkwhale';
	import { player } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import type { Track } from '$lib/types';
	import AudioCard from '$lib/components/AudioCard.svelte';
	import SkeletonCard from '$lib/components/SkeletonCard.svelte';
	import Icon from '@iconify/svelte';

	let results: Track[] = [];
	let isLoading = false;
	let error = '';
	let viewMode: 'tiles' | 'list' = 'tiles';
	let lastLoadKey = '';

	$: host = $page.params.host || '';
	$: category = $page.url.searchParams.get('q') || '';
	$: instanceUrl = `https://${host}`;
	$: pageTitle = category ? category.charAt(0).toUpperCase() + category.slice(1) : 'Recent tracks';

	// Reactive load: re-fetch when host OR category changes
	$: loadKey = `${host}:${category}`;
	$: if (loadKey && typeof window !== 'undefined' && loadKey !== lastLoadKey) {
		lastLoadKey = loadKey;
		loadTracks();
	}

	async function loadTracks() {
		if (!host) return;
		isLoading = true;
		error = '';
		results = [];

		try {
			if (category) {
				// Search this specific instance only (not all instances)
				const result = await searchInstance(instanceUrl, category, 50);
				results = result.tracks;
			} else {
				results = await getRandomTracks(instanceUrl, 50);
			}
		} catch (e: any) {
			error = `Failed to load tracks from ${host}`;
			console.error(e);
		} finally {
			isLoading = false;
		}
	}

	async function playAll() {
		if (results.length === 0) return;
		const tracks = results.filter(t => t.streamUrl);
		if (tracks.length > 0) {
			queue.setQueue(tracks, 0);
			player.play(tracks[0]);
		}
	}

	function setViewMode(mode: 'tiles' | 'list') {
		viewMode = mode;
	}
</script>

<div class="p-4 md:p-8">
	<div class="flex items-center justify-between mb-6">
		<div>
			<h2 class="text-3xl font-bold">{pageTitle}</h2>
			<p class="text-sm text-base-content/70 mt-1 flex items-center gap-1.5">
				<img src="/funkwhale-icon.svg" alt="FunkWhale" class="w-4 h-4 opacity-60" />
				{host}
				{#if results.length > 0}
					&mdash; {results.length} tracks
				{/if}
			</p>
		</div>
		{#if results.length > 0}
			<button on:click={playAll} class="btn btn-primary">
				Play All
			</button>
		{/if}
	</div>

	<!-- View Mode Toggle -->
	<div class="flex items-center justify-end mb-6">
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
						type="track"
						layout="tile"
					/>
				{/each}
			</div>
		{:else}
			<div class="space-y-2 mb-6">
				{#each results as item}
					<AudioCard
						item={{ ...(item as any), creator: item.artist }}
						type="track"
						layout="list"
					/>
				{/each}
			</div>
		{/if}
	{:else if !isLoading}
		<div class="text-center py-20 text-base-content/50">
			<p class="text-lg">No tracks found</p>
			<p class="text-sm mt-2">Try a different category or check if {host} is online</p>
		</div>
	{/if}
</div>
