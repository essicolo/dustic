<script lang="ts">
	import { library } from '$lib/stores/library';
	import { player, currentTrack } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { getTrack } from '$lib/services/internetArchive';
	import type { Track } from '$lib/types';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';

	let tracks: (Track | null)[] = [];
	let isLoading = false;
	let loadingTrack: string | null = null;

	onMount(() => {
		loadFavorites();
	});

	async function loadFavorites() {
		isLoading = true;
		const favorites = $library.favorites;

		// Load track data for each favorite
		const loadedTracks = await Promise.all(
			favorites.map(async (id) => {
				try {
					return await getTrack(id);
				} catch {
					return null;
				}
			})
		);

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
		return $currentTrack?.identifier === identifier;
	}

	$: validTracks = tracks.filter((t): t is Track => t !== null);
</script>

<div class="p-8">
	<div class="flex items-center justify-between mb-6">
		<h2 class="text-3xl font-bold">Favorites</h2>
		{#if validTracks.length > 0}
			<button on:click={playAll} class="btn btn-primary">
				Play All
			</button>
		{/if}
	</div>

	{#if isLoading}
		<div class="flex justify-center items-center py-20">
			<span class="loading loading-spinner loading-lg text-primary"></span>
		</div>
	{:else if validTracks.length === 0}
		<div class="text-center py-20 text-base-content/50">
			<p class="text-lg">No favorites yet</p>
			<p class="text-sm mt-2">Add tracks to your favorites to see them here</p>
		</div>
	{:else}
		<div class="space-y-2">
			{#each validTracks as track}
				<div
					class="card bg-base-200 hover:bg-base-300 transition-colors group"
					class:ring-2={isCurrentTrack(track.identifier)}
					class:ring-primary={isCurrentTrack(track.identifier)}
				>
					<div class="card-body p-4">
						<div class="flex items-center gap-3">
							<!-- Album Art -->
							{#if track.thumbnailUrl}
								<img
									src={track.thumbnailUrl}
									alt={track.title}
									class="w-12 h-12 rounded object-cover bg-base-300 flex-shrink-0"
								/>
							{:else}
								<div class="w-12 h-12 rounded bg-base-300 flex items-center justify-center flex-shrink-0">
									<Icon icon="solar:music-note-bold" width="24" className="text-base-content/30" />
								</div>
							{/if}

							<div class="flex-1 min-w-0">
								<h3
									class="font-medium truncate"
									class:text-primary={isCurrentTrack(track.identifier)}
								>
									{track.title}
								</h3>
								<p class="text-sm text-base-content/70 truncate">{track.artist}</p>
								{#if track.date}
									<p class="text-xs text-base-content/50 mt-1">{track.date}</p>
								{/if}
							</div>
							<div class="flex items-center gap-2">
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
