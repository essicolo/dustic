<script lang="ts">
	import { library } from '$lib/stores/library';
	import { offline } from '$lib/stores/offline';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';

	let newPlaylistName = '';
	let newPlaylistDescription = '';
	let isCreating = false;

	onMount(() => {
		// Load offline tracks count
		offline.loadOfflineTracks();
	});

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

	<!-- Quick Links -->
	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
		<a
			href="{base}/library/favorites"
			class="card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer"
		>
			<div class="card-body">
				<h3 class="card-title">Favorites</h3>
				<p class="text-base-content/70">{$library.favorites.length} tracks</p>
			</div>
		</a>

		<a
			href="{base}/library/local"
			class="card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer"
		>
			<div class="card-body">
				<h3 class="card-title">Local</h3>
				<p class="text-base-content/70">{$offline.offlineTracks.length} offline tracks</p>
			</div>
		</a>

		<a
			href="{base}/history"
			class="card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer"
		>
			<div class="card-body">
				<h3 class="card-title">History</h3>
				<p class="text-base-content/70">Recently played</p>
			</div>
		</a>

		<button
			on:click={() => (isCreating = !isCreating)}
			class="card bg-primary hover:bg-primary/90 transition-colors cursor-pointer text-primary-content"
		>
			<div class="card-body">
				<h3 class="card-title">New Playlist</h3>
				<p class="opacity-90">Create a playlist</p>
			</div>
		</button>
	</div>

	<!-- Create Playlist Modal -->
	{#if isCreating}
		<div class="card bg-base-200 mb-8">
			<div class="card-body">
				<h3 class="card-title">Create New Playlist</h3>
				<div class="form-control">
					<label class="label" for="playlist-name">
						<span class="label-text">Name</span>
					</label>
					<input
						id="playlist-name"
						type="text"
						bind:value={newPlaylistName}
						placeholder="My Awesome Playlist"
						class="input input-bordered"
						on:keydown={(e) => e.key === 'Enter' && createPlaylist()}
					/>
				</div>
				<div class="form-control">
					<label class="label" for="description">
						<span class="label-text">Description (optional)</span>
					</label>
					<textarea
						id="description"
						bind:value={newPlaylistDescription}
						placeholder="Description..."
						class="textarea textarea-bordered"
					></textarea>
				</div>
				<div class="card-actions justify-end mt-4">
					<button on:click={() => (isCreating = false)} class="btn btn-ghost">Cancel</button>
					<button on:click={createPlaylist} class="btn btn-primary" disabled={!newPlaylistName.trim()}>
						Create
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Playlists List -->
	<h3 class="text-xl font-bold mb-4">Your Playlists</h3>
	{#if playlists.length === 0}
		<div class="text-center py-20 text-base-content/50">
			<p class="text-lg">No playlists yet</p>
			<p class="text-sm mt-2">Create your first playlist above</p>
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
</div>
