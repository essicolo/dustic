<script lang="ts">
	import { library } from '$lib/stores/library';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';

	let newPlaylistName = '';
	let newPlaylistDescription = '';
	let isCreating = false;

	function createPlaylist() {
		if (!newPlaylistName.trim()) return;

		const id = library.createPlaylist(newPlaylistName, newPlaylistDescription);
		newPlaylistName = '';
		newPlaylistDescription = '';
		isCreating = false;

		// Navigate to new playlist
		goto(`${base}/library/playlists/${id}`);
	}

	function deletePlaylist(id: string, name: string) {
		if (confirm(`Delete playlist "${name}"?`)) {
			library.deletePlaylist(id);
		}
	}

	$: playlists = Object.values($library.playlists).sort((a, b) => b.updated - a.updated);
</script>

<div class="p-8">
	<h2 class="text-3xl font-bold mb-6">Library</h2>

	<!-- Favorites -->
	<section class="mb-8">
		<a
			href="{base}/library/favorites"
			class="card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer"
		>
			<div class="card-body">
				<h3 class="card-title">Favorites</h3>
				<p class="text-base-content/70">{$library.favorites.length} tracks</p>
			</div>
		</a>
	</section>

	<!-- History -->
	<section class="mb-8">
		<a
			href="{base}/history"
			class="card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer"
		>
			<div class="card-body">
				<h3 class="card-title">History</h3>
				<p class="text-base-content/70">Recently played</p>
			</div>
		</a>
	</section>

	<!-- Playlists -->
	<section>
		<div class="flex items-center justify-between mb-4">
			<h3 class="text-xl font-bold">Playlists</h3>
			<button
				on:click={() => (isCreating = !isCreating)}
				class="btn btn-circle btn-primary btn-sm"
				title="Create new playlist"
			>
				<Icon icon="solar:add-circle-bold" width="20" />
			</button>
		</div>

		<!-- Create Playlist Form -->
		{#if isCreating}
			<div class="card bg-base-200 mb-4">
				<div class="card-body">
					<h4 class="font-semibold mb-3">Create New Playlist</h4>
					<div class="form-control mb-3">
						<input
							id="playlist-name"
							type="text"
							bind:value={newPlaylistName}
							placeholder="Playlist name"
							class="input input-bordered input-sm"
							on:keydown={(e) => e.key === 'Enter' && createPlaylist()}
						/>
					</div>
					<div class="form-control mb-3">
						<textarea
							id="description"
							bind:value={newPlaylistDescription}
							placeholder="Description (optional)"
							class="textarea textarea-bordered textarea-sm"
							rows="2"
						></textarea>
					</div>
					<div class="flex gap-2 justify-end">
						<button on:click={() => (isCreating = false)} class="btn btn-ghost btn-sm">Cancel</button>
						<button on:click={createPlaylist} class="btn btn-primary btn-sm" disabled={!newPlaylistName.trim()}>
							Create
						</button>
					</div>
				</div>
			</div>
		{/if}

		<!-- Playlists List -->
		{#if playlists.length === 0}
			<div class="text-center py-12 text-base-content/50">
				<Icon icon="solar:playlist-minimalistic-2-bold" width="48" className="mx-auto mb-3 opacity-30" />
				<p class="text-sm">No playlists yet</p>
				<p class="text-xs mt-1">Click the + button above to create one</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each playlists as playlist}
					<div class="card bg-base-200 hover:bg-base-300 transition-colors">
						<div class="card-body">
							<h4 class="card-title">{playlist.name}</h4>
							{#if playlist.description}
								<p class="text-sm text-base-content/70">{playlist.description}</p>
							{/if}
							<p class="text-xs text-base-content/50 mt-2">
								{playlist.tracks.length} tracks
							</p>
							<div class="card-actions justify-end mt-4">
								<button
									on:click={() => deletePlaylist(playlist.id, playlist.name)}
									class="btn btn-ghost btn-sm"
								>
									Delete
								</button>
								<a href="{base}/library/playlists/{playlist.id}" class="btn btn-primary btn-sm">
									Open
								</a>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>
