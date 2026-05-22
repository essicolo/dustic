<script lang="ts">
	import { queue } from '$lib/stores/queue';
	import { player, currentTrack } from '$lib/stores/player';
	import { library } from '$lib/stores/library';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { unifiedGetTrack as getTrack } from '$lib/services/sources';
	import Icon from '$lib/components/Icon.svelte';
	import AudioCard from '$lib/components/AudioCard.svelte';
	import { createEventDispatcher } from 'svelte';
	import { _ } from '$lib/i18n';

	const dispatch = createEventDispatcher<{ close: void }>();

	let showSaveDialog = false;
	let selectedPlaylistId: string | 'new' = 'new';
	let playlistName = '';
	let playlistDescription = '';
	let showPlaylistSelectorForTrack: string | null = null;
	let draggedIndex: number | null = null;
	let dragOverIndex: number | null = null;

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
		if (confirm($_('queue.clearConfirm'))) {
			queue.clear();
		}
	}

	function openSaveDialog() {
		selectedPlaylistId = 'new';
		playlistName = '';
		playlistDescription = '';
		showSaveDialog = true;
	}

	function cancelSave() {
		showSaveDialog = false;
		selectedPlaylistId = 'new';
		playlistName = '';
		playlistDescription = '';
	}

	function saveAsPlaylist() {
		const trackIds = $queue.tracks.map(track => track.identifier);
		let id: string;

		if (selectedPlaylistId === 'new') {
			if (!playlistName.trim()) return;
			id = library.createPlaylist(playlistName.trim(), playlistDescription.trim());
		} else {
			id = selectedPlaylistId;
		}

		trackIds.forEach(trackId => {
			library.addToPlaylist(id, trackId);
		});

		showSaveDialog = false;
		selectedPlaylistId = 'new';
		playlistName = '';
		playlistDescription = '';

		dispatch('close');
		goto(`${base}/library/playlists/${id}`);
	}

	function togglePlaylistSelector(trackId: string) {
		showPlaylistSelectorForTrack = showPlaylistSelectorForTrack === trackId ? null : trackId;
	}

	function addToPlaylist(trackId: string, playlistId: string) {
		library.addToPlaylist(playlistId, trackId);
		showPlaylistSelectorForTrack = null;
	}

	function handleDragStart(event: DragEvent, index: number) {
		draggedIndex = index;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
		}
	}

	function handleDragOver(event: DragEvent, index: number) {
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
		dragOverIndex = index;
	}

	function handleDrop(event: DragEvent, index: number) {
		event.preventDefault();
		if (draggedIndex !== null && draggedIndex !== index) {
			queue.reorder(draggedIndex, index);
		}
		draggedIndex = null;
		dragOverIndex = null;
	}

	function handleDragEnd() {
		draggedIndex = null;
		dragOverIndex = null;
	}

	$: queueTracks = $queue.tracks;
	$: playlists = Object.values($library.playlists).sort((a, b) => b.updated - a.updated);
</script>

<!-- Header -->
<div class="p-4 border-b border-base-content/10 flex items-center justify-between" style="padding-top: max(1rem, env(safe-area-inset-top));">
	<h2 class="text-xl font-bold">{$_('queue.title')}</h2>
	<div class="flex items-center gap-2">
		{#if $queue.tracks.length > 0}
			<button
				on:click={openSaveDialog}
				class="btn btn-primary btn-sm"
				title={$_('queue.saveAsPlaylist')}
			 aria-label={$_('queue.saveAsPlaylist')}>
				<Icon icon="solar:list-heart-bold" width="16" />
				{$_('common.save')}
			</button>
			<button on:click={clearQueue} class="btn btn-ghost btn-sm">{$_('common.clear')}</button>
		{/if}
		<button on:click={() => dispatch('close')} class="btn btn-ghost btn-sm btn-circle" aria-label={$_('common.close')}>
			<Icon icon="solar:close-circle-bold" width="18" />
		</button>
	</div>
</div>

<!-- Save as Playlist Dialog -->
{#if showSaveDialog}
	<div class="p-4 bg-base-300/80 border-b border-base-content/10">
		<h3 class="font-semibold mb-3">{$_('queue.saveDialogTitle')}</h3>
		<div class="space-y-3">
			<div class="form-control">
				<label class="label" for="queue-playlist-select">
					<span class="label-text text-xs">{$_('queue.selectPlaylist')}</span>
				</label>
				<select
					id="queue-playlist-select"
					bind:value={selectedPlaylistId}
					class="select select-sm select-bordered w-full"
				>
					<option value="new">{$_('queue.createNew')}</option>
					{#each playlists as playlist}
						<option value={playlist.id}>{playlist.name} ({playlist.tracks.length})</option>
					{/each}
				</select>
			</div>

			{#if selectedPlaylistId === 'new'}
				<div class="form-control">
					<label class="label" for="queue-playlist-name">
						<span class="label-text text-xs">{$_('queue.playlistName')}</span>
					</label>
					<input
						id="queue-playlist-name"
						type="text"
						bind:value={playlistName}
						placeholder={$_('queue.playlistNamePlaceholder')}
						class="input input-sm input-bordered"
						on:keydown={(e) => e.key === 'Enter' && saveAsPlaylist()}
						autofocus
					/>
				</div>
				<div class="form-control">
					<label class="label" for="queue-playlist-description">
						<span class="label-text text-xs">{$_('queue.descriptionLabel')}</span>
					</label>
					<input
						id="queue-playlist-description"
						type="text"
						bind:value={playlistDescription}
						placeholder={$_('queue.descriptionPlaceholder')}
						class="input input-sm input-bordered"
						on:keydown={(e) => e.key === 'Enter' && saveAsPlaylist()}
					/>
				</div>
			{/if}

			<div class="flex gap-2">
				<button
					on:click={saveAsPlaylist}
					disabled={selectedPlaylistId === 'new' && !playlistName.trim()}
					class="btn btn-primary btn-sm flex-1"
				>
					{#if selectedPlaylistId === 'new'}
						{$_('queue.createAndAdd', { values: { count: $queue.tracks.length } })}
					{:else}
						{$_('queue.addCount', { values: { count: $queue.tracks.length } })}
					{/if}
				</button>
				<button on:click={cancelSave} class="btn btn-ghost btn-sm">
					{$_('common.cancel')}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Queue List -->
<div class="flex-1 overflow-y-auto">
	{#if queueTracks.length === 0}
		<div class="p-8 text-center text-base-content/50" style="padding-bottom: max(2rem, env(safe-area-inset-bottom));">
			<p class="text-lg">{$_('queue.empty')}</p>
			<p class="text-sm mt-1">{$_('queue.emptyHint')}</p>
		</div>
	{:else}
		<div class="divide-y divide-base-content/10">
			{#each queueTracks as track, index (track.identifier + '-' + index)}
			<div
				class="p-1 cursor-move transition-colors {index === $queue.currentIndex ? 'bg-primary/10' : 'hover:bg-base-300/50'} {index < $queue.currentIndex ? 'opacity-50' : ''}"
				class:bg-base-300={dragOverIndex === index && draggedIndex !== index}
				class:opacity-30={draggedIndex === index}
				draggable="true"
				on:dragstart={(e) => handleDragStart(e, index)}
				on:dragover={(e) => handleDragOver(e, index)}
				on:drop={(e) => handleDrop(e, index)}
				on:dragend={handleDragEnd}
				role="button"
				tabindex="0"
			>
				<div class="flex items-center gap-2">
					{#if index === $queue.currentIndex}
						<div class="text-primary flex-shrink-0">
							<div class="flex gap-0.5 w-4 justify-center">
								<span class="w-0.5 h-3 bg-primary animate-pulse"></span>
								<span class="w-0.5 h-3 bg-primary animate-pulse" style="animation-delay: 0.1s"></span>
								<span class="w-0.5 h-3 bg-primary animate-pulse" style="animation-delay: 0.2s"></span>
							</div>
						</div>
					{:else}
						<div class="text-base-content/40 flex-shrink-0">
							<Icon icon="solar:hamburger-menu-linear" width="16" />
						</div>
					{/if}
					<div class="flex-1 min-w-0">
						<AudioCard
							item={track}
							type="track"
							layout="list"
							compact={true}
							actionsLayout="collapsed"
							showRemoveFromQueue={true}
							inQueue={true}
							queueIndex={index}
							on:removeFromQueue={() => removeTrack(index)}
						/>
					</div>
				</div>
			</div>
		{/each}
		</div>
	{/if}
</div>

<!-- Footer Info -->
{#if $queue.tracks.length > 0}
	<div class="p-3 border-t border-base-content/10 text-sm text-base-content/70" style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));">
		{$_('queue.trackCount', { values: { count: $queue.tracks.length } })}
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
