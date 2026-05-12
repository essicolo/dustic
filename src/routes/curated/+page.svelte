<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import Icon from '@iconify/svelte';
	import curatedPlaylistsData from '$lib/data/curatedPlaylists.json';

	interface CuratedPlaylist {
		id: string;
		name: string;
		description: string;
		curator: string;
		tracks: Array<{
			identifier: string;
			note?: string;
		}>;
	}

	const curatedPlaylists: CuratedPlaylist[] = curatedPlaylistsData;
</script>

<div class="p-4 md:p-8">
	<div class="max-w-4xl mx-auto">
		<h2 class="text-2xl md:text-3xl font-bold mb-2">Curated Playlists</h2>
		<p class="text-base-content/70 mb-8">
			Hand-picked collections from the Inde team. These are curated playlists created by humans to showcase the best audio from the Internet Archive.
		</p>

		{#if curatedPlaylists.length === 0}
			<div class="text-center py-20 text-base-content/50">
				<Icon icon="solar:playlist-minimalistic-linear" width="64" class="mx-auto mb-4 opacity-30" />
				<p class="text-lg">No curated playlists available yet</p>
				<p class="text-sm mt-2">Check back soon for hand-picked collections</p>
			</div>
		{:else}
			<div class="grid gap-6 md:grid-cols-2">
				{#each curatedPlaylists as playlist}
					<a
						href="{base}/curated/{playlist.id}"
						class="card bg-base-200 hover:bg-base-300 transition-all duration-200 hover:shadow-xl cursor-pointer"
					>
						<div class="card-body">
							<div class="flex items-start gap-3">
								<div class="bg-primary/10 p-3 rounded-lg flex-shrink-0">
									<Icon icon="solar:star-bold" width="24" class="text-primary" />
								</div>
								<div class="flex-1 min-w-0">
									<h3 class="card-title text-lg mb-1">{playlist.name}</h3>
									<p class="text-xs text-base-content/50 mb-2">
										Curated by {playlist.curator}
									</p>
									<p class="text-sm text-base-content/70 line-clamp-2">
										{playlist.description}
									</p>
								</div>
							</div>
							<div class="card-actions justify-between items-center mt-4 pt-4 border-t border-base-300">
								<div class="text-xs text-base-content/50">
									{playlist.tracks.length} {playlist.tracks.length === 1 ? 'track' : 'tracks'}
								</div>
								<div class="flex gap-2">
									<Icon icon="solar:arrow-right-linear" width="20" class="text-base-content/40" />
								</div>
							</div>
						</div>
					</a>
				{/each}
			</div>
		{/if}

		<div class="mt-12 p-6 bg-base-200 rounded-lg">
			<div class="flex gap-4">
				<div class="flex-shrink-0">
					<Icon icon="solar:info-circle-bold" width="24" class="text-info" />
				</div>
				<div>
					<h3 class="font-semibold mb-2">About Curated Playlists</h3>
					<p class="text-sm text-base-content/70 mb-3">
						Unlike algorithmic recommendations, these playlists are carefully crafted by human curators from the Inde team.
						Each selection is chosen to represent the best of its genre and provide a meaningful listening experience.
					</p>
					<p class="text-sm text-base-content/70">
						All audio is sourced from the <a href="https://archive.org" target="_blank" rel="noopener noreferrer" class="link link-primary">Internet Archive</a>,
						a non-profit library of millions of free books, movies, music, and more.
					</p>
				</div>
			</div>
		</div>
	</div>
</div>
