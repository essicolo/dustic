<script lang="ts">
	import '../app.css';
	import PlayerBar from '$lib/components/Player/PlayerBar.svelte';
	import ProfileManager from '$lib/components/Sidebar/ProfileManager.svelte';
	import UpdateNotification from '$lib/components/UpdateNotification.svelte';
	import { POPULAR_COLLECTIONS, DEFAULT_FUNKWHALE_INSTANCES } from '$lib/utils/constants';
	import { settings } from '$lib/stores/settings';
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import { fade } from 'svelte/transition';
	import { player } from '$lib/stores/player';
	import { offline } from '$lib/stores/offline';
	import { onMount } from 'svelte';
	import { browser, dev } from '$app/environment';
	import { fetchTags } from '$lib/services/funkwhale';

	$: currentPath = $page.url.pathname;
	$: pageKey = $page.url.pathname;

	let isSidebarOpen = false;
	let showHeader = true;
	let lastScrollY = 0;
	let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

	// Collapsible state for each source group
	let iaExpanded = true;
	let fwExpandedMap: Record<string, boolean> = {};
	let fwTagsMap: Record<string, string[]> = {};
	let fwTagsLoading: Record<string, boolean> = {};

	$: funkwhaleInstances = ($settings.funkwhaleInstances || DEFAULT_FUNKWHALE_INSTANCES).filter(i => i.enabled);

	function toggleSidebar() {
		isSidebarOpen = !isSidebarOpen;
	}

	function closeSidebar() {
		isSidebarOpen = false;
	}

	function toggleIA() {
		iaExpanded = !iaExpanded;
	}

	function toggleFW(url: string) {
		fwExpandedMap[url] = !fwExpandedMap[url];
		fwExpandedMap = fwExpandedMap; // trigger reactivity

		// Fetch tags when expanding if not already loaded
		if (fwExpandedMap[url] && !fwTagsMap[url] && !fwTagsLoading[url]) {
			loadFWTags(url);
		}
	}

	async function loadFWTags(url: string) {
		fwTagsLoading[url] = true;
		fwTagsLoading = fwTagsLoading;
		try {
			const tags = await fetchTags(url, 8);
			fwTagsMap[url] = tags;
			fwTagsMap = fwTagsMap;
		} catch {
			fwTagsMap[url] = [];
			fwTagsMap = fwTagsMap;
		}
		fwTagsLoading[url] = false;
		fwTagsLoading = fwTagsLoading;
	}

	function isFWExpanded(url: string): boolean {
		return fwExpandedMap[url] ?? false;
	}

	onMount(async () => {
		// Initialize offline storage
		offline.loadOfflineTracks();

		// Initialize Eruda mobile debugging console
		// Enable only with ?debug=1 in URL
		if (browser) {
			const urlParams = new URLSearchParams(window.location.search);
			const enableDebug = urlParams.get('debug') === '1';

			if (enableDebug) {
				const eruda = await import('eruda');
				eruda.default.init();
				console.log('[Eruda] Mobile debugging console initialized');
			}
		}

		// Register service worker for PWA support
		if (browser && 'serviceWorker' in navigator) {
			if (dev) {
				// Unregister service worker in dev mode to avoid conflicts
				navigator.serviceWorker.getRegistrations().then((registrations) => {
					for (const registration of registrations) {
						registration.unregister();
						console.log('Service Worker unregistered in dev mode');
					}
				});
			} else {
				navigator.serviceWorker.register('/service-worker.js', {
					type: 'classic',
					scope: '/'
				}).then((registration) => {
					console.log('Service Worker registered with scope:', registration.scope);
				}).catch((error) => {
					console.error('Service Worker registration failed:', error);
				});
			}
		}

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
			class="w-64 bg-base-200 p-2 pb-6 overflow-y-auto border-r border-base-300 fixed lg:sticky inset-y-0 lg:top-0 lg:h-screen left-0 z-40 transform transition-transform duration-200 ease-in-out safe-sidebar sidebar-scrollbar"
			class:translate-x-0={isSidebarOpen}
			class:-translate-x-full={!isSidebarOpen}
			class:lg:translate-x-0={true}
		>
			<!-- Logo - Desktop only -->
			<a href="{base}/" class="hidden lg:flex items-center gap-3 px-4 py-3 mb-1">
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
					class="block px-4 py-2 rounded-lg hover:bg-base-300 transition-all text-sm font-medium"
					class:bg-primary={currentPath === `${base}/` || currentPath === base}
					class:text-primary-content={currentPath === `${base}/` || currentPath === base}
				>
					Home
				</a>
				<a
					href="{base}/library"
					on:click={closeSidebar}
					class="block px-4 py-2 rounded-lg hover:bg-base-300 transition-all text-sm font-medium"
					class:bg-primary={currentPath.startsWith(`${base}/library`) || currentPath === `${base}/history`}
					class:text-primary-content={currentPath.startsWith(`${base}/library`) || currentPath === `${base}/history`}
				>
					Library
				</a>
				<a
					href="{base}/search"
					on:click={closeSidebar}
					class="block px-4 py-2 rounded-lg hover:bg-base-300 transition-all text-sm font-medium"
					class:bg-primary={currentPath === `${base}/search`}
					class:text-primary-content={currentPath === `${base}/search`}
				>
					Search
				</a>
				<a
					href="{base}/curated"
					on:click={closeSidebar}
					class="block px-4 py-2 rounded-lg hover:bg-base-300 transition-all text-sm font-medium"
					class:bg-primary={currentPath.startsWith(`${base}/curated`)}
					class:text-primary-content={currentPath.startsWith(`${base}/curated`)}
				>
					<div class="flex items-center gap-2">
						<span>Curated</span>
						<Icon icon="solar:star-bold" width="14" class="text-primary" />
					</div>
				</a>
				<a
					href="https://dustic.bearblog.dev/"
					target="_blank"
					rel="noopener noreferrer"
					on:click={closeSidebar}
					class="block px-4 py-2 rounded-lg hover:bg-base-300 transition-all text-sm font-medium"
				>
					<div class="flex items-center gap-2">
						<span>Magazine</span>
						<Icon icon="solar:arrow-right-up-linear" width="14" class="text-base-content/40" />
					</div>
				</a>

				<div class="border-t border-base-300 my-3"></div>

				<!-- Sources heading -->
				<div class="px-4 py-1.5 text-xs font-semibold text-base-content/40 uppercase tracking-wider">
					Sources
				</div>

				<!-- Internet Archive (collapsible) -->
				<button
					on:click={toggleIA}
					class="w-full flex items-center justify-between px-4 py-2 rounded-lg hover:bg-base-300 transition-colors text-sm font-medium"
				>
					<span>archive.org</span>
					<Icon icon={iaExpanded ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'} width="14" class="text-base-content/40" />
				</button>
				{#if iaExpanded}
					{#each POPULAR_COLLECTIONS as collection}
						<a
							href="{base}/collection/{collection.id}"
							on:click={closeSidebar}
							class="block pl-8 pr-4 py-1.5 rounded-lg hover:bg-base-300 transition-all text-sm text-base-content/70"
							class:bg-primary={currentPath === `${base}/collection/${collection.id}`}
							class:text-primary-content={currentPath === `${base}/collection/${collection.id}`}
						>
							{collection.name}
						</a>
					{/each}
				{/if}

				<!-- FunkWhale instances (each collapsible) -->
				{#each funkwhaleInstances as instance}
					{@const fwExpanded = isFWExpanded(instance.url)}
					<button
						on:click={() => toggleFW(instance.url)}
						class="w-full flex items-center justify-between px-4 py-2 rounded-lg hover:bg-base-300 transition-colors text-sm font-medium"
					>
						<div class="flex items-center gap-1.5">
							<span>{instance.name}</span>
							<img src="{base}/funkwhale-icon.svg" alt="FunkWhale" class="w-4 h-4 opacity-40" />
						</div>
						<Icon icon={fwExpanded ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'} width="14" class="text-base-content/40" />
					</button>
					{#if fwExpanded}
						<a
							href="{base}/search?q=*"
							on:click={closeSidebar}
							class="block pl-8 pr-4 py-1.5 rounded-lg hover:bg-base-300 transition-all text-sm text-base-content/70"
						>
							Recent tracks
						</a>
						{#if fwTagsLoading[instance.url]}
							<div class="pl-8 pr-4 py-1.5 text-xs text-base-content/40">Loading tags...</div>
						{:else if fwTagsMap[instance.url]?.length}
							{#each fwTagsMap[instance.url] as tag}
								<a
									href="{base}/search?q={encodeURIComponent(tag)}"
									on:click={closeSidebar}
									class="block pl-8 pr-4 py-1.5 rounded-lg hover:bg-base-300 transition-all text-sm text-base-content/70"
								>
									{tag}
								</a>
							{/each}
						{/if}
					{/if}
				{/each}

				<div class="border-t border-base-300 my-3"></div>

				<a
					href="{base}/settings"
					on:click={closeSidebar}
					class="block px-4 py-2 rounded-lg hover:bg-base-300 transition-all text-sm font-medium"
					class:bg-primary={currentPath.startsWith(`${base}/settings`)}
					class:text-primary-content={currentPath.startsWith(`${base}/settings`)}
				>
					Settings
				</a>

				<div class="border-t border-base-300 my-3"></div>

				<a
					href="{base}/about"
					on:click={closeSidebar}
					class="block px-4 py-2 rounded-lg hover:bg-base-300 transition-all text-sm font-medium"
					class:bg-primary={currentPath === `${base}/about`}
					class:text-primary-content={currentPath === `${base}/about`}
				>
					About
				</a>
			</nav>

			<!-- Compact Profile Manager -->
			<ProfileManager />
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
