<script lang="ts">
	import '../app.css';
	import PlayerBar from '$lib/components/Player/PlayerBar.svelte';
	import { POPULAR_COLLECTIONS } from '$lib/utils/constants';
	import { page } from '$app/stores';

	$: currentPath = $page.url.pathname;
</script>

<div class="min-h-screen flex flex-col">
	<div class="flex-1 flex">
		<!-- Sidebar -->
		<aside class="w-64 bg-base-200 p-4 overflow-y-auto">
			<h1 class="text-2xl font-bold text-primary mb-8">Dustic</h1>
			<nav class="space-y-1">
				<a
					href="/"
					class="block px-4 py-2 rounded hover:bg-base-300 transition-colors"
					class:bg-base-300={currentPath === '/'}
				>
					🏠 Home
				</a>
				<a
					href="/search"
					class="block px-4 py-2 rounded hover:bg-base-300 transition-colors"
					class:bg-base-300={currentPath === '/search'}
				>
					🔍 Search
				</a>
				<a
					href="/trending"
					class="block px-4 py-2 rounded hover:bg-base-300 transition-colors"
					class:bg-base-300={currentPath === '/trending'}
				>
					📊 Trending
				</a>

				<div class="divider my-2"></div>

				<div class="px-4 py-2 text-xs font-semibold text-base-content/50 uppercase">
					Collections
				</div>
				{#each POPULAR_COLLECTIONS as collection}
					<a
						href="/collection/{collection.id}"
						class="block px-4 py-2 rounded hover:bg-base-300 transition-colors text-sm"
						class:bg-base-300={currentPath === `/collection/${collection.id}`}
					>
						{collection.icon} {collection.name}
					</a>
				{/each}

				<div class="divider my-2"></div>

				<a
					href="/library"
					class="block px-4 py-2 rounded hover:bg-base-300 transition-colors"
					class:bg-base-300={currentPath.startsWith('/library')}
				>
					📚 Library
				</a>
				<a
					href="/history"
					class="block px-4 py-2 rounded hover:bg-base-300 transition-colors"
					class:bg-base-300={currentPath === '/history'}
				>
					🕒 History
				</a>
				<a
					href="/settings"
					class="block px-4 py-2 rounded hover:bg-base-300 transition-colors"
					class:bg-base-300={currentPath.startsWith('/settings')}
				>
					⚙️ Settings
				</a>
			</nav>
		</aside>

		<!-- Main content -->
		<main class="flex-1 overflow-y-auto">
			<slot />
		</main>
	</div>

	<!-- Player bar -->
	<footer class="h-24 bg-base-300 border-t border-base-content/10">
		<PlayerBar />
	</footer>
</div>
