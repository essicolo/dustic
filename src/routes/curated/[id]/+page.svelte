<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { browser } from '$app/environment';
	import { getTrack, getAllTracks } from '$lib/services/internetArchive';
	import { player } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { offline } from '$lib/stores/offline';
	import type { Track } from '$lib/types';
	import Icon from '@iconify/svelte';
	import AudioCard from '$lib/components/AudioCard.svelte';
	import curatedPlaylistsData from '$lib/data/curatedPlaylists.json';

	interface CuratedPlaylist {
		id: string;
		name: string;
		description: string;
		curator: string;
		tracks: Array<{
			identifier: string;
			trackIndex?: number;
			note?: string;
		}>;
	}

	let playlistId = '';
	let playlist: CuratedPlaylist | null = null;
	let tracks: Track[] = [];
	let trackIndexMap: Map<string, number> = new Map(); // Maps track identifier to its trackIndex
	let isLoading = false;
	let error = '';
	let viewMode: 'grid' | 'list' = 'list';
	let showOfflineOnly = false;

	$: playlistId = $page.params.id;
	$: filteredTracks = showOfflineOnly
		? tracks.filter((t) => $offline.downloadedTracks[t.identifier])
		: tracks;

	// Load view preference from localStorage
	onMount(() => {
		if (browser) {
			const savedView = localStorage.getItem('curated-view');
			if (savedView === 'grid' || savedView === 'list') {
				viewMode = savedView;
			}
		}
	});

	function setViewMode(mode: 'grid' | 'list') {
		viewMode = mode;
		if (browser) {
			localStorage.setItem('curated-view', mode);
		}
	}

	// Smart back navigation
	function goBack() {
		if (browser && window.history.length > 1) {
			window.history.back();
		} else {
			goto(`${base}/curated`);
		}
	}

	async function loadPlaylist() {
		isLoading = true;
		error = '';

		try {
			// Find the playlist in the curated data
			const foundPlaylist = curatedPlaylistsData.find(p => p.id === playlistId);

			if (!foundPlaylist) {
				error = 'Curated playlist not found';
				return;
			}

			playlist = foundPlaylist as CuratedPlaylist;

			// Load track metadata for each item
			trackIndexMap.clear();
			const trackPromises = playlist.tracks.map(async (item) => {
				try {
					let track: Track | null = null;

					if (item.trackIndex !== undefined) {
						// Load specific track from album
						const allTracks = await getAllTracks(item.identifier);
						if (allTracks && allTracks[item.trackIndex]) {
							track = allTracks[item.trackIndex];
							// Store the trackIndex for this track
							trackIndexMap.set(track.identifier, item.trackIndex);
						}
					} else {
						// Load single track
						track = await getTrack(item.identifier);
					}

					return track;
				} catch (e) {
					console.error(`Failed to load track ${item.identifier}:`, e);
					return null;
				}
			});

			const loadedTracks = await Promise.all(trackPromises);
			tracks = loadedTracks.filter((t): t is Track => t !== null);
			trackIndexMap = trackIndexMap; // Trigger reactivity

		} catch (e) {
			console.error('Error loading curated playlist:', e);
			error = 'Failed to load curated playlist';
		} finally {
			isLoading = false;
		}
	}

	async function playAll() {
		if (filteredTracks.length === 0) return;
		queue.setQueue(filteredTracks, 0);
		player.play(filteredTracks[0]);
	}

	onMount(() => {
		loadPlaylist();
	});
</script>

<div class="p-4 md:p-8 max-w-6xl mx-auto">
	<!-- Header with controls -->
	<div class="flex items-center justify-between mb-6">
		<button on:click={goBack} class="btn btn-ghost btn-sm">
			<Icon icon="solar:arrow-left-linear" width="20" />
			<span>Back</span>
		</button>

		{#if tracks.length > 0}
			<div class="flex items-center gap-2 md:gap-3">
				<!-- View Mode Toggle -->
				<div class="btn-group">
					<button
						on:click={() => setViewMode('grid')}
						class="btn btn-sm"
						class:btn-active={viewMode === 'grid'}
						title="Grid view"
					>
						<Icon icon="solar:widget-5-bold" width="18" />
					</button>
					<button
						on:click={() => setViewMode('list')}
						class="btn btn-sm"
						class:btn-active={viewMode === 'list'}
						title="List view"
					>
						<Icon icon="solar:list-bold" width="18" />
					</button>
				</div>

				<!-- Offline only toggle - Desktop -->
				<label class="label cursor-pointer gap-2 hidden md:flex">
					<Icon icon="solar:download-minimalistic-bold" width="20" />
					<span class="label-text">Offline only</span>
					<input type="checkbox" bind:checked={showOfflineOnly} class="toggle toggle-primary" />
				</label>
			</div>
		{/if}
	</div>

	<!-- Mobile: Offline toggle -->
	{#if tracks.length > 0}
		<div class="md:hidden mb-4">
			<label class="label cursor-pointer gap-2 justify-start">
				<input type="checkbox" bind:checked={showOfflineOnly} class="toggle toggle-primary" />
				<Icon icon="solar:download-minimalistic-bold" width="20" />
				<span class="label-text">Offline only</span>
			</label>
		</div>
	{/if}

	{#if error}
		<div class="alert alert-error mb-4">
			<Icon icon="solar:close-circle-bold" width="20" />
			<span>{error}</span>
		</div>
	{/if}

	{#if isLoading}
		<div class="flex justify-center items-center py-20">
			<span class="loading loading-spinner loading-lg text-primary"></span>
		</div>
	{:else if playlist}
		<!-- Header -->
		<div class="mb-8">
			<div class="flex items-start gap-4 mb-4">
				<div class="bg-gradient-to-br from-primary to-secondary p-6 rounded-2xl flex-shrink-0">
					<Icon icon="solar:star-bold" width="48" class="text-primary-content" />
				</div>
				<div class="flex-1">
					<div class="badge badge-primary badge-sm mb-2">Curated Playlist</div>
					<h1 class="text-3xl md:text-4xl font-bold mb-2">{playlist.name}</h1>
					<p class="text-base-content/70 mb-3">{playlist.description}</p>
					<div class="flex items-center gap-2 text-sm text-base-content/60">
						<Icon icon="solar:user-circle-bold" width="16" />
						<span>Curated by {playlist.curator}</span>
						<span class="mx-2">•</span>
						<span>
							{#if showOfflineOnly && filteredTracks.length !== tracks.length}
								{filteredTracks.length} of {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
							{:else}
								{tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
							{/if}
						</span>
					</div>
				</div>
			</div>

			{#if tracks.length > 0}
				<div class="flex gap-2">
					<button on:click={playAll} class="btn btn-primary gap-2">
						<Icon icon="solar:play-bold" width="20" />
						<span>Play All</span>
					</button>
				</div>
			{/if}
		</div>

		<!-- Tracks -->
		{#if tracks.length === 0}
			<div class="text-center py-20 text-base-content/50">
				<p class="text-lg">No tracks available in this playlist</p>
			</div>
		{:else if filteredTracks.length === 0}
			<div class="text-center py-20 text-base-content/50">
				<p class="text-lg">No offline tracks in this playlist</p>
				<p class="text-sm mt-2">Download some tracks to see them here</p>
			</div>
		{:else if viewMode === 'grid'}
			<!-- Grid View -->
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
				{#each filteredTracks as track, index}
					<div
						class="relative cursor-pointer"
						on:click={() => {
							const trackIdx = trackIndexMap.get(track.identifier);
							const url = trackIdx !== undefined
								? `${base}/item/${track.identifier.split('#')[0]}?track=${trackIdx}`
								: `${base}/item/${track.identifier}`;
							goto(url);
						}}
						on:keydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								const trackIdx = trackIndexMap.get(track.identifier);
								const url = trackIdx !== undefined
									? `${base}/item/${track.identifier.split('#')[0]}?track=${trackIdx}`
									: `${base}/item/${track.identifier}`;
								goto(url);
							}
						}}
						role="button"
						tabindex="0"
					>
						<AudioCard item={track} type="track" layout="grid" />
						{#if playlist.tracks[index]?.note}
							<div class="text-xs text-base-content/50 italic mt-1 px-2">
								{playlist.tracks[index].note}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<!-- List View -->
			<div class="space-y-2">
				{#each filteredTracks as track, index}
					<div
						class="relative cursor-pointer"
						on:click={() => {
							const trackIdx = trackIndexMap.get(track.identifier);
							const url = trackIdx !== undefined
								? `${base}/item/${track.identifier.split('#')[0]}?track=${trackIdx}`
								: `${base}/item/${track.identifier}`;
							goto(url);
						}}
						on:keydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								const trackIdx = trackIndexMap.get(track.identifier);
								const url = trackIdx !== undefined
									? `${base}/item/${track.identifier.split('#')[0]}?track=${trackIdx}`
									: `${base}/item/${track.identifier}`;
								goto(url);
							}
						}}
						role="button"
						tabindex="0"
					>
						<AudioCard item={track} type="track" layout="list" />
						{#if playlist.tracks[index]?.note}
							<div class="text-xs text-base-content/50 italic ml-16 mt-1">
								{playlist.tracks[index].note}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
