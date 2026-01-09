<script lang="ts">
	import { search as searchAPI, getTrack, getAllTracks } from '$lib/services/internetArchive';
	import { player, currentTrack } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { library } from '$lib/stores/library';
	import { history } from '$lib/stores/history';
	import { POPULAR_COLLECTIONS } from '$lib/utils/constants';
	import type { Track } from '$lib/types';
	import Icon from '@iconify/svelte';
	import PlayingIndicator from '$lib/components/PlayingIndicator.svelte';
	import SkeletonCard from '$lib/components/SkeletonCard.svelte';
	import AudioCard from '$lib/components/AudioCard.svelte';
	import { onMount } from 'svelte';
	import { shareTrack } from '$lib/utils/share';
	import { batchExecute } from '$lib/utils/throttle';

	let selectedCollection: string = '';
	let results: Track[] = [];
	let isLoading = false;
	let error = '';
	let loadingTrack: string | null = null;
	let shareMessage = '';
	let showShareToast = false;
	let expandedItems: Set<string> = new Set();
	let itemChapters: Map<string, Track[]> = new Map();
	let loadingChapters: Set<string> = new Set();
	let continueListening: Track[] = [];
	let isLoadingContinue = false;
	let viewMode: 'tiles' | 'list' = 'tiles';
	let failedImages = new Set<string>(); // Track failed image loads

	onMount(() => {
		loadContinueListening();
		loadTrending();
	});

	function handleImageError(identifier: string) {
		failedImages.add(identifier);
		failedImages = failedImages; // Trigger reactivity
	}

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

	async function loadTrending() {
		isLoading = true;
		error = '';

		try {
			const result = await searchAPI({
				query: selectedCollection ? `collection:${selectedCollection}` : 'mediatype:audio',
				sort: 'downloads',
				page: 1,
				pageSize: 100
			});
			results = result.items;
		} catch (e) {
			error = 'Failed to load trending tracks.';
			console.error(e);
		} finally {
			isLoading = false;
		}
	}

	async function playTrack(identifier: string) {
		loadingTrack = identifier;
		error = ''; // Clear previous errors
		try {
			const track = await getTrack(identifier);
			if (track) {
				queue.setQueue([track], 0);
				player.play(track);
			} else {
				error = 'This track has no playable audio files. Try another one.';
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
		error = ''; // Clear previous errors
		try {
			const track = await getTrack(identifier);
			if (track) {
				queue.addToEnd(track);
			} else {
				error = 'This track has no playable audio files.';
			}
		} catch (e) {
			console.error('Failed to add track:', e);
			error = 'Failed to load track.';
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

	async function toggleExpand(identifier: string) {
		const wasExpanded = expandedItems.has(identifier);

		if (wasExpanded) {
			expandedItems.delete(identifier);
		} else {
			expandedItems.add(identifier);
		}

		// Trigger reactivity by creating new Set
		expandedItems = new Set(expandedItems);

		// Load chapters if not already loaded
		if (!wasExpanded && !itemChapters.has(identifier)) {
			loadingChapters.add(identifier);
			loadingChapters = new Set(loadingChapters);

			try {
				const chapters = await getAllTracks(identifier);
				itemChapters.set(identifier, chapters);
				itemChapters = new Map(itemChapters);
			} catch (e) {
				console.error('Failed to load chapters:', e);
				error = 'Failed to load chapters';
			} finally {
				loadingChapters.delete(identifier);
				loadingChapters = new Set(loadingChapters);
			}
		}
	}

	async function playAllChapters(identifier: string) {
		const chapters = itemChapters.get(identifier);
		if (chapters && chapters.length > 0) {
			queue.setQueue(chapters, 0);
			player.play(chapters[0]);
		}
	}

	async function playChapter(chapter: Track) {
		queue.addToEnd(chapter);
		player.play(chapter);
	}

	$: if (selectedCollection !== undefined) {
		loadTrending();
	}
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
		<div class="mb-8">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-xl md:text-2xl font-bold">Continue Listening</h2>
				<a href="/history" class="btn btn-ghost btn-sm">
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

	<!-- Trending Section -->
	<div class="flex items-center justify-between mb-6">
		<h2 class="text-2xl md:text-3xl font-bold">Trending</h2>
		<div class="flex items-center gap-2">
			{#if results.length > 0}
				<button on:click={playAll} class="btn btn-primary btn-sm">Play All</button>
			{/if}
		</div>
	</div>

	<!-- Collection Filter -->
	<div class="mb-6">
		<div class="flex items-center gap-2 flex-wrap">
			<button
				on:click={() => (selectedCollection = '')}
				class="btn btn-sm {selectedCollection === '' ? 'btn-primary' : ''}"
			>
				All Audio
			</button>
			{#each POPULAR_COLLECTIONS as collection}
				<button
					on:click={() => (selectedCollection = collection.id)}
									class="btn btn-sm {selectedCollection === collection.id ? 'btn-primary' : ''}"				>
					{collection.name}
				</button>
			{/each}
		</div>
	</div>

	{#if error}
		<div class="alert alert-error mb-4">
			<span>{error}</span>
		</div>
	{/if}

	{#if isLoading}
		<!-- Skeleton loaders -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
			{#each Array(12) as _}
				<SkeletonCard layout="grid" />
			{/each}
		</div>
	{:else if results.length > 0}
			{#if viewMode === 'tiles'}
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
					{#each results as item, index}
						<AudioCard item={item} type="album" layout="tile" />
					{/each}
				</div>
			{:else}
				<div class="space-y-2">
					{#each results as item}
						<AudioCard item={item} type="album" layout="list" />
					{/each}
				</div>
			{/if}
	{:else}
		<div class="text-center py-20 text-base-content/50">
			<p class="text-lg">No trending tracks found</p>
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
