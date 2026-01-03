<script lang="ts">
	import { search as searchAPI, getTrack, getAllTracks } from '$lib/services/internetArchive';
	import { player, currentTrack } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { library } from '$lib/stores/library';
	import { history } from '$lib/stores/history';
	import { POPULAR_COLLECTIONS } from '$lib/utils/constants';
	import type { Track } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';
	import PlayingIndicator from '$lib/components/PlayingIndicator.svelte';
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

	onMount(() => {
		loadContinueListening();
		loadTrending();
	});

	async function loadContinueListening() {
		isLoadingContinue = true;
		// Get recent history entries (last 10)
		const recentEntries = $history.entries.slice(0, 10);

		// Load track data for recent items
		const trackTasks = recentEntries.map((entry) => async () => {
			try {
				return await getTrack(entry.trackId);
			} catch {
				return null;
			}
		});

		const tracks = await batchExecute(trackTasks, 3, 500);
		continueListening = tracks.filter((t): t is Track => t !== null);
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

			<!-- Horizontal scrollable carousel -->
			<div class="overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0">
				<div class="flex gap-4 min-w-max md:grid md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 md:min-w-0">
					{#each continueListening as track}
						<div
							class="card bg-base-200 hover:bg-base-300 transition-colors group relative w-40 md:w-auto flex-shrink-0"
							class:ring-2={isCurrentTrack(track.identifier)}
							class:ring-primary={isCurrentTrack(track.identifier)}
						>
							<div class="card-body p-3">
								<!-- Thumbnail - Clickable -->
								<a href="/item/{track.identifier}" class="block mb-2 hover:opacity-80 transition-opacity relative">
									{#if track.thumbnailUrl}
										<img
											src={track.thumbnailUrl}
											alt={track.title}
											class="w-full aspect-square object-cover rounded bg-base-300"
										/>
									{:else}
										<div class="w-full aspect-square flex items-center justify-center bg-base-300 rounded">
											<Icon icon="solar:music-note-bold" width="48" className="text-base-content/30" />
										</div>
									{/if}

									<!-- Play button overlay - show on hover -->
									<div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 rounded">
										<button
											on:click|preventDefault|stopPropagation={() => playTrack(track.identifier)}
											class="btn btn-circle btn-primary btn-md shadow-lg"
											disabled={loadingTrack === track.identifier}
											title={isCurrentTrack(track.identifier) ? 'Playing' : 'Play'}
										>
											{#if loadingTrack === track.identifier}
												<span class="loading loading-spinner loading-sm"></span>
											{:else if isCurrentTrack(track.identifier)}
												<Icon icon="solar:pause-bold" width="20" className="text-primary-content" />
											{:else}
												<Icon icon="solar:play-bold" width="20" className="text-primary-content" />
											{/if}
										</button>
									</div>
								</a>

								<!-- Info - Clickable -->
								<a href="/item/{track.identifier}" class="block hover:text-primary transition-colors">
									<h3
										class="text-sm font-medium truncate flex items-center gap-1"
										class:text-primary={isCurrentTrack(track.identifier)}
									>
										<span class="truncate">{track.title}</span>
										{#if isCurrentTrack(track.identifier) && $player.isPlaying}
											<span class="flex-shrink-0">
												<PlayingIndicator size="sm" />
											</span>
										{/if}
									</h3>
									<p class="text-xs text-base-content/70 truncate">{track.artist}</p>
								</a>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Trending Section -->
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
					class="card bg-base-200 hover:bg-base-300 transition-colors group relative"
					class:ring-2={isCurrentTrack(item.identifier)}
					class:ring-primary={isCurrentTrack(item.identifier)}
				>
					<div class="card-body p-3">
						<!-- Thumbnail - Clickable -->
						<a href="/item/{item.identifier}" class="block mb-3 hover:opacity-80 transition-opacity relative">
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

							<!-- Play button overlay - show on hover -->
							<div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 rounded">
								<button
									on:click|preventDefault|stopPropagation={() => playTrack(item.identifier)}
									class="btn btn-circle btn-primary btn-lg shadow-lg"
									disabled={loadingTrack === item.identifier}
									title={isCurrentTrack(item.identifier) ? 'Playing' : 'Play'}
								>
									{#if loadingTrack === item.identifier}
										<span class="loading loading-spinner loading-md"></span>
									{:else if isCurrentTrack(item.identifier)}
										<Icon icon="solar:pause-bold" width="24" className="text-primary-content" />
									{:else}
										<Icon icon="solar:play-bold" width="24" className="text-primary-content" />
									{/if}
								</button>
							</div>
						</a>

						<!-- Info - Clickable -->
						<a href="/item/{item.identifier}" class="block hover:text-primary transition-colors mb-2">
							<h3
								class="font-medium truncate flex items-center gap-2"
								class:text-primary={isCurrentTrack(item.identifier)}
							>
								<span class="truncate">{item.title}</span>
								{#if isCurrentTrack(item.identifier) && $player.isPlaying}
									<span class="flex-shrink-0">
										<PlayingIndicator size="sm" />
									</span>
								{/if}
							</h3>
							<p class="text-sm text-base-content/70 truncate">{item.artist}</p>
						</a>

						<!-- Actions - show on hover -->
						<div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
							<button
								on:click={() => toggleFavorite(item.identifier)}
								class="btn btn-ghost btn-sm btn-circle"
								title={$library.favorites.includes(item.identifier) ? 'Remove from favorites' : 'Add to favorites'}
							>
								<Icon
									icon={$library.favorites.includes(item.identifier) ? 'solar:heart-bold' : 'solar:heart-linear'}
									width="16"
									className={$library.favorites.includes(item.identifier) ? 'text-red-500' : ''}
								/>
							</button>
							<button
								on:click={() => addToQueue(item.identifier)}
								class="btn btn-ghost btn-sm btn-circle"
								disabled={loadingTrack === item.identifier}
								title="Add to queue"
							>
								<Icon icon="solar:add-circle-linear" width="16" />
							</button>
							<button
								on:click={() => handleShare(item)}
								class="btn btn-ghost btn-sm btn-circle"
								title="Share track"
							>
								<Icon icon="solar:share-linear" width="16" />
							</button>
							<button
								on:click={() => toggleExpand(item.identifier)}
								class="btn btn-ghost btn-sm btn-circle ml-auto"
								title="Show all tracks"
							>
								<Icon
									icon={expandedItems.has(item.identifier) ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'}
									width="16"
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
