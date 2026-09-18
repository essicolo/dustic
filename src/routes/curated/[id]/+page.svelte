<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { browser } from '$app/environment';
	import { getAllTracks } from '$lib/services/internetArchive';
	import { unifiedGetTrack as getTrack } from '$lib/services/sources';
	import { player } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { offline } from '$lib/stores/offline';
	import type { Track } from '$lib/types';
	import Icon from '@iconify/svelte';
	import AudioCard from '$lib/components/AudioCard.svelte';
	import PlaylistCover from '$lib/components/PlaylistCover.svelte';
	import SkeletonCard from '$lib/components/SkeletonCard.svelte';
	import curatedPlaylistsData from '$lib/data/curatedPlaylists.json';
	import { _ } from '$lib/i18n';

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
	let tracks: Track[] = [];
	let trackIndexMap: Map<string, number> = new Map(); // Maps track identifier to its trackIndex
	// Notes belong to the track, not to a position. Reading them back as
	// playlist.tracks[i] alongside filteredTracks[i] silently mismatches as
	// soon as one entry fails to resolve (a dark-archive item, say) or the
	// offline filter is on, and every note below it shifts up a row.
	let noteMap: Map<string, string> = new Map();
	let isLoading = false;
	let error = '';
	let viewMode: 'grid' | 'list' = 'list';
	let showOfflineOnly = false;

	$: playlistId = $page.params.id as string;
	// The curated list ships with the app, so the playlist itself needs no
	// network at all. Deriving it synchronously lets the title, description
	// and cover paint immediately while the tracks are still resolving —
	// previously the whole page sat behind one spinner until the last of
	// them came back.
	$: playlist =
		(curatedPlaylistsData.find((p) => p.id === playlistId) as CuratedPlaylist | undefined) ?? null;
	$: filteredTracks = showOfflineOnly
		? tracks.filter((t) => $offline.offlineTracks.some((ot) => ot.track.identifier === t.identifier))
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
			if (!playlist) {
				error = $_('curated.detailNotFound');
				return;
			}

			// Load track metadata for each item
			trackIndexMap.clear();
			noteMap.clear();
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

					if (track && item.note) noteMap.set(track.identifier, item.note);
					return track;
				} catch (e) {
					console.error(`Failed to load track ${item.identifier}:`, e);
					return null;
				}
			});

			const loadedTracks = await Promise.all(trackPromises);
			tracks = loadedTracks.filter((t): t is Track => t !== null);
			trackIndexMap = trackIndexMap; // Trigger reactivity
			noteMap = noteMap;

		} catch (e) {
			console.error('Error loading curated playlist:', e);
			error = $_('curated.detailLoadError');
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

<div class="p-4 md:p-8">
	<!-- Header with controls -->
	<div class="flex items-center justify-between mb-6">
		<button on:click={goBack} class="btn btn-ghost btn-sm">
			<Icon icon="solar:arrow-left-linear" width="20" />
			<span>{$_('common.back')}</span>
		</button>

		{#if tracks.length > 0}
			<div class="flex items-center gap-2 md:gap-3">
				<!-- View Mode Toggle -->
				<div class="btn-group">
					<button
						on:click={() => setViewMode('grid')}
						class="btn btn-sm"
						class:btn-active={viewMode === 'grid'}
						title={$_('viewMode.grid')}
					>
						<Icon icon="solar:widget-5-bold" width="18" />
					</button>
					<button
						on:click={() => setViewMode('list')}
						class="btn btn-sm"
						class:btn-active={viewMode === 'list'}
						title={$_('viewMode.list')}
					>
						<Icon icon="solar:list-bold" width="18" />
					</button>
				</div>

				<!-- Offline only toggle - Desktop -->
				<label class="label cursor-pointer gap-2 hidden md:flex">
					<Icon icon="solar:download-minimalistic-bold" width="20" />
					<span class="label-text">{$_('history.offlineOnly')}</span>
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
				<span class="label-text">{$_('history.offlineOnly')}</span>
			</label>
		</div>
	{/if}

	{#if error}
		<div class="alert alert-error mb-4">
			<Icon icon="solar:close-circle-bold" width="20" />
			<span>{error}</span>
		</div>
	{/if}

	{#if playlist}
		<!-- Header -->
		<div class="mb-8">
			<div class="flex items-start gap-4 mb-4">
				<PlaylistCover
					identifiers={playlist.tracks.map((t) => t.identifier)}
					alt={playlist.name}
					className="w-28 md:w-36 flex-shrink-0 rounded"
				/>
				<div class="flex-1">
					<div class="badge badge-primary badge-sm mb-2">{$_('curated.badge')}</div>
					<h1 class="text-3xl md:text-4xl font-bold mb-2">{playlist.name}</h1>
					<p class="text-base-content/70 mb-3">{playlist.description}</p>
					<div class="flex items-center gap-2 text-sm text-base-content/60">
						<Icon icon="solar:user-circle-bold" width="16" />
						<span>{$_('curated.curatedByShort', { values: { curator: playlist.curator } })}</span>
						<span class="mx-2">•</span>
						<span>
							{#if showOfflineOnly && filteredTracks.length !== tracks.length}
								{$_('curated.trackCountOf', { values: { filtered: filteredTracks.length, total: tracks.length } })}
							{:else}
								<!-- Count from the shipped list while the tracks are
								     still resolving, so the header does not read
								     "0 tracks" for a second. -->
								{$_('curated.trackCount', {
									values: { count: isLoading ? playlist.tracks.length : tracks.length }
								})}
							{/if}
						</span>
					</div>
				</div>
			</div>

			{#if tracks.length > 0}
				<div class="flex gap-2">
					<button on:click={playAll} class="btn btn-primary gap-2">
						<Icon icon="solar:play-bold" width="20" />
						<span>{$_('common.playAll')}</span>
					</button>
				</div>
			{/if}
		</div>

		<!-- Tracks -->
		{#if isLoading}
			<!-- Skeletons in the shape of the rows that are coming, sized from
			     the track count we already know. -->
			<div class="divide-y divide-base-300 border-y border-base-300">
				{#each playlist.tracks.slice(0, 8) as item (item.identifier)}
					<SkeletonCard layout="list" />
				{/each}
			</div>
		{:else if tracks.length === 0}
			<div class="text-center py-20 text-base-content/50">
				<p class="text-lg">{$_('curated.emptyTracks')}</p>
			</div>
		{:else if filteredTracks.length === 0}
			<div class="text-center py-20 text-base-content/50">
				<p class="text-lg">{$_('curated.emptyOffline')}</p>
				<p class="text-sm mt-2">{$_('curated.emptyOfflineHint')}</p>
			</div>
		{:else if viewMode === 'grid'}
			<!-- Grid View -->
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
				{#each filteredTracks as track (track.identifier)}
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
						<AudioCard item={track} type="track" layout="tile" />
						{#if noteMap.get(track.identifier)}
							<div class="text-xs text-base-content/50 italic mt-1 px-2">
								{noteMap.get(track.identifier)}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<!-- List View -->
			<div class="space-y-2">
				{#each filteredTracks as track (track.identifier)}
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
						{#if noteMap.get(track.identifier)}
							<div class="text-xs text-base-content/50 italic ml-16 mt-1">
								{noteMap.get(track.identifier)}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
