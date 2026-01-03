<script lang="ts">
	import { history } from '$lib/stores/history';
	import { player, currentTrack } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { getTrack } from '$lib/services/internetArchive';
	import type { Track } from '$lib/types';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import DownloadButton from '$lib/components/DownloadButton.svelte';
	import { isOfflineAvailable } from '$lib/stores/offline';

	let tracks: (Track | null)[] = [];
	let isLoading = false;
	let loadingTrack: string | null = null;
	let showOfflineOnly = false;

	onMount(() => {
		loadHistory();
	});

	async function loadHistory() {
		isLoading = true;
		const entries = $history.entries;

		// Load track data for history
		const loadedTracks = await Promise.all(
			entries.slice(0, 50).map(async (entry) => {
				try {
					return await getTrack(entry.trackId);
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

	function clearHistory() {
		if (confirm('Clear all history?')) {
			history.clear();
			tracks = [];
		}
	}

	function removeFromHistory(trackId: string) {
		history.remove(trackId);
		tracks = tracks.filter((t) => t?.identifier !== trackId);
	}

	function isCurrentTrack(identifier: string): boolean {
		if (!$currentTrack) return false;
		// Handle chapter identifiers (format: "itemId#index")
		const currentId = $currentTrack.identifier.split('#')[0];
		const trackId = identifier.split('#')[0];
		return currentId === trackId;
	}

	function formatDate(timestamp: number): string {
		const date = new Date(timestamp);
		const now = new Date();
		const diff = now.getTime() - date.getTime();

		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return 'Just now';
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days < 7) return `${days}d ago`;

		return date.toLocaleDateString();
	}

	$: validTracks = tracks.filter((t): t is Track => t !== null);
	$: filteredTracks = showOfflineOnly
		? validTracks.filter((t) => $isOfflineAvailable(t.identifier))
		: validTracks;
</script>

<div class="p-8">
	<div class="flex items-center justify-between mb-6">
		<h2 class="text-3xl font-bold">Recently Played</h2>
		<div class="flex items-center gap-3">
			{#if validTracks.length > 0}
				<label class="label cursor-pointer gap-2">
					<Icon icon="solar:download-minimalistic-bold" width="20" />
					<span class="label-text">Offline only</span>
					<input type="checkbox" bind:checked={showOfflineOnly} class="toggle toggle-primary" />
				</label>
				<button on:click={clearHistory} class="btn btn-ghost btn-sm">
					Clear History
				</button>
			{/if}
		</div>
	</div>

	{#if isLoading}
		<div class="flex justify-center items-center py-20">
			<span class="loading loading-spinner loading-lg text-primary"></span>
		</div>
	{:else if validTracks.length === 0}
		<div class="text-center py-20 text-base-content/50">
			<p class="text-lg">No history yet</p>
			<p class="text-sm mt-2">Tracks you play will appear here</p>
		</div>
	{:else if filteredTracks.length === 0}
		<div class="text-center py-20 text-base-content/50">
			<p class="text-lg">No offline tracks in history</p>
			<p class="text-sm mt-2">Download some tracks to see them here</p>
		</div>
	{:else}
		<div class="space-y-2">
			{#each filteredTracks as track, index}
				{@const entry = $history.entries[index]}
				<div
					class="card bg-base-200 hover:bg-base-300 transition-colors group"
					class:ring-2={isCurrentTrack(track.identifier)}
					class:ring-primary={isCurrentTrack(track.identifier)}
				>
					<div class="card-body p-4">
						<div class="flex items-center gap-3">
							<!-- Album Art -->
							<a href="/item/{track.identifier.split('#')[0]}" class="flex-shrink-0 hover:opacity-80 transition-opacity">
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

							<a href="/item/{track.identifier.split('#')[0]}" class="flex-1 min-w-0 hover:text-primary transition-colors">
								<h3
									class="font-medium truncate"
									class:text-primary={isCurrentTrack(track.identifier)}
								>
									{track.title}
								</h3>
								<p class="text-sm text-base-content/70 truncate">{track.artist}</p>
								{#if entry}
									<p class="text-xs text-base-content/50 mt-1">
										{formatDate(entry.playedAt)}
										{#if entry.completionRate > 0}
											• {Math.round(entry.completionRate * 100)}% played
										{/if}
									</p>
								{/if}
							</a>
							<div class="flex items-center gap-2">
								<!-- Download button -->
								<DownloadButton track={track} size="sm" />

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

								<!-- Remove from history button -->
								<button
									on:click={() => removeFromHistory(track.identifier)}
									class="btn btn-ghost btn-sm opacity-0 group-hover:opacity-100 transition-opacity"
									title="Remove from history"
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
