<script lang="ts">
	import { offline } from '$lib/stores/offline';
	import { player, currentTrack } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { formatBytes } from '$lib/services/offlineStorage';
	import Icon from '$lib/components/Icon.svelte';
	import { onMount } from 'svelte';

	let showClearConfirm = false;
	let deletingTrackId: string | null = null;

	onMount(() => {
		offline.loadOfflineTracks();
	});

	async function playTrack(identifier: string) {
		try {
			const track = await offline.getOfflineTrack(identifier);
			if (track) {
				queue.setQueue([track], 0);
				player.play(track);
			}
		} catch (e) {
			console.error('Failed to play offline track:', e);
		}
	}

	async function playAll() {
		try {
			const tracks = await Promise.all(
				$offline.offlineTracks.map(async (ot) => {
					const track = await offline.getOfflineTrack(ot.track.identifier);
					return track;
				})
			);

			const validTracks = tracks.filter((t): t is NonNullable<typeof t> => t !== null);
			if (validTracks.length > 0) {
				queue.setQueue(validTracks, 0);
				player.play(validTracks[0]);
			}
		} catch (e) {
			console.error('Failed to play offline tracks:', e);
		}
	}

	async function deleteTrack(identifier: string) {
		deletingTrackId = identifier;
		try {
			await offline.deleteTrack(identifier);
		} catch (e) {
			console.error('Failed to delete track:', e);
		} finally {
			deletingTrackId = null;
		}
	}

	async function clearAllOffline() {
		try {
			await offline.clearAll();
			showClearConfirm = false;
		} catch (e) {
			console.error('Failed to clear offline data:', e);
		}
	}

	function isCurrentTrack(identifier: string): boolean {
		if (!$currentTrack) return false;
		const currentId = $currentTrack.identifier.split('#')[0];
		const trackId = identifier.split('#')[0];
		return currentId === trackId;
	}

	function formatDate(timestamp: number): string {
		return new Date(timestamp).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function getStorageLocation(): string {
		// Browser-specific storage location info
		return 'Browser IndexedDB + Cache Storage';
	}

	$: usagePercent =
		$offline.storageQuota > 0 ? ($offline.storageUsed / $offline.storageQuota) * 100 : 0;
</script>

<div class="p-8">
	<div class="flex items-center justify-between mb-6">
		<div>
			<h2 class="text-3xl font-bold">Local Downloads</h2>
			<p class="text-sm text-base-content/70 mt-1">
				Tracks available offline
			</p>
		</div>
		{#if $offline.offlineTracks.length > 0}
			<div class="flex gap-2">
				<button on:click={playAll} class="btn btn-primary">
					<Icon icon="solar:play-bold" width="18" />
					<span class="hidden md:inline">Play All</span>
				</button>
				<button on:click={() => (showClearConfirm = true)} class="btn btn-ghost">
					<Icon icon="solar:trash-bin-trash-bold" width="18" />
					<span class="hidden md:inline">Clear All</span>
				</button>
			</div>
		{/if}
	</div>

	<!-- Storage Info -->
	{#if $offline.storageQuota > 0}
		<div class="card bg-base-200 mb-6">
			<div class="card-body">
				<div class="flex items-start justify-between mb-4">
					<div>
						<h3 class="font-semibold text-lg mb-1">Storage Usage</h3>
						<p class="text-sm text-base-content/70">
							Location: <span class="font-mono text-xs">{getStorageLocation()}</span>
						</p>
					</div>
					<div class="text-right">
						<div class="text-2xl font-bold">
							{formatBytes($offline.storageUsed)}
						</div>
						<div class="text-sm text-base-content/70">
							of {formatBytes($offline.storageQuota)}
						</div>
					</div>
				</div>

				<!-- Progress bar -->
				<div class="w-full">
					<progress
						class="progress progress-primary w-full"
						value={usagePercent}
						max="100"
					></progress>
					<div class="flex justify-between text-xs text-base-content/70 mt-1">
						<span>{$offline.offlineTracks.length} track{$offline.offlineTracks.length !== 1 ? 's' : ''}</span>
						<span>{Math.round(usagePercent)}% used</span>
					</div>
				</div>

				<!-- Storage Details -->
				<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
					<div class="text-center p-3 bg-base-300 rounded">
						<div class="text-xs text-base-content/70">Tracks</div>
						<div class="text-lg font-semibold">{$offline.offlineTracks.length}</div>
					</div>
					<div class="text-center p-3 bg-base-300 rounded">
						<div class="text-xs text-base-content/70">Total Size</div>
						<div class="text-lg font-semibold">{formatBytes($offline.storageUsed)}</div>
					</div>
					<div class="text-center p-3 bg-base-300 rounded">
						<div class="text-xs text-base-content/70">Avg Size</div>
						<div class="text-lg font-semibold">
							{$offline.offlineTracks.length > 0
								? formatBytes($offline.storageUsed / $offline.offlineTracks.length)
								: '0 MB'}
						</div>
					</div>
					<div class="text-center p-3 bg-base-300 rounded">
						<div class="text-xs text-base-content/70">Available</div>
						<div class="text-lg font-semibold">
							{formatBytes($offline.storageQuota - $offline.storageUsed)}
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Offline Tracks List -->
	{#if $offline.isLoading}
		<div class="flex justify-center items-center py-20">
			<span class="loading loading-spinner loading-lg text-primary"></span>
		</div>
	{:else if $offline.offlineTracks.length === 0}
		<div class="text-center py-20 text-base-content/50">
			<Icon icon="solar:download-square-bold-duotone" width="64" className="mx-auto mb-4 opacity-30" />
			<p class="text-lg">No offline tracks yet</p>
			<p class="text-sm mt-2">Download tracks to listen without internet connection</p>
		</div>
	{:else}
		<div class="space-y-2">
			{#each $offline.offlineTracks as offlineTrack}
				{@const track = offlineTrack.track}
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
								<div
									class="w-12 h-12 rounded bg-base-300 flex items-center justify-center flex-shrink-0"
								>
									<Icon icon="solar:music-note-bold" width="24" className="text-base-content/30" />
								</div>
							{/if}

							<!-- Info -->
							<div class="flex-1 min-w-0">
								<h3
									class="font-medium truncate"
									class:text-primary={isCurrentTrack(track.identifier)}
								>
									{track.title}
								</h3>
								<p class="text-sm text-base-content/70 truncate">{track.artist}</p>
								<div class="flex items-center gap-3 text-xs text-base-content/50 mt-1">
									<span>{formatBytes(offlineTrack.fileSize || 0)}</span>
									<span>•</span>
									<span>Downloaded {formatDate(offlineTrack.downloadedAt)}</span>
									<span>•</span>
									<Icon icon="solar:download-minimalistic-bold" width="12" className="inline" />
									<span>Offline</span>
								</div>
							</div>

							<!-- Actions -->
							<div class="flex items-center gap-2 flex-shrink-0">
								<button
									on:click={() => playTrack(track.identifier)}
									class="btn btn-sm btn-square"
									class:btn-primary={!isCurrentTrack(track.identifier)}
									class:btn-ghost={isCurrentTrack(track.identifier)}
									disabled={deletingTrackId === track.identifier}
								>
									{#if isCurrentTrack(track.identifier)}
										<Icon icon="solar:pause-bold" width="18" />
									{:else}
										<Icon icon="solar:play-bold" width="18" />
									{/if}
								</button>
								<button
									on:click={() => deleteTrack(track.identifier)}
									class="btn btn-ghost btn-sm btn-square opacity-0 group-hover:opacity-100 transition-opacity"
									disabled={deletingTrackId === track.identifier}
									title="Remove from offline storage"
								>
									{#if deletingTrackId === track.identifier}
										<span class="loading loading-spinner loading-xs"></span>
									{:else}
										<Icon icon="solar:trash-bin-trash-bold" width="18" />
									{/if}
								</button>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Clear All Confirmation Modal -->
{#if showClearConfirm}
	<div class="modal modal-open">
		<div class="modal-box">
			<h3 class="font-bold text-lg">Clear All Offline Data?</h3>
			<p class="py-4">
				This will delete all {$offline.offlineTracks.length} offline track{$offline.offlineTracks.length !== 1 ? 's' : ''} ({formatBytes($offline.storageUsed)}) from your device. This action cannot be undone.
			</p>
			<div class="modal-action">
				<button on:click={() => (showClearConfirm = false)} class="btn">Cancel</button>
				<button on:click={clearAllOffline} class="btn btn-error">
					<Icon icon="solar:trash-bin-trash-bold" width="18" />
					Clear All
				</button>
			</div>
		</div>
	</div>
{/if}
