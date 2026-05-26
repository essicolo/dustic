<script lang="ts">
	import { history } from '$lib/stores/history';
	import { player, currentTrack } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { unifiedGetTrack as getTrack } from '$lib/services/sources';
	import type { Track } from '$lib/types';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import DownloadButton from '$lib/components/DownloadButton.svelte';
	import PlayingIndicator from '$lib/components/PlayingIndicator.svelte';
	import SkeletonCard from '$lib/components/SkeletonCard.svelte';
	import AudioCard from '$lib/components/AudioCard.svelte';
	import { isOfflineAvailable } from '$lib/stores/offline';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { _ } from '$lib/i18n';

	let tracks: (Track | null)[] = [];
	let isLoading = false;
	let loadingTrack: string | null = null;
	let showOfflineOnly = false;
	let viewMode: 'grid' | 'list' = 'list';

	let failedImages = new Set<string>(); // Track failed image loads

	function handleImageError(identifier: string) {
		failedImages.add(identifier);
		failedImages = failedImages; // Trigger reactivity
	}
	// Load view preference from localStorage
	onMount(() => {
		if (browser) {
			const savedView = localStorage.getItem('history-view');
			if (savedView === 'grid' || savedView === 'list') {
				viewMode = savedView;
			}
		}
	});

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
		if (confirm($_('history.clearConfirm'))) {
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

		if (minutes < 1) return $_('history.justNow');
		if (minutes < 60) return $_('history.minutesAgo', { values: { n: minutes } });
		if (hours < 24) return $_('history.hoursAgo', { values: { n: hours } });
		if (days < 7) return $_('history.daysAgo', { values: { n: days } });

		return date.toLocaleDateString();
	}

	function setViewMode(mode: 'grid' | 'list') {
		viewMode = mode;
		if (browser) {
			localStorage.setItem('history-view', mode);
		}
	}

	$: validTracks = tracks.filter((t): t is Track => t !== null);
	$: filteredTracks = showOfflineOnly
		? validTracks.filter((t) => $isOfflineAvailable(t.identifier))
		: validTracks;
</script>

<div class="p-4 md:p-8">
	<div class="flex items-center justify-between mb-6">
		<h2 class="text-2xl md:text-3xl font-bold">{$_('history.title')}</h2>
		<div class="flex items-center gap-2 md:gap-3">
			<button on:click={() => goto(`${base}/library`)} class="btn btn-ghost btn-sm">
				<Icon icon="solar:arrow-left-linear" width="18" />
				{$_('common.back')}
			</button>
			{#if validTracks.length > 0}
				<!-- View Mode Toggle -->
				<div class="btn-group">
					<button
						on:click={() => setViewMode('grid')}
						class="btn btn-sm"
						class:btn-active={viewMode === 'grid'}
						title={$_('viewMode.grid')}
					>
						<Icon icon="solar:widget-5-bold" width="18" />
					</button>
					<button
						on:click={() => setViewMode('list')}
						class="btn btn-sm"
						class:btn-active={viewMode === 'list'}
						title={$_('viewMode.list')}
					>
						<Icon icon="solar:list-bold" width="18" />
					</button>
				</div>

				<label class="label cursor-pointer gap-2 hidden md:flex">
					<Icon icon="solar:download-minimalistic-bold" width="20" />
					<span class="label-text">{$_('history.offlineOnly')}</span>
					<input type="checkbox" bind:checked={showOfflineOnly} class="toggle toggle-primary" />
				</label>
				<button on:click={clearHistory} class="btn btn-ghost btn-sm">
					<span class="hidden md:inline">{$_('history.clear')}</span>
					<Icon icon="solar:trash-bin-minimalistic-bold" width="18" class="md:hidden" />
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
				<span class="label-text">{$_('history.offlineOnly')}</span>
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
			<p class="text-lg">{$_('history.empty')}</p>
			<p class="text-sm mt-2">{$_('history.emptyHint')}</p>
		</div>
	{:else if filteredTracks.length === 0}
		<div class="text-center py-20 text-base-content/50">
			<p class="text-lg">{$_('history.emptyOffline')}</p>
			<p class="text-sm mt-2">{$_('history.emptyOfflineHint')}</p>
		</div>
	{:else if viewMode === 'grid'}
		<!-- Grid View -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
			{#each filteredTracks as track, index}
				{@const entry = $history.entries[index]}
				<AudioCard
					item={{ ...track, tracks: [track] }}
					type="track"
					layout="tile"
				>
					<div slot="extra-actions" class="mt-1 flex items-center justify-between">
						<div class="text-xs text-base-content/50">{entry ? formatDate(entry.playedAt) : ''}</div>
						<button
							on:click={() => removeFromHistory(track.identifier)}
							class="btn btn-ghost btn-sm btn-circle"
							title={$_('history.removeFromHistory')}
						>
							<Icon icon="solar:trash-bin-minimalistic-linear" width="16" />
						</button>
					</div>
				</AudioCard>
			{/each}
		</div>
	{:else}
		<!-- List View -->
		<div class="space-y-2">
			{#each filteredTracks as track, index}
				{@const entry = $history.entries[index]}
				<AudioCard
					item={{ ...track, tracks: [track] }}
					type="track"
					layout="list"
				>
					<div slot="extra-actions" class="flex items-center gap-3 mt-2">
						<div class="text-xs text-base-content/50">{entry ? formatDate(entry.playedAt) : ''}</div>
						<div class="ml-auto flex items-center gap-2">
							<button
								on:click={() => playTrack(track.identifier)}
								class="btn btn-sm"
								class:btn-primary={!isCurrentTrack(track.identifier)}
								class:btn-ghost={isCurrentTrack(track.identifier)}
								disabled={loadingTrack === track.identifier}
							>
								{#if loadingTrack === track.identifier}
									<span class="loading loading-spinner loading-xs"></span>
								{:else if isCurrentTrack(track.identifier) && $player.isPlaying}
									<Icon icon="solar:pause-bold" width="16" />
								{:else}
									<Icon icon="solar:play-bold" width="16" />
								{/if}
							</button>

							<button
								on:click={() => removeFromHistory(track.identifier)}
								class="btn btn-ghost btn-sm"
								title={$_('history.removeFromHistory')}
							>
								<Icon icon="solar:trash-bin-minimalistic-linear" width="16" />
							</button>
						</div>
					</div>
				</AudioCard>
			{/each}
		</div>
	{/if}
</div>
