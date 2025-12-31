<script lang="ts">
	import { search as searchAPI, getTrack, getAllTracks } from '$lib/services/internetArchive';
	import { player, currentTrack } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { library } from '$lib/stores/library';
	import { POPULAR_COLLECTIONS } from '$lib/utils/constants';
	import type { Track } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';
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

	onMount(() => {
		loadTrending();
	});

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
		return $currentTrack?.identifier === identifier;
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
	<div class="flex items-center justify-between mb-6">
		<h2 class="text-2xl md:text-3xl font-bold">Trending</h2>
		{#if results.length > 0}
			<button on:click={playAll} class="btn btn-primary btn-sm">
				Play All
			</button>
		{/if}
	</div>

	<!-- Collection Filter -->
	<div class="mb-6">
		<div class="flex items-center gap-2 flex-wrap">
			<button
				on:click={() => (selectedCollection = '')}
				class="btn btn-sm"
				class:btn-primary={selectedCollection === ''}
			>
				All Audio
			</button>
			{#each POPULAR_COLLECTIONS as collection}
				<button
					on:click={() => (selectedCollection = collection.id)}
					class="btn btn-sm"
					class:btn-primary={selectedCollection === collection.id}
				>
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
		<div class="flex justify-center items-center py-20">
			<span class="loading loading-spinner loading-lg text-primary"></span>
		</div>
	{:else if results.length > 0}
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
			{#each results as item, index}
				<div
					class="card bg-base-200 hover:bg-base-300 transition-colors group"
					class:ring-2={isCurrentTrack(item.identifier)}
					class:ring-primary={isCurrentTrack(item.identifier)}
				>
					<div class="card-body p-4">
						<!-- Rank Badge -->
						<div class="absolute top-2 left-2 badge badge-primary badge-sm">
							#{index + 1}
						</div>

						<!-- Thumbnail - Clickable -->
						<a href="/item/{item.identifier}" class="block mb-3 hover:opacity-80 transition-opacity">
							{#if item.thumbnailUrl}
								<img
									src={item.thumbnailUrl}
									alt={item.title}
									class="w-full aspect-square object-cover rounded bg-base-300"
								/>
							{:else}
								<div
									class="w-full aspect-square flex items-center justify-center bg-base-300 rounded"
								>
									<Icon icon="solar:music-note-bold" width="64" className="text-base-content/30" />
								</div>
							{/if}
						</a>

						<!-- Info - Clickable -->
						<a href="/item/{item.identifier}" class="block hover:text-primary transition-colors">
							<h3
								class="font-medium truncate mb-1"
								class:text-primary={isCurrentTrack(item.identifier)}
							>
								{item.title}
							</h3>
							<p class="text-sm text-base-content/70 truncate mb-2">{item.artist}</p>
						</a>

						<!-- Actions -->
						<div class="flex items-center gap-2 mt-auto">
							<button
								on:click={() => playTrack(item.identifier)}
								class="btn btn-sm flex-1"
								class:btn-primary={!isCurrentTrack(item.identifier)}
								class:btn-ghost={isCurrentTrack(item.identifier)}
								disabled={loadingTrack === item.identifier}
								title={isCurrentTrack(item.identifier) ? 'Playing' : 'Play'}
							>
								{#if loadingTrack === item.identifier}
									<span class="loading loading-spinner loading-xs"></span>
								{:else if isCurrentTrack(item.identifier)}
									<Icon icon="solar:pause-bold" width="20" />
								{:else}
									<Icon icon="solar:play-bold" width="20" />
								{/if}
							</button>
							<button
								on:click={() => toggleFavorite(item.identifier)}
								class="btn btn-ghost btn-sm btn-square"
								title={$library.favorites.includes(item.identifier) ? 'Remove from favorites' : 'Add to favorites'}
							>
								<Icon
									icon={$library.favorites.includes(item.identifier) ? 'solar:heart-bold' : 'solar:heart-linear'}
									width="18"
									className={$library.favorites.includes(item.identifier) ? 'text-red-500' : ''}
								/>
							</button>
							<button
								on:click={() => addToQueue(item.identifier)}
								class="btn btn-ghost btn-sm btn-square"
								disabled={loadingTrack === item.identifier}
								title="Add to queue"
							>
								<Icon icon="solar:add-circle-bold" width="18" />
							</button>
							<button
								on:click={() => handleShare(item)}
								class="btn btn-ghost btn-sm btn-square"
								title="Share track"
							>
								<Icon icon="solar:share-bold" width="18" />
							</button>
							<button
								on:click={() => toggleExpand(item.identifier)}
								class="btn btn-ghost btn-sm btn-square"
								title="Show all tracks"
							>
								<Icon
									icon={expandedItems.has(item.identifier) ? 'solar:alt-arrow-up-bold' : 'solar:alt-arrow-down-bold'}
									width="18"
								/>
							</button>
						</div>

						<!-- Expandable Chapter List -->
						{#if expandedItems.has(item.identifier)}
							<div class="mt-3 pt-3 border-t border-base-300">
								{#if loadingChapters.has(item.identifier)}
									<div class="flex justify-center py-4">
										<span class="loading loading-spinner loading-sm"></span>
									</div>
								{:else if itemChapters.has(item.identifier)}
									{@const chapters = itemChapters.get(item.identifier) || []}
									<div class="flex items-center justify-between mb-2">
										<p class="text-sm font-medium">{chapters.length} track{chapters.length !== 1 ? 's' : ''}</p>
										{#if chapters.length > 1}
											<button
												on:click={() => playAllChapters(item.identifier)}
												class="btn btn-xs btn-primary"
											>
												Play All
											</button>
										{/if}
									</div>
									<div class="max-h-64 overflow-y-auto space-y-1">
										{#each chapters as chapter, idx}
											<button
												on:click={() => playChapter(chapter)}
												class="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-base-300 transition-colors flex items-center gap-2"
											>
												<span class="text-base-content/50">{idx + 1}.</span>
												<span class="flex-1 truncate">{chapter.title}</span>
												{#if chapter.duration}
													<span class="text-base-content/50">
														{Math.floor(chapter.duration / 60)}:{String(Math.floor(chapter.duration % 60)).padStart(2, '0')}
													</span>
												{/if}
											</button>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
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
