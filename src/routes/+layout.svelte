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
	import { player } from '$lib/stores/player';
	import { onMount } from 'svelte';

	$: currentPath = $page.url.pathname;
	$: pageKey = $page.url.pathname;

	let isSidebarOpen = false;
	let showHeader = true;
	let lastScrollY = 0;
	let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

	function toggleSidebar() {
		isSidebarOpen = !isSidebarOpen;
	}

	function closeSidebar() {
		isSidebarOpen = false;
	}

	onMount(() => {
		const handleScroll = () => {
			// Throttle scroll events to avoid excessive updates
			if (scrollTimeout) return;

			scrollTimeout = setTimeout(() => {
				scrollTimeout = null;
			}, 100);

			const currentScrollY = window.scrollY;

			// Always show at top of page
			if (currentScrollY < 10) {
				showHeader = true;
			}
			// Only hide/show if scrolled more than 5px to avoid jitter
			else if (Math.abs(currentScrollY - lastScrollY) > 5) {
				if (currentScrollY > lastScrollY) {
					showHeader = false;
				} else {
					showHeader = true;
				}
			}

			lastScrollY = currentScrollY;
		};

		window.addEventListener('scroll', handleScroll, { passive: true });
		return () => {
			window.removeEventListener('scroll', handleScroll);
			if (scrollTimeout) clearTimeout(scrollTimeout);
		};
	});
</script>

<div class="min-h-screen flex flex-col">
	<div class="flex-1 flex">
		<!-- Mobile Header - Compact + Auto-hide -->
		<div
			class="lg:hidden fixed top-0 left-0 right-0 bg-base-200 border-b border-base-300 z-30 flex items-center justify-between px-2 safe-header transition-transform duration-200 ease-out"
			class:-translate-y-full={!showHeader}
			style="will-change: transform;"
		>
			<button on:click={toggleSidebar} class="btn btn-ghost btn-circle btn-md flex-shrink-0">
				<Icon icon="solar:hamburger-menu-bold" width="24" />
			</button>
			<div class="flex items-center gap-2 flex-1 justify-center">
				<img src="{base}/logo-dustic.svg" alt="Dustic" class="w-6 h-6" />
				<h1 class="text-lg font-semibold">Dustic</h1>
			</div>
			<div class="w-12 flex-shrink-0"></div><!-- Spacer for symmetry -->
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
			class="w-64 bg-base-200 p-2 pb-32 overflow-y-auto border-r border-base-300 fixed lg:sticky inset-y-0 lg:top-0 lg:h-screen left-0 z-40 transform transition-transform duration-200 ease-in-out safe-sidebar"
			class:translate-x-0={isSidebarOpen}
			class:-translate-x-full={!isSidebarOpen}
			class:lg:translate-x-0={true}
		>
			<!-- Logo - Desktop only -->
			<a href="{base}/" class="hidden lg:flex items-center gap-3 px-4 py-4 mb-2">
				<img src="{base}/logo-dustic.svg" alt="Dustic" class="w-8 h-8" />
				<span class="text-xl font-bold">Dustic</span>
			</a>

			<!-- Close button for mobile only -->
			<div class="flex justify-end lg:hidden pt-1 pb-2">
				<button on:click={closeSidebar} class="btn btn-ghost btn-sm btn-circle">
					<Icon icon="solar:close-circle-bold" width="18" />
				</button>
			</div>

			<nav class="space-y-1 px-2 mb-4">
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
				class="block mt-4 mb-4 px-4 py-2.5 text-center text-sm border border-base-300 rounded-lg hover:bg-base-300 transition-all font-medium"
			>
				Send Feedback
			</a>
		</aside>

		<!-- Main content -->
		<main class="flex-1 overflow-y-auto bg-base-100 safe-main-padding safe-content-padding lg:pt-0 lg:ml-0">
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
