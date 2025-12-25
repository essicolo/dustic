<script lang="ts">
	import { search, getTrack } from '$lib/services/internetArchive';
	import { player } from '$lib/stores/player';
	import type { Track } from '$lib/types';

	let searchQuery = '';
	let isSearching = false;
	let results: Track[] = [];
	let error = '';

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
		try {
			const track = await getTrack(identifier);
			if (track) {
				player.play(track);
			}
		} catch (e) {
			console.error('Failed to play track:', e);
		}
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
					🔍 Search
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
					<div class="card bg-base-200 hover:bg-base-300 cursor-pointer">
						<div class="card-body p-4">
							<div class="flex items-center gap-3">
								<button
									on:click={() => playTrack(item.identifier)}
									class="btn btn-circle btn-sm btn-primary"
								>
									▶️
								</button>
								<div class="flex-1 min-w-0">
									<h3 class="font-medium truncate">{item.title}</h3>
									<p class="text-sm text-base-content/70 truncate">{item.artist}</p>
									{#if item.date}
										<p class="text-xs text-base-content/50">{item.date}</p>
									{/if}
								</div>
								<div class="text-xs text-base-content/50">
									{item.format?.toUpperCase()}
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
