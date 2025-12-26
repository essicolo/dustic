<script lang="ts">
	import '../app.css';
	import PlayerBar from '$lib/components/Player/PlayerBar.svelte';
	import ProfileManager from '$lib/components/Sidebar/ProfileManager.svelte';
	import { POPULAR_COLLECTIONS } from '$lib/utils/constants';
	import { page } from '$app/stores';

	$: currentPath = $page.url.pathname;
</script>

<div class="min-h-screen flex flex-col">
	<div class="flex-1 flex">
		<!-- Sidebar -->
		<aside class="w-64 bg-base-200 p-4 overflow-y-auto border-r border-base-300">
			<div class="mb-8">
				<h1 class="text-2xl font-bold tracking-tight">Dustic</h1>
				<p class="text-xs text-base-content/50 mt-1">Archive Audio Player</p>
			</div>

			<nav class="space-y-1 mb-4">
				<a
					href="/"
					class="block px-4 py-2.5 rounded-lg hover:bg-base-300 transition-all text-sm font-medium"
					class:bg-primary={currentPath === '/'}
					class:text-primary-content={currentPath === '/'}
				>
					Home
				</a>
				<a
					href="/search"
					class="block px-4 py-2.5 rounded-lg hover:bg-base-300 transition-all text-sm font-medium"
					class:bg-primary={currentPath === '/search'}
					class:text-primary-content={currentPath === '/search'}
				>
					Search
				</a>
				<a
					href="/trending"
					class="block px-4 py-2.5 rounded-lg hover:bg-base-300 transition-all text-sm font-medium"
					class:bg-primary={currentPath === '/trending'}
					class:text-primary-content={currentPath === '/trending'}
				>
					Trending
				</a>

				<div class="border-t border-base-300 my-4"></div>

				<div class="px-4 py-2 text-xs font-semibold text-base-content/40 uppercase tracking-wider">
					Collections
				</div>
				{#each POPULAR_COLLECTIONS as collection}
					<a
						href="/collection/{collection.id}"
						class="block px-4 py-2 rounded-lg hover:bg-base-300 transition-all text-sm"
						class:bg-primary={currentPath === `/collection/${collection.id}`}
						class:text-primary-content={currentPath === `/collection/${collection.id}`}
					>
						{collection.name}
					</a>
				{/each}

				<div class="border-t border-base-300 my-4"></div>

				<a
					href="/library"
					class="block px-4 py-2.5 rounded-lg hover:bg-base-300 transition-all text-sm font-medium"
					class:bg-primary={currentPath.startsWith('/library')}
					class:text-primary-content={currentPath.startsWith('/library')}
				>
					Library
				</a>
				<a
					href="/history"
					class="block px-4 py-2.5 rounded-lg hover:bg-base-300 transition-all text-sm font-medium"
					class:bg-primary={currentPath === '/history'}
					class:text-primary-content={currentPath === '/history'}
				>
					History
				</a>
				<a
					href="/settings"
					class="block px-4 py-2.5 rounded-lg hover:bg-base-300 transition-all text-sm font-medium"
					class:bg-primary={currentPath.startsWith('/settings')}
					class:text-primary-content={currentPath.startsWith('/settings')}
				>
					Settings
				</a>
			</nav>

			<!-- Profile Manager -->
			<ProfileManager />

			<!-- Feedback Button -->
			<a
				href="https://github.com/essicolo/dustic/issues/new"
				target="_blank"
				rel="noopener noreferrer"
				class="block mt-4 px-4 py-2.5 text-center text-sm border border-base-300 rounded-lg hover:bg-base-300 transition-all font-medium"
			>
				Send Feedback
			</a>
		</aside>

		<!-- Main content -->
		<main class="flex-1 overflow-y-auto bg-base-100">
			<slot />
		</main>
	</div>

	<!-- Player bar -->
	<footer class="h-24 bg-base-200 border-t border-base-300">
		<PlayerBar />
	</footer>
</div>
