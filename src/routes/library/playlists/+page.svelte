<script lang="ts">
	import { library } from '$lib/stores/library';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import Icon from '@iconify/svelte';
	import { _ } from '$lib/i18n';

	let newPlaylistName = '';

	function createNewPlaylist() {
		if (newPlaylistName.trim()) {
			const newId = library.createPlaylist(newPlaylistName.trim());
			newPlaylistName = '';
			goto(`${base}/library/playlists/${newId}`);
		}
	}

	function deletePlaylist(playlistId: string, playlistName: string) {
		if (confirm($_('playlists.deleteConfirm', { values: { name: playlistName } }))) {
			library.deletePlaylist(playlistId);
		}
	}
</script>

<div class="p-4 md:p-8 max-w-4xl mx-auto">
	<!-- Back Button -->
	<button on:click={() => goto(`${base}/library`)} class="btn btn-ghost btn-sm mb-6">
		<Icon icon="solar:arrow-left-linear" width="20" />
		<span>{$_('nav.backToLibrary')}</span>
	</button>

	<h2 class="text-2xl md:text-3xl font-bold mb-6">{$_('playlists.title')}</h2>

	<!-- Create New Playlist -->
	<div class="mb-8 p-4 bg-base-200 rounded-lg shadow-md flex items-center gap-4">
		<input
			type="text"
			placeholder={$_('playlists.newPlaylistPlaceholder')}
			class="input input-bordered w-full"
			bind:value={newPlaylistName}
			on:keydown={(e) => e.key === 'Enter' && createNewPlaylist()}
		/>
		<button on:click={createNewPlaylist} class="btn btn-primary" disabled={!newPlaylistName.trim()}>
			<Icon icon="solar:add-circle-bold" width="20" />
			{$_('playlists.create')}
		</button>
	</div>

	<!-- Playlist List -->
	{#if Object.keys($library.playlists).length > 0}
		<div class="space-y-4">
			{#each Object.values($library.playlists).sort((a, b) => b.updated - a.updated) as playlist (playlist.id)}
				<div class="card bg-base-200 hover:bg-base-300 transition-colors duration-200 cursor-pointer">
					<a href="{base}/library/playlists/{playlist.id}" class="card-body flex-row items-center justify-between p-4">
						<div class="flex-grow">
							<h3 class="card-title text-lg">{playlist.name}</h3>
							<p class="text-sm text-base-content/70">
								{$_('home.trackCount', { values: { count: playlist.tracks.length } })}
								<span class="ml-2 text-xs opacity-50">
									{$_('playlists.lastUpdated', { values: { date: new Date(playlist.updated).toLocaleDateString() } })}
								</span>
							</p>
						</div>
						<div class="flex items-center gap-2">
							<button
								on:click|stopPropagation={() => deletePlaylist(playlist.id, playlist.name)}
								class="btn btn-ghost btn-sm btn-circle text-error"
								title={$_('playlists.deletePlaylist')}
							>
								<Icon icon="solar:trash-bin-minimalistic-linear" width="20" />
							</button>
							<Icon icon="solar:arrow-right-linear" width="20" class="opacity-50" />
						</div>
					</a>
				</div>
			{/each}
		</div>
	{:else}
		<div class="text-center py-12 text-base-content/50">
			<Icon icon="solar:playlist-minimalistic-2-bold" width="48" class="mx-auto mb-4 opacity-50" />
			<p>{$_('playlists.empty')}</p>
			<p>{$_('playlists.emptyHint')}</p>
		</div>
	{/if}
</div>
