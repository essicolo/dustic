<script lang="ts">
	import { library } from '$lib/stores/library';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import Icon from '@iconify/svelte';

	$: playlistCount = Object.keys($library.playlists).length;
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
		<a
			href="{base}/library/playlists"
			class="card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer"
		>
			<div class="card-body">
				<h3 class="card-title">Playlists</h3>
				<p class="text-base-content/70">{playlistCount} playlist{playlistCount !== 1 ? 's' : ''}</p>
			</div>
		</a>
	</section>
</div>
