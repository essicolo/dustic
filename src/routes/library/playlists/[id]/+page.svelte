<script lang="ts">
	import { page } from '$app/stores';
	import { library } from '$lib/stores/library';
	import { player } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { unifiedGetTrack as getTrack } from '$lib/services/sources';
	import type { Track } from '$lib/types';
	import { onMount } from 'svelte';
	import Icon from '@iconify/svelte';
	import DownloadButton from '$lib/components/DownloadButton.svelte';
	import AudioCard from '$lib/components/AudioCard.svelte';
	import { _ } from '$lib/i18n';

	$: playlistId = $page.params.id as string;
	$: playlist = playlistId ? $library.playlists[playlistId] : undefined;

	let tracks: (Track | null)[] = [];
	let isLoading = false;
	let loadingTrack: string | null = null;
	let draggedIndex: number | null = null;
	let dragOverIndex: number | null = null;

	async function batchExecute<T>(
		tasks: (() => Promise<T>)[],
		batchSize: number,
		delayMs: number = 0
	): Promise<T[]> {
		const results: T[] = [];
		for (let i = 0; i < tasks.length; i += batchSize) {
			const batch = tasks.slice(i, i + batchSize);
			const batchResults = await Promise.all(batch.map((t) => t()));
			results.push(...batchResults);
			if (delayMs > 0 && i + batchSize < tasks.length) {
				await new Promise((r) => setTimeout(r, delayMs));
			}
		}
		return results;
	}

	$: if (playlist) {
		loadTracks();
	}

	async function loadTracks() {
		if (!playlist) return;

		isLoading = true;
		const trackIds = playlist.tracks;

		// Load track data in batches
		const trackTasks = trackIds.map((id) => async () => {
			try {
				const track = await getTrack(id);
				return track ? { ...track, lazy: false } : null; // Explicitly set lazy to false here as well
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
		if (confirm($_('playlists.removeTrackConfirm'))) {
			library.removeFromPlaylist(playlistId, trackId);
			loadTracks();
		}
	}

	function deletePlaylist() {
		if (!playlist) return;
		if (confirm($_('playlists.deletePlaylistConfirm', { values: { name: playlist.name } }))) {
			library.deletePlaylist(playlistId);
			goto(`${base}/library`);
		}
	}

	function isCurrentTrack(identifier: string): boolean {
		return $player.currentTrack?.identifier === identifier;
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
			library.reorderPlaylistTracks(playlistId, draggedIndex, index);
			loadTracks(); // Reload to reflect new order
		}
		draggedIndex = null;
		dragOverIndex = null;
	}

	function handleDragEnd() {
		draggedIndex = null;
		dragOverIndex = null;
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
					{$_('home.trackCount', { values: { count: playlist.tracks.length } })}
				</p>
			</div>
			<div class="flex items-center gap-2">
				<button on:click={() => goto(`${base}/library`)} class="btn btn-ghost btn-sm">
					<Icon icon="solar:arrow-left-linear" width="18" />
					{$_('common.back')}
				</button>
				<button on:click={deletePlaylist} class="btn btn-error btn-sm">
					<Icon icon="solar:trash-bin-2-bold" width="18" />
					{$_('common.delete')}
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
					{$_('common.playAll')}
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
				<p>{$_('playlists.detailEmpty')}</p>
			</div>
		{:else}
			<div class="space-y-2">
				{#each tracks as track, index}
					{#if track}
						<div
							class="cursor-move hover:bg-base-300/30 rounded-lg transition-colors"
							class:bg-base-300={dragOverIndex === index && draggedIndex !== index}
							class:opacity-50={draggedIndex === index}
							draggable="true"
							on:dragstart={(e) => handleDragStart(e, index)}
							on:dragover={(e) => handleDragOver(e, index)}
							on:drop={(e) => handleDrop(e, index)}
							on:dragend={handleDragEnd}
							role="button"
							tabindex="0"
						>
							<div class="flex items-center gap-2">
								<div class="text-base-content/40 flex-shrink-0 pl-2">
									<Icon icon="solar:hamburger-menu-linear" width="16" />
								</div>
								<div class="flex-1 min-w-0">
									<AudioCard item={{ ...track, tracks: [track] }} type="track" layout="list" />
								</div>
							</div>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</div>
{/if}
