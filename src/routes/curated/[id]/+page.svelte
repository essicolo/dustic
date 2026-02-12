<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { browser } from '$app/environment';
	import { getTrack } from '$lib/services/internetArchive';
	import { player } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
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
			note?: string;
		}>;
	}

	let playlistId = '';
	let playlist: CuratedPlaylist | null = null;
	let tracks: Track[] = [];
	let isLoading = false;
	let error = '';

	$: playlistId = $page.params.id;

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
			const trackPromises = playlist.tracks.map(async (item) => {
				try {
					const track = await getTrack(item.identifier);
					return track;
				} catch (e) {
					console.error(`Failed to load track ${item.identifier}:`, e);
					return null;
				}
			});

			const loadedTracks = await Promise.all(trackPromises);
			tracks = loadedTracks.filter((t): t is Track => t !== null);

		} catch (e) {
			console.error('Error loading curated playlist:', e);
			error = 'Failed to load curated playlist';
		} finally {
			isLoading = false;
		}
	}

	async function playAll() {
		if (tracks.length === 0) return;
		queue.setQueue(tracks, 0);
		player.play(tracks[0]);
	}

	onMount(() => {
		loadPlaylist();
	});
</script>

<div class="p-4 md:p-8 max-w-6xl mx-auto">
	<!-- Back Button -->
	<button on:click={goBack} class="btn btn-ghost btn-sm mb-6">
		<Icon icon="solar:arrow-left-linear" width="20" />
		<span>Back</span>
	</button>

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
						<span>{tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}</span>
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
		{#if tracks.length > 0}
			<div class="space-y-2">
				{#each tracks as track, index}
					<div class="relative">
						<AudioCard item={track} type="album" layout="list" />
						{#if playlist.tracks[index]?.note}
							<div class="text-xs text-base-content/50 italic ml-16 mt-1">
								{playlist.tracks[index].note}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<div class="text-center py-20 text-base-content/50">
				<p class="text-lg">No tracks available in this playlist</p>
			</div>
		{/if}
	{/if}
</div>
