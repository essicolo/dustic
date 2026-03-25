<script lang="ts">
	import { page } from '$app/stores';
	import { search as fwSearch, getRandomTracks } from '$lib/services/funkwhale';
	import { player } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import type { Track } from '$lib/types';
	import { onMount } from 'svelte';
	import AudioCard from '$lib/components/AudioCard.svelte';
	import SkeletonCard from '$lib/components/SkeletonCard.svelte';
	import Icon from '@iconify/svelte';

	let results: Track[] = [];
	let isLoading = false;
	let error = '';
	let viewMode: 'tiles' | 'list' = 'tiles';

	$: host = $page.params.host || '';
	$: category = $page.url.searchParams.get('q') || '';
	$: instanceUrl = `https://${host}`;
	$: pageTitle = category || 'Recent tracks';

	onMount(() => {
		loadTracks();
	});

	// Reload when category changes
	$: if (host && typeof window !== 'undefined') {
		loadTracks();
	}

	async function loadTracks() {
		isLoading = true;
		error = '';
		results = [];

		try {
			if (category) {
				const result = await fwSearch({
					query: category,
					pageSize: 50
				});
				results = result.items;
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
