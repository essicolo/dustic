<script lang="ts">
	import '../app.css';
	import PlayerBar from '$lib/components/Player/PlayerBar.svelte';
	import ProfileManager from '$lib/components/Sidebar/ProfileManager.svelte';
	import UpdateNotification from '$lib/components/UpdateNotification.svelte';
	import { POPULAR_COLLECTIONS } from '$lib/utils/constants';
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import { fade } from 'svelte/transition';

	$: currentPath = $page.url.pathname;
	$: pageKey = $page.url.pathname;

	let isSidebarOpen = false;

	function toggleSidebar() {
		isSidebarOpen = !isSidebarOpen;
	}

	function closeSidebar() {
		isSidebarOpen = false;
	}
</script>

<div class="min-h-screen flex flex-col">
	<div class="flex-1 flex safe-content-padding">
		<!-- Mobile Header -->
		<div class="lg:hidden fixed top-0 left-0 right-0 bg-base-200 border-b border-base-300 z-30 flex items-center px-4 gap-3 safe-header">
			<button on:click={toggleSidebar} class="btn btn-ghost btn-square btn-md">
				<Icon icon="solar:hamburger-menu-bold" width="28" />
			</button>
			<img src="{base}/logo-dustic.svg" alt="Dustic" class="h-8 w-auto" />
			<h1 class="text-xl font-bold">Dustic</h1>
		</div>

		<!-- Overlay for mobile -->
		{#if isSidebarOpen}
			<div
				class="lg:hidden fixed inset-0 bg-black/50 z-30"
				on:click={closeSidebar}
				on:keydown={(e) => e.key === 'Escape' && closeSidebar()}
				role="button"
				tabindex="0"
				aria-label="Close sidebar"
			></div>
		{/if}

		<!-- Sidebar -->
		<aside
			class="w-64 bg-base-200 p-4 pb-24 overflow-y-auto border-r border-base-300 fixed lg:static inset-y-0 left-0 z-40 transform transition-transform duration-200 ease-in-out safe-sidebar"
			class:translate-x-0={isSidebarOpen}
			class:-translate-x-full={!isSidebarOpen}
			class:lg:translate-x-0={true}
		>
			<div class="mb-8 flex items-center justify-between">
				<div class="flex items-center gap-3">
					<img src="{base}/logo-dustic.svg" alt="Dustic" class="h-10 w-auto" />
					<div>
						<h1 class="text-2xl font-bold tracking-tight">Dustic</h1>
						<p class="text-xs text-base-content/50 mt-1">Archive Audio Player</p>
					</div>
				</div>
				<button on:click={closeSidebar} class="btn btn-ghost btn-sm btn-square lg:hidden">
					<Icon icon="solar:close-circle-bold" width="20" />
				</button>
			</div>

			<nav class="space-y-1 mb-4">
				<a
					href="{base}/"
					on:click={closeSidebar}
					class="block px-4 py-2.5 rounded-lg hover:bg-base-300 transition-all text-sm font-medium"
					class:bg-primary={currentPath === `${base}/` || currentPath === base}
					class:text-primary-content={currentPath === `${base}/` || currentPath === base}
				>
					Home
				</a>
				<a
					href="{base}/search"
					on:click={closeSidebar}
					class="block px-4 py-2.5 rounded-lg hover:bg-base-300 transition-all text-sm font-medium"
					class:bg-primary={currentPath === `${base}/search`}
					class:text-primary-content={currentPath === `${base}/search`}
				>
					Search
				</a>

				<div class="border-t border-base-300 my-4"></div>

				<div class="px-4 py-2 text-xs font-semibold text-base-content/40 uppercase tracking-wider">
					Collections
				</div>
				{#each POPULAR_COLLECTIONS as collection}
					<a
						href="{base}/collection/{collection.id}"
						on:click={closeSidebar}
						class="block px-4 py-2 rounded-lg hover:bg-base-300 transition-all text-sm"
						class:bg-primary={currentPath === `${base}/collection/${collection.id}`}
						class:text-primary-content={currentPath === `${base}/collection/${collection.id}`}
					>
						{collection.name}
					</a>
				{/each}

				<div class="border-t border-base-300 my-4"></div>

				<a
					href="{base}/library"
					on:click={closeSidebar}
					class="block px-4 py-2.5 rounded-lg hover:bg-base-300 transition-all text-sm font-medium"
					class:bg-primary={currentPath.startsWith(`${base}/library`) || currentPath === `${base}/history`}
					class:text-primary-content={currentPath.startsWith(`${base}/library`) || currentPath === `${base}/history`}
				>
					Library
				</a>
				<a
					href="{base}/settings"
					on:click={closeSidebar}
					class="block px-4 py-2.5 rounded-lg hover:bg-base-300 transition-all text-sm font-medium"
					class:bg-primary={currentPath.startsWith(`${base}/settings`)}
					class:text-primary-content={currentPath.startsWith(`${base}/settings`)}
				>
					Settings
				</a>

				<div class="border-t border-base-300 my-4"></div>

				<a
					href="https://github.com/sponsors/essicolo"
					target="_blank"
					rel="noopener noreferrer"
					on:click={closeSidebar}
					class="block px-4 py-2.5 rounded-lg bg-pink-600 hover:bg-pink-700 transition-all text-sm font-medium text-white flex items-center justify-center gap-2"
				>
					<Icon icon="solar:heart-bold" width="18" />
					<span>Sponsor</span>
				</a>
				<a
					href="{base}/about"
					on:click={closeSidebar}
					class="block px-4 py-2.5 rounded-lg hover:bg-base-300 transition-all text-sm font-medium"
					class:bg-primary={currentPath === `${base}/about`}
					class:text-primary-content={currentPath === `${base}/about`}
				>
					About
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
		<main class="flex-1 overflow-y-auto bg-base-100 safe-main-padding lg:pt-0 lg:ml-0">
			{#key pageKey}
				<div in:fade={{ duration: 150, delay: 150 }} out:fade={{ duration: 150 }}>
					<slot />
				</div>
			{/key}
		</main>
	</div>

	<!-- Player bar - Fixed at bottom with iOS safe area support -->
	<footer class="fixed bottom-0 left-0 right-0 bg-base-200 border-t border-base-300 z-40 safe-player-bar">
		<PlayerBar />
	</footer>
</div>

<!-- Update notification -->
<UpdateNotification />
