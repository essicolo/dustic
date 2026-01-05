<script lang="ts">
	import { page } from '$app/stores';
	import { library } from '$lib/stores/library';
	import { player } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { getTrack } from '$lib/services/internetArchive';
	import type { Track } from '$lib/types';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import DownloadButton from '$lib/components/DownloadButton.svelte';
	import PlayingIndicator from '$lib/components/PlayingIndicator.svelte';
	import { batchExecute } from '$lib/utils/throttle';

	$: playlistId = $page.params.id;
	$: playlist = $library.playlists[playlistId];

	let tracks: (Track | null)[] = [];
	let isLoading = false;
	let loadingTrack: string | null = null;

	$: if (playlist) {
		loadTracks();
	}

	onMount(() => {
		// Redirect if playlist doesn't exist
		if (!playlist) {
			goto(`${base}/library`);
		}
	});

	async function loadTracks() {
		if (!playlist) return;

		isLoading = true;
		const trackIds = playlist.tracks;

		// Load track data in batches
		const trackTasks = trackIds.map((id) => async () => {
			try {
				return await getTrack(id);
			} catch {
				return null;
			}
		});

		tracks = await batchExecute(trackTasks, 3, 500);
		isLoading = false;
	}

	async function playTrack(identifier: string, index: number) {
		loadingTrack = identifier;
		try {
			const validTracks = tracks.filter((t): t is Track => t !== null);
			queue.setQueue(validTracks, index);
			const track = await getTrack(identifier);
			if (track) {
				player.play(track);
			}
		} catch (e) {
			console.error('Failed to play track:', e);
		} finally {
			loadingTrack = null;
		}
	}

	function removeFromPlaylist(trackId: string) {
		if (confirm('Remove this track from the playlist?')) {
			library.removeFromPlaylist(playlistId, trackId);
			loadTracks();
		}
	}

	function deletePlaylist() {
		if (confirm(`Delete playlist "${playlist.name}"?`)) {
			library.deletePlaylist(playlistId);
			goto(`${base}/library`);
		}
	}

	function isCurrentTrack(identifier: string): boolean {
		return $player.currentTrack?.identifier === identifier;
	}
</script>

{#if playlist}
	<div class="p-4 md:p-8">
		<!-- Header -->
		<div class="flex items-start justify-between mb-6">
			<div>
				<h2 class="text-2xl md:text-3xl font-bold mb-2">{playlist.name}</h2>
				{#if playlist.description}
					<p class="text-base-content/70">{playlist.description}</p>
				{/if}
				<p class="text-sm text-base-content/50 mt-2">
					{playlist.tracks.length} track{playlist.tracks.length !== 1 ? 's' : ''}
				</p>
			</div>
			<div class="flex items-center gap-2">
				<button on:click={() => goto(`${base}/library`)} class="btn btn-ghost btn-sm">
					<Icon icon="solar:arrow-left-linear" width="18" />
					Back
				</button>
				<button on:click={deletePlaylist} class="btn btn-error btn-sm">
					<Icon icon="solar:trash-bin-2-bold" width="18" />
					Delete
				</button>
			</div>
		</div>

		<!-- Play All Button -->
		{#if tracks.length > 0}
			<div class="mb-6">
				<button
					on:click={() => playTrack(playlist.tracks[0], 0)}
					class="btn btn-primary"
					disabled={isLoading}
				>
					<Icon icon="solar:play-bold" width="20" />
					Play All
				</button>
			</div>
		{/if}

		<!-- Track List -->
		{#if isLoading}
			<div class="flex justify-center py-12">
				<span class="loading loading-spinner loading-lg"></span>
			</div>
		{:else if tracks.length === 0}
			<div class="text-center py-12 text-base-content/50">
				<Icon icon="solar:playlist-bold" width="48" className="mx-auto mb-4 opacity-50" />
				<p>This playlist is empty</p>
			</div>
		{:else}
			<div class="space-y-2">
				{#each tracks as track, index}
					{#if track}
						<div
							class="card bg-base-200 hover:bg-base-300 transition-colors group"
							class:ring-2={isCurrentTrack(track.identifier)}
							class:ring-primary={isCurrentTrack(track.identifier)}
						>
							<div class="card-body p-4">
								<div class="flex items-center gap-3">
									<!-- Number -->
									<div class="text-base-content/50 w-8 text-center flex-shrink-0">
										{#if isCurrentTrack(track.identifier) && $player.isPlaying}
											<PlayingIndicator size="sm" />
										{:else}
											{index + 1}
										{/if}
									</div>

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

									<!-- Info -->
									<a href="/item/{track.identifier}" class="flex-1 min-w-0 hover:text-primary transition-colors">
										<h3
											class="font-medium truncate"
											class:text-primary={isCurrentTrack(track.identifier)}
										>
											{track.title}
										</h3>
										<p class="text-sm text-base-content/70 truncate">{track.artist}</p>
									</a>

									<!-- Actions -->
									<div class="flex items-center gap-1">
										<button
											on:click={() => playTrack(track.identifier, index)}
											class="btn btn-ghost btn-sm btn-circle"
											disabled={loadingTrack === track.identifier}
											title={isCurrentTrack(track.identifier) ? 'Playing' : 'Play'}
										>
											{#if loadingTrack === track.identifier}
												<span class="loading loading-spinner loading-sm"></span>
											{:else if isCurrentTrack(track.identifier)}
												<Icon icon="solar:pause-bold" width="18" />
											{:else}
												<Icon icon="solar:play-bold" width="18" />
											{/if}
										</button>

										<DownloadButton {track} size="sm" />

										<button
											on:click={() => removeFromPlaylist(track.identifier)}
											class="btn btn-ghost btn-sm btn-circle opacity-0 group-hover:opacity-100"
											title="Remove from playlist"
										>
											<Icon icon="solar:close-circle-linear" width="18" />
										</button>
									</div>
								</div>
							</div>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</div>
{/if}
