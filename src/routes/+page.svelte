<script lang="ts">
	import { search, getTrack } from '$lib/services/internetArchive';
	import { player, currentTrack } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import type { Track } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';

	let searchQuery = '';
	let isSearching = false;
	let results: Track[] = [];
	let error = '';
	let loadingTrack: string | null = null;

	async function handleSearch() {
		if (!searchQuery.trim()) return;

		isSearching = true;
		error = '';

		try {
			const result = await search({ query: searchQuery });
			results = result.items;
		} catch (e) {
			error = 'Search failed. Please try again.';
			console.error(e);
		} finally {
			isSearching = false;
		}
	}

	async function playTrack(identifier: string) {
		loadingTrack = identifier;
		try {
			const track = await getTrack(identifier);
			if (track) {
				// Set as queue and start playing
				queue.setQueue([track], 0);
				player.play(track);
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
		try {
			const track = await getTrack(identifier);
			if (track) {
				queue.addToEnd(track);
			}
		} catch (e) {
			console.error('Failed to add track:', e);
		} finally {
			loadingTrack = null;
		}
	}

	function isCurrentTrack(identifier: string): boolean {
		return $currentTrack?.identifier === identifier;
	}
</script>

<div class="p-8">
	<h2 class="text-3xl font-bold mb-6">Discover</h2>
	<p class="text-base-content/70 mb-8">
		Welcome to Dustic - Your gateway to the Internet Archive's audio collections
	</p>

	<!-- Quick Search Test -->
	<div class="max-w-2xl">
		<div class="join w-full mb-4">
			<input
				type="text"
				bind:value={searchQuery}
				on:keydown={(e) => e.key === 'Enter' && handleSearch()}
				placeholder="Search for music, audiobooks, podcasts..."
				class="input input-bordered join-item flex-1"
			/>
			<button on:click={handleSearch} class="btn btn-primary join-item" disabled={isSearching}>
				{#if isSearching}
					<span class="loading loading-spinner"></span>
				{:else}
					<Icon icon="solar:magnifer-bold" width="18" />
					<span class="ml-1">Search</span>
				{/if}
			</button>
		</div>

		{#if error}
			<div class="alert alert-error mb-4">
				<span>{error}</span>
			</div>
		{/if}

		{#if results.length > 0}
			<div class="space-y-2">
				{#each results as item}
					<div
						class="card bg-base-200 hover:bg-base-300 transition-colors group"
						class:ring-2={isCurrentTrack(item.identifier)}
						class:ring-primary={isCurrentTrack(item.identifier)}
					>
						<div class="card-body p-4">
							<div class="flex items-center gap-3">
								<button
									on:click={() => playTrack(item.identifier)}
									class="btn btn-circle btn-sm"
									class:btn-primary={!isCurrentTrack(item.identifier)}
									class:btn-ghost={isCurrentTrack(item.identifier)}
									disabled={loadingTrack === item.identifier}
								>
									{#if loadingTrack === item.identifier}
										<span class="loading loading-spinner loading-xs"></span>
									{:else if isCurrentTrack(item.identifier)}
										<Icon icon="solar:pause-bold" width="18" />
									{:else}
										<Icon icon="solar:play-bold" width="18" />
									{/if}
								</button>
								<div class="flex-1 min-w-0">
									<h3 class="font-medium truncate" class:text-primary={isCurrentTrack(item.identifier)}>
										{item.title}
									</h3>
									<p class="text-sm text-base-content/70 truncate">{item.artist}</p>
									{#if item.date}
										<p class="text-xs text-base-content/50">{item.date}</p>
									{/if}
								</div>
								<div class="flex items-center gap-2">
									<button
										on:click={() => addToQueue(item.identifier)}
										class="btn btn-ghost btn-sm btn-square opacity-0 group-hover:opacity-100 transition-opacity"
										disabled={loadingTrack === item.identifier}
										title="Add to queue"
									>
										<Icon icon="solar:add-circle-bold" width="18" />
									</button>
									<div class="text-xs text-base-content/50 w-12 text-right">
										{item.format?.toUpperCase()}
									</div>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
