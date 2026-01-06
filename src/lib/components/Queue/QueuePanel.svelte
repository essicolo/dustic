<script lang="ts">
	import { queue } from '$lib/stores/queue';
	import { player, currentTrack } from '$lib/stores/player';
	import { library } from '$lib/stores/library';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { getTrack } from '$lib/services/internetArchive';
	import Icon from '$lib/components/Icon.svelte';

	let isOpen = false;
	let showSaveDialog = false;
	let playlistName = '';
	let playlistDescription = '';
	let showPlaylistSelectorForTrack: string | null = null;

	function togglePanel() {
		isOpen = !isOpen;
	}

	function playTrackAt(index: number) {
		const track = queue.playAt(index);
		if (track) {
			player.play(track);
		}
	}

	function removeTrack(index: number) {
		queue.remove(index);
	}

	function clearQueue() {
		if (confirm('Clear entire queue?')) {
			queue.clear();
		}
	}

	function openSaveDialog() {
		playlistName = '';
		playlistDescription = '';
		showSaveDialog = true;
	}

	function cancelSave() {
		showSaveDialog = false;
		playlistName = '';
		playlistDescription = '';
	}

	function saveAsPlaylist() {
		if (!playlistName.trim()) return;

		// Get all track IDs from queue
		const trackIds = $queue.tracks.map(track => track.identifier);

		// Create playlist
		const id = library.createPlaylist(playlistName.trim(), playlistDescription.trim());

		// Add all tracks
		trackIds.forEach(trackId => {
			library.addToPlaylist(id, trackId);
		});

		// Reset and close
		showSaveDialog = false;
		playlistName = '';
		playlistDescription = '';

		// Show success and navigate
		isOpen = false;
		goto(`${base}/library/playlists/${id}`);
	}

	function togglePlaylistSelector(trackId: string) {
		showPlaylistSelectorForTrack = showPlaylistSelectorForTrack === trackId ? null : trackId;
	}

	function addToPlaylist(trackId: string, playlistId: string) {
		library.addToPlaylist(playlistId, trackId);
		showPlaylistSelectorForTrack = null;
	}

	$: upcomingTracks = $queue.tracks.slice($queue.currentIndex + 1);
	$: queueCount = upcomingTracks.length;
	$: playlists = Object.values($library.playlists).sort((a, b) => b.updated - a.updated);

</script>

<!-- Queue Toggle Button -->
<button on:click={togglePanel} class="btn btn-ghost btn-sm btn-circle relative" title="Queue">
	<Icon icon="solar:playlist-linear" width="20" />
	{#if queueCount > 0}
		<span class="badge badge-primary badge-sm absolute -top-1 -right-1">
			{queueCount}
		</span>
	{/if}
</button>

<!-- Queue Panel (Slide-out from right) -->
{#if isOpen}
	<div class="fixed inset-0 z-50 flex justify-end">
		<!-- Backdrop -->
		<div
			class="absolute inset-0 bg-black/50"
			on:click={togglePanel}
			on:keydown={(e) => e.key === 'Escape' && togglePanel()}
			role="button"
			tabindex="-1"
			aria-label="Close queue"
		></div>

		<!-- Panel -->
		<div class="relative w-full sm:w-96 bg-base-200 shadow-xl flex flex-col" style="max-height: 100vh; max-height: 100dvh;">
			<!-- Header -->
			<div class="p-4 border-b border-base-content/10 flex items-center justify-between" style="padding-top: max(1rem, env(safe-area-inset-top));">
				<h2 class="text-xl font-bold">Queue</h2>
				<div class="flex items-center gap-2">
					{#if $queue.tracks.length > 0}
						<button
							on:click={openSaveDialog}
							class="btn btn-primary btn-sm"
							title="Save queue as playlist"
						>
							<Icon icon="solar:playlist-minimalistic-2-bold" width="16" />
							Save
						</button>
						<button on:click={clearQueue} class="btn btn-ghost btn-sm">Clear</button>
					{/if}
					<button on:click={togglePanel} class="btn btn-ghost btn-sm btn-circle">
						<Icon icon="solar:close-circle-bold" width="18" />
					</button>
				</div>
			</div>

			<!-- Save as Playlist Dialog -->
			{#if showSaveDialog}
				<div class="p-4 bg-base-300/80 border-b border-base-content/10">
					<h3 class="font-semibold mb-3">Save Queue as Playlist</h3>
					<div class="space-y-3">
						<div class="form-control">
							<label class="label" for="queue-playlist-name">
								<span class="label-text text-xs">Playlist Name</span>
							</label>
							<input
								id="queue-playlist-name"
								type="text"
								bind:value={playlistName}
								placeholder="My Queue"
								class="input input-sm input-bordered"
								on:keydown={(e) => e.key === 'Enter' && saveAsPlaylist()}
							/>
						</div>
						<div class="form-control">
							<label class="label" for="queue-playlist-description">
								<span class="label-text text-xs">Description (optional)</span>
							</label>
							<input
								id="queue-playlist-description"
								type="text"
								bind:value={playlistDescription}
								placeholder="From my queue"
								class="input input-sm input-bordered"
								on:keydown={(e) => e.key === 'Enter' && saveAsPlaylist()}
							/>
						</div>
						<div class="flex gap-2">
							<button
								on:click={saveAsPlaylist}
								disabled={!playlistName.trim()}
								class="btn btn-primary btn-sm flex-1"
							>
								Save ({$queue.tracks.length} tracks)
							</button>
							<button on:click={cancelSave} class="btn btn-ghost btn-sm">
								Cancel
							</button>
						</div>
					</div>
				</div>
			{/if}

			<!-- Current Track -->
			{#if $currentTrack}
				<div class="p-4 bg-base-300/50 border-b border-base-content/10">
					<div class="text-xs text-base-content/70 mb-1">Now Playing</div>
					<div class="flex items-center gap-3">
						{#if $currentTrack.thumbnailUrl}
							<img
								src={$currentTrack.thumbnailUrl}
								alt={$currentTrack.title}
								class="w-12 h-12 rounded bg-base-100"
							/>
						{:else}
							<div class="w-12 h-12 rounded bg-base-100 flex items-center justify-center">
								<Icon icon="solar:music-note-bold" width="24" className="text-base-content/30" />
							</div>
						{/if}
						<div class="flex-1 min-w-0">
							<div class="font-medium truncate">{$currentTrack.title}</div>
							<div class="text-sm text-base-content/70 truncate">{$currentTrack.artist}</div>
						</div>
						<div class="text-primary">
							<div class="flex gap-1">
								<span class="w-1 h-4 bg-primary animate-pulse"></span>
								<span class="w-1 h-4 bg-primary animate-pulse" style="animation-delay: 0.1s"></span>
								<span class="w-1 h-4 bg-primary animate-pulse" style="animation-delay: 0.2s"></span>
							</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Queue List -->
			<div class="flex-1 overflow-y-auto">
				{#if upcomingTracks.length === 0}
					<div class="p-8 text-center text-base-content/50" style="padding-bottom: max(2rem, env(safe-area-inset-bottom));">
						<p class="text-lg">Queue is empty</p>
						<p class="text-sm mt-1">Add tracks to keep the music playing</p>
					</div>
				{:else}
					<div class="divide-y divide-base-content/10">
						{#each upcomingTracks as track, index}
							<div class="p-3 hover:bg-base-300/50 group">
								<div class="flex items-center gap-2">
									<button
										on:click={() => playTrackAt($queue.currentIndex + 1 + index)}
										class="btn btn-ghost btn-xs"
										title="Play"
									>
										<Icon icon="solar:play-bold" width="14" />
									</button>

									<div class="flex-1 min-w-0">
										<div class="font-medium truncate text-sm">{track.title}</div>
										<div class="text-xs text-base-content/70 truncate">{track.artist}</div>
									</div>

									<div class="relative">
										<button
											on:click={() => togglePlaylistSelector(track.identifier)}
											class="btn btn-ghost btn-xs"
											title="Add to playlist"
										>
											<Icon icon="solar:add-circle-bold" width="14" />
										</button>

										{#if showPlaylistSelectorForTrack === track.identifier}
											<div class="absolute right-0 mt-1 w-48 bg-base-200 rounded-lg shadow-xl z-10 border border-base-content/10 max-h-60 overflow-y-auto">
												{#if playlists.length === 0}
													<div class="p-3 text-center text-sm text-base-content/50">
														No playlists yet
													</div>
												{:else}
													{#each playlists as playlist}
														<button
															on:click={() => addToPlaylist(track.identifier, playlist.id)}
															class="w-full text-left px-3 py-2 hover:bg-base-300 text-sm flex items-center justify-between gap-2"
														>
															<span class="truncate">{playlist.name}</span>
															<span class="text-xs text-base-content/50">{playlist.tracks.length}</span>
														</button>
													{/each}
												{/if}
											</div>
										{/if}
									</div>

									<button
										on:click={() => removeTrack($queue.currentIndex + 1 + index)}
										class="btn btn-ghost btn-xs"
										title="Remove"
									>
										<Icon icon="solar:close-circle-bold" width="14" />
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Footer Info -->
			{#if $queue.tracks.length > 0}
				<div class="p-3 border-t border-base-content/10 text-sm text-base-content/70" style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));">
					{$queue.tracks.length} track{$queue.tracks.length !== 1 ? 's' : ''} in queue
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	@keyframes pulse {
		0%, 100% {
			height: 1rem;
		}
		50% {
			height: 1.5rem;
		}
	}

	.animate-pulse {
		animation: pulse 1s ease-in-out infinite;
	}
</style>
