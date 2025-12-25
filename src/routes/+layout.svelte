<script lang="ts">
	import '../app.css';
	import PlayerBar from '$lib/components/Player/PlayerBar.svelte';
</script>

<div class="min-h-screen flex flex-col">
	<div class="flex-1 flex">
		<!-- Sidebar will go here -->
		<aside class="w-64 bg-base-200 p-4">
			<h1 class="text-2xl font-bold text-primary mb-8">Dustic</h1>
			<nav class="space-y-2">
				<a href="/" class="block px-4 py-2 rounded hover:bg-base-300">🏠 Home</a>
				<a href="/search" class="block px-4 py-2 rounded hover:bg-base-300">🔍 Search</a>
				<a href="/library" class="block px-4 py-2 rounded hover:bg-base-300">📚 Library</a>
				<a href="/settings" class="block px-4 py-2 rounded hover:bg-base-300">⚙️ Settings</a>
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
