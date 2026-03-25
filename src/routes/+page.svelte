<script lang="ts">
	import { search as searchAPI, getAllTracks } from '$lib/services/internetArchive';
	import { unifiedGetTrack as getTrack } from '$lib/services/sources';
	import { player, currentTrack } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { library } from '$lib/stores/library';
	import { history } from '$lib/stores/history';
	import type { Track } from '$lib/types';
	import Icon from '@iconify/svelte';
	import PlayingIndicator from '$lib/components/PlayingIndicator.svelte';
	import SkeletonCard from '$lib/components/SkeletonCard.svelte';
	import AudioCard from '$lib/components/AudioCard.svelte';
	import { onMount } from 'svelte';
	import { shareTrack } from '$lib/utils/share';
	import { batchExecute } from '$lib/utils/throttle';
	import { base } from '$app/paths';
	import curatedPlaylistsData from '$lib/data/curatedPlaylists.json';

	let error = '';
	let loadingTrack: string | null = null;
	let shareMessage = '';
	let showShareToast = false;
	let continueListening: Track[] = [];
	let isLoadingContinue = false;
	let viewMode: 'tiles' | 'list' = 'tiles';

	onMount(() => {
		loadContinueListening();
	});

	async function loadContinueListening() {
		isLoadingContinue = true;
		// Get recent history entries (last 10)
		const recentEntries = $history.entries.slice(0, 10);

		if (recentEntries.length === 0) {
			isLoadingContinue = false;
			return;
		}

		// Load track data for recent items
		const trackTasks = recentEntries.map((entry) => async () => {
			try {
				const track = await getTrack(entry.trackId);
				if (!track) {
					console.warn(`Failed to load track: ${entry.trackId}`);
				}
				return track;
			} catch (err) {
				console.error(`Error loading track ${entry.trackId}:`, err);
				return null;
			}
		});

		const tracks = await batchExecute(trackTasks, 3, 500);
		continueListening = tracks.filter((t): t is Track => t !== null);
		console.log(`Loaded ${continueListening.length} / ${recentEntries.length} continue listening tracks`);
		isLoadingContinue = false;
	}

	function isCurrentTrack(identifier: string): boolean {
		if (!$currentTrack) return false;
		// Handle chapter identifiers (format: "itemId#index")
		const currentId = $currentTrack.identifier.split('#')[0];
		const trackId = identifier.split('#')[0];
		return currentId === trackId;
	}

	function toggleFavorite(identifier: string) {
		library.toggleFavorite(identifier);
	}

	async function handleShare(item: Track) {
		const result = await shareTrack(item);
		shareMessage = result.message;
		showShareToast = true;
		setTimeout(() => {
			showShareToast = false;
		}, 3000);
	}

	$: favorites = $library.favorites;
	$: playlists = Object.values($library.playlists).sort((a, b) => b.updated - a.updated);
	$: curatedPlaylists = curatedPlaylistsData.slice(0, 4); // Show first 4 curated playlists
</script>

<div class="p-4 md:p-8">
	<!-- Page Header / Controls -->
	<div class="flex justify-end mb-4">
		<div class="btn-group" role="group" aria-label="View mode">
			<button
				on:click={() => (viewMode = 'tiles')}
				class="btn btn-sm btn-ghost {viewMode === 'tiles' ? 'btn-active' : ''}"
				title="Tiles view"
			>
				<Icon icon="solar:widget-5-bold" width="20" />
			</button>
			<button
				on:click={() => (viewMode = 'list')}
				class="btn btn-sm btn-ghost {viewMode === 'list' ? 'btn-active' : ''}"
				title="List view"
			>
				<Icon icon="solar:list-bold" width="20" />
			</button>
		</div>
	</div>

	<!-- Continue Listening Section -->
	{#if continueListening.length > 0}
		<div class="mb-12">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-xl md:text-2xl font-bold">Continue Listening</h2>
				<a href="{base}/history" class="btn btn-ghost btn-sm">
					View All
					<Icon icon="solar:arrow-right-linear" width="16" />
				</a>
			</div>

			<!-- Horizontal scrollable carousel / list -->
			<div class="overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0">
				{#if viewMode === 'tiles'}
					<div
						class="flex gap-4 min-w-max md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:min-w-0 p-1"
					>
						{#each continueListening as track}
							<div class="w-64 md:w-auto flex-shrink-0">
								<AudioCard
									item={{ ...(track as any), creator: track.artist, tracks: [track] }}
									type="track"
									layout="tile"
								/>
							</div>
						{/each}
					</div>
				{:else}
					<div class="space-y-2">
						{#each continueListening as track}
							<AudioCard
								item={{ ...(track as any), creator: track.artist, tracks: [track] }}
								type="track"
								layout="list"
							/>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Curated Playlists Section -->
	{#if curatedPlaylists.length > 0}
		<div class="mb-12">
			<div class="flex items-center justify-between mb-4">
				<div>
					<h2 class="text-xl md:text-2xl font-bold flex items-center gap-2">
						<span>Curated Playlists</span>
						<Icon icon="solar:star-bold" width="20" class="text-primary" />
					</h2>
					<p class="text-sm text-base-content/60 mt-1">Hand-picked by the Dustic team</p>
				</div>
				<a href="{base}/curated" class="btn btn-ghost btn-sm">
					View All
					<Icon icon="solar:arrow-right-linear" width="16" />
				</a>
			</div>

			<div class="overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0">
				{#if viewMode === 'tiles'}
					<div
						class="flex gap-4 min-w-max md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:min-w-0 p-1"
					>
						{#each curatedPlaylists as playlist}
							<a
								href="{base}/curated/{playlist.id}"
								class="w-64 md:w-auto flex-shrink-0 card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer"
							>
								<div class="card-body p-6">
									<div class="bg-gradient-to-br from-primary to-secondary p-4 rounded-lg mb-3">
										<Icon icon="solar:star-bold" width="32" class="text-primary-content mx-auto" />
									</div>
									<h3 class="card-title text-base">{playlist.name}</h3>
									<p class="text-sm text-base-content/60 line-clamp-2">{playlist.description}</p>
									<div class="text-xs text-base-content/50 mt-2">
										{playlist.tracks.length} {playlist.tracks.length === 1 ? 'track' : 'tracks'}
									</div>
								</div>
							</a>
						{/each}
					</div>
				{:else}
					<div class="space-y-2">
						{#each curatedPlaylists as playlist}
							<a
								href="{base}/curated/{playlist.id}"
								class="card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer"
							>
								<div class="card-body p-4 flex-row items-center gap-4">
									<div class="bg-gradient-to-br from-primary to-secondary p-3 rounded-lg flex-shrink-0">
										<Icon icon="solar:star-bold" width="24" class="text-primary-content" />
									</div>
									<div class="flex-1 min-w-0">
										<h3 class="font-semibold">{playlist.name}</h3>
										<p class="text-sm text-base-content/60 truncate">{playlist.description}</p>
										<div class="text-xs text-base-content/50 mt-1">
											{playlist.tracks.length} {playlist.tracks.length === 1 ? 'track' : 'tracks'}
										</div>
									</div>
									<Icon icon="solar:arrow-right-linear" width="20" class="text-base-content/40 flex-shrink-0" />
								</div>
							</a>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Library Section -->
	{#if favorites.length > 0 || playlists.length > 0}
		<div class="mb-12">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-xl md:text-2xl font-bold">Your Library</h2>
				<a href="{base}/library" class="btn btn-ghost btn-sm">
					View All
					<Icon icon="solar:arrow-right-linear" width="16" />
				</a>
			</div>

			<!-- Favorites -->
			{#if favorites.length > 0}
				<div class="mb-6">
					<h3 class="text-lg font-semibold mb-3 flex items-center gap-2">
						<Icon icon="solar:heart-bold" width="18" class="text-error" />
						<span>Favorites</span>
						<span class="text-sm text-base-content/50 font-normal">({favorites.length})</span>
					</h3>
					<a
						href="{base}/library/favorites"
						class="card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer"
					>
						<div class="card-body p-4 flex-row items-center gap-4">
							<div class="bg-error/20 p-3 rounded-lg flex-shrink-0">
								<Icon icon="solar:heart-bold" width="24" class="text-error" />
							</div>
							<div class="flex-1">
								<h4 class="font-semibold">Favorites</h4>
								<p class="text-sm text-base-content/60">{favorites.length} {favorites.length === 1 ? 'track' : 'tracks'}</p>
							</div>
							<Icon icon="solar:arrow-right-linear" width="20" class="text-base-content/40 flex-shrink-0" />
						</div>
					</a>
				</div>
			{/if}

			<!-- Playlists -->
			{#if playlists.length > 0}
				<div>
					<h3 class="text-lg font-semibold mb-3 flex items-center gap-2">
						<Icon icon="solar:list-heart-bold" width="18" class="text-primary" />
						<span>Playlists</span>
						<span class="text-sm text-base-content/50 font-normal">({playlists.length})</span>
					</h3>
					<div class="space-y-2">
						{#each playlists.slice(0, 5) as playlist}
							<a
								href="{base}/library/playlists/{playlist.id}"
								class="card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer"
							>
								<div class="card-body p-4 flex-row items-center gap-4">
									<div class="bg-primary/20 p-3 rounded-lg flex-shrink-0">
										<Icon icon="solar:list-heart-bold" width="24" class="text-primary" />
									</div>
									<div class="flex-1 min-w-0">
										<h4 class="font-semibold truncate">{playlist.name}</h4>
										<p class="text-sm text-base-content/60">{playlist.tracks.length} {playlist.tracks.length === 1 ? 'track' : 'tracks'}</p>
									</div>
									<Icon icon="solar:arrow-right-linear" width="20" class="text-base-content/40 flex-shrink-0" />
								</div>
							</a>
						{/each}
						{#if playlists.length > 5}
							<a href="{base}/library/playlists" class="btn btn-ghost btn-sm w-full">
								View all {playlists.length} playlists
							</a>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Empty State -->
	{#if continueListening.length === 0 && favorites.length === 0 && playlists.length === 0}
		<div class="text-center py-20">
			<div class="mb-6">
				<Icon icon="solar:music-library-2-bold" width="64" class="text-base-content/20 mx-auto" />
			</div>
			<h3 class="text-2xl font-bold mb-2">Welcome to Dustic</h3>
			<p class="text-base-content/60 mb-6">Start exploring music from the Internet Archive</p>
			<div class="flex gap-3 justify-center flex-wrap">
				<a href="{base}/search" class="btn btn-primary">
					<Icon icon="solar:magnifer-bold" width="20" />
					Search Music
				</a>
				<a href="{base}/curated" class="btn btn-outline">
					<Icon icon="solar:star-bold" width="20" />
					View Curated Playlists
				</a>
			</div>
		</div>
	{/if}

	{#if error}
		<div class="alert alert-error mb-4">
			<span>{error}</span>
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
