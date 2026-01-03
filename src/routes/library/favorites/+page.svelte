<script lang="ts">
	import { library } from '$lib/stores/library';
	import { player, currentTrack } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { getTrack } from '$lib/services/internetArchive';
	import type { Track } from '$lib/types';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import DownloadButton from '$lib/components/DownloadButton.svelte';
	import PlayingIndicator from '$lib/components/PlayingIndicator.svelte';
	import SkeletonCard from '$lib/components/SkeletonCard.svelte';
	import { isOfflineAvailable } from '$lib/stores/offline';
	import { batchExecute } from '$lib/utils/throttle';
	import { browser } from '$app/environment';

	let tracks: (Track | null)[] = [];
	let isLoading = false;
	let loadingTrack: string | null = null;
	let showOfflineOnly = false;
	let viewMode: 'grid' | 'list' = 'list';

	// Load view preference from localStorage
	onMount(() => {
		if (browser) {
			const savedView = localStorage.getItem('favorites-view');
			if (savedView === 'grid' || savedView === 'list') {
				viewMode = savedView;
			}
		}
	});

	onMount(() => {
		loadFavorites();
	});

	async function loadFavorites() {
		isLoading = true;
		const favorites = $library.favorites;

		// Load track data in batches to avoid rate limiting
		const trackTasks = favorites.map((id) => async () => {
			try {
				return await getTrack(id);
			} catch {
				return null;
			}
		});

		// Execute in batches of 3 with 500ms delay between batches
		const loadedTracks = await batchExecute(trackTasks, 3, 500);

		tracks = loadedTracks;
		isLoading = false;
	}

	async function playTrack(identifier: string) {
		loadingTrack = identifier;
		try {
			const track = await getTrack(identifier);
			if (track) {
				queue.setQueue([track], 0);
				player.play(track);
			}
		} catch (e) {
			console.error('Failed to play track:', e);
		} finally {
			loadingTrack = null;
		}
	}

	async function playAll() {
		const validTracks = tracks.filter((t): t is Track => t !== null);
		if (validTracks.length > 0) {
			queue.setQueue(validTracks, 0);
			player.play(validTracks[0]);
		}
	}

	function removeFavorite(trackId: string) {
		library.toggleFavorite(trackId);
		tracks = tracks.filter((t) => t?.identifier !== trackId);
	}

	function isCurrentTrack(identifier: string): boolean {
		if (!$currentTrack) return false;
		// Handle chapter identifiers (format: "itemId#index")
		const currentId = $currentTrack.identifier.split('#')[0];
		const trackId = identifier.split('#')[0];
		return currentId === trackId;
	}

	function setViewMode(mode: 'grid' | 'list') {
		viewMode = mode;
		if (browser) {
			localStorage.setItem('favorites-view', mode);
		}
	}

	$: validTracks = tracks.filter((t): t is Track => t !== null);
	$: filteredTracks = showOfflineOnly
		? validTracks.filter((t) => $isOfflineAvailable(t.identifier))
		: validTracks;
</script>

<div class="p-4 md:p-8">
	<div class="flex items-center justify-between mb-6">
		<h2 class="text-2xl md:text-3xl font-bold">Favorites</h2>
		<div class="flex items-center gap-2 md:gap-3">
			{#if validTracks.length > 0}
				<!-- View Mode Toggle -->
				<div class="btn-group">
					<button
						on:click={() => setViewMode('grid')}
						class="btn btn-sm"
						class:btn-active={viewMode === 'grid'}
						title="Grid view"
					>
						<Icon icon="solar:gallery-bold" width="18" />
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

				<label class="label cursor-pointer gap-2 hidden md:flex">
					<Icon icon="solar:download-minimalistic-bold" width="20" />
					<span class="label-text">Offline only</span>
					<input type="checkbox" bind:checked={showOfflineOnly} class="toggle toggle-primary" />
				</label>
				<button on:click={playAll} class="btn btn-primary btn-sm md:btn-md">
					<span class="hidden md:inline">Play All</span>
					<Icon icon="solar:play-bold" width="18" class="md:hidden" />
				</button>
			{/if}
		</div>
	</div>

	<!-- Mobile: Offline toggle -->
	{#if validTracks.length > 0}
		<div class="md:hidden mb-4">
			<label class="label cursor-pointer gap-2 justify-start">
				<input type="checkbox" bind:checked={showOfflineOnly} class="toggle toggle-primary" />
				<Icon icon="solar:download-minimalistic-bold" width="20" />
				<span class="label-text">Offline only</span>
			</label>
		</div>
	{/if}

	{#if isLoading}
		<!-- Skeleton loaders matching current view mode -->
		{#if viewMode === 'grid'}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
				{#each Array(8) as _}
					<SkeletonCard layout="grid" />
				{/each}
			</div>
		{:else}
			<div class="space-y-2">
				{#each Array(8) as _}
					<SkeletonCard layout="list" />
				{/each}
			</div>
		{/if}
	{:else if validTracks.length === 0}
		<div class="text-center py-20 text-base-content/50">
			<p class="text-lg">No favorites yet</p>
			<p class="text-sm mt-2">Add tracks to your favorites to see them here</p>
		</div>
	{:else if filteredTracks.length === 0}
		<div class="text-center py-20 text-base-content/50">
			<p class="text-lg">No offline favorites</p>
			<p class="text-sm mt-2">Download some favorites to see them here</p>
		</div>
	{:else if viewMode === 'grid'}
		<!-- Grid View -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
			{#each filteredTracks as track}
				<div
					class="card bg-base-200 hover:bg-base-300 transition-colors group relative"
					class:ring-2={isCurrentTrack(track.identifier)}
					class:ring-primary={isCurrentTrack(track.identifier)}
				>
					<div class="card-body p-3">
						<!-- Thumbnail - Clickable -->
						<a href="/item/{track.identifier}" class="block mb-3 hover:opacity-80 transition-opacity relative">
							{#if track.thumbnailUrl}
								<img
									src={track.thumbnailUrl}
									alt={track.title}
									class="w-full aspect-square object-cover rounded bg-base-300"
								/>
							{:else}
								<div class="w-full aspect-square flex items-center justify-center bg-base-300 rounded">
									<Icon icon="solar:music-note-bold" width="64" className="text-base-content/30" />
								</div>
							{/if}

							<!-- Play button overlay - show on hover -->
							<div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 rounded">
								<button
									on:click|preventDefault|stopPropagation={() => playTrack(track.identifier)}
									class="btn btn-circle btn-primary btn-lg shadow-lg"
									disabled={loadingTrack === track.identifier}
									title={isCurrentTrack(track.identifier) ? 'Playing' : 'Play'}
								>
									{#if loadingTrack === track.identifier}
										<span class="loading loading-spinner loading-md"></span>
									{:else if isCurrentTrack(track.identifier)}
										<Icon icon="solar:pause-bold" width="24" className="text-primary-content" />
									{:else}
										<Icon icon="solar:play-bold" width="24" className="text-primary-content" />
									{/if}
								</button>
							</div>
						</a>

						<!-- Info - Clickable -->
						<a href="/item/{track.identifier}" class="block hover:text-primary transition-colors mb-2">
							<h3
								class="font-medium truncate flex items-center gap-2"
								class:text-primary={isCurrentTrack(track.identifier)}
							>
								<span class="truncate">{track.title}</span>
								{#if isCurrentTrack(track.identifier) && $player.isPlaying}
									<span class="flex-shrink-0">
										<PlayingIndicator size="sm" />
									</span>
								{/if}
							</h3>
							<p class="text-sm text-base-content/70 truncate">{track.artist}</p>
						</a>

						<!-- Actions - show on hover -->
						<div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
							<DownloadButton {track} size="sm" />
							<button
								on:click={() => removeFavorite(track.identifier)}
								class="btn btn-ghost btn-sm btn-circle ml-auto"
								title="Remove from favorites"
							>
								<Icon icon="solar:heart-bold" width="16" className="text-red-500" />
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<!-- List View -->
		<div class="space-y-2">
			{#each filteredTracks as track}
				<div
					class="card bg-base-200 hover:bg-base-300 transition-colors group"
					class:ring-2={isCurrentTrack(track.identifier)}
					class:ring-primary={isCurrentTrack(track.identifier)}
				>
					<div class="card-body p-4">
						<div class="flex items-center gap-3">
							<!-- Album Art -->
							<a href="/item/{track.identifier}" class="flex-shrink-0 hover:opacity-80 transition-opacity">
								{#if track.thumbnailUrl}
									<img
										src={track.thumbnailUrl}
										alt={track.title}
										class="w-12 h-12 rounded object-cover bg-base-300"
									/>
								{:else}
									<div class="w-12 h-12 rounded bg-base-300 flex items-center justify-center">
										<Icon icon="solar:music-note-bold" width="24" className="text-base-content/30" />
									</div>
								{/if}
							</a>

							<a href="/item/{track.identifier}" class="flex-1 min-w-0 hover:text-primary transition-colors">
								<h3
									class="font-medium flex items-center gap-2"
									class:text-primary={isCurrentTrack(track.identifier)}
								>
									<span class="truncate">{track.title}</span>
									{#if isCurrentTrack(track.identifier) && $player.isPlaying}
										<span class="flex-shrink-0">
											<PlayingIndicator size="sm" />
										</span>
									{/if}
								</h3>
								<p class="text-sm text-base-content/70 truncate">{track.artist}</p>
								{#if track.date}
									<p class="text-xs text-base-content/50 mt-1">{track.date}</p>
								{/if}
							</a>
							<div class="flex items-center gap-2">
								<!-- Download button -->
								<DownloadButton {track} size="sm" />

								<!-- Play button -->
								<button
									on:click={() => playTrack(track.identifier)}
									class="btn btn-sm"
									class:btn-primary={!isCurrentTrack(track.identifier)}
									class:btn-ghost={isCurrentTrack(track.identifier)}
									disabled={loadingTrack === track.identifier}
								>
									{#if loadingTrack === track.identifier}
										<span class="loading loading-spinner loading-xs"></span>
									{:else if isCurrentTrack(track.identifier)}
										Playing
									{:else}
										Play
									{/if}
								</button>

								<!-- Remove from favorites button -->
								<button
									on:click={() => removeFavorite(track.identifier)}
									class="btn btn-ghost btn-sm opacity-0 group-hover:opacity-100 transition-opacity"
									title="Remove from favorites"
								>
									Remove
								</button>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
