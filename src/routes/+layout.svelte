<script lang="ts">
	import '../app.css';
	import PlayerBar from '$lib/components/Player/PlayerBar.svelte';
	import ProfileManager from '$lib/components/Sidebar/ProfileManager.svelte';
	import SourcesStatus from '$lib/components/Sidebar/SourcesStatus.svelte';
	import UpdateNotification from '$lib/components/UpdateNotification.svelte';
	import QueueContent from '$lib/components/Queue/QueueContent.svelte';
	import { queuePanelOpen } from '$lib/stores/queuePanel';
	import { DEFAULT_FUNKWHALE_INSTANCES } from '$lib/utils/constants';
	import { settings } from '$lib/stores/settings';
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import { fade } from 'svelte/transition';
	import { player } from '$lib/stores/player';
	import { offline } from '$lib/stores/offline';
	import { onMount, onDestroy } from 'svelte';
	import { browser, dev } from '$app/environment';
	import { sourceStatus } from '$lib/stores/sourceStatus';
	import { library } from '$lib/stores/library';
	import { history } from '$lib/stores/history';
	import { theme } from '$lib/stores/theme';
	import ThemePicker from '$lib/components/ThemePicker.svelte';
	import { initI18n, setAppLocale, resolveLocale, _ } from '$lib/i18n';

	// Kick off i18n init synchronously at module load so the first render has
	// a registered locale; settings.init() may refine the choice after.
	const initialLocale = resolveLocale(settings.get().language);
	initI18n(initialLocale);

	let showThemePicker = false;

	$: currentPath = $page.url.pathname;
	$: pageKey = $page.url.pathname;

	let isSidebarOpen = false;
	let showHeader = true;
	let lastScrollY = 0;
	let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

	// Collapsible state for each source group
	let iaExpanded = false;
	let fwExpandedMap: Record<string, boolean> = {};

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
		fwExpandedMap = fwExpandedMap;
	}

	onMount(async () => {
		// First-launch theme picker: shown once per profile.
		showThemePicker = theme.isFirstLaunch();

		// Initialize stores from storage (tries IndexedDB if localStorage is empty)
		// This is critical for iOS PWAs where localStorage can be cleared
		await Promise.all([
			library.init(),
			history.init(),
			settings.init()
		]);

		// Settings may have loaded a stored language from IndexedDB after the
		// initial sync read; reconcile if it differs from what we booted with.
		const persisted = resolveLocale(settings.get().language);
		if (persisted !== initialLocale) {
			await setAppLocale(persisted);
		}

		// Start source availability monitoring
		sourceStatus.start();

		// Initialize offline storage
		offline.loadOfflineTracks();

		// Initialize Eruda mobile debugging console
		// Enable only with ?debug=1 in URL
		if (browser) {
			const urlParams = new URLSearchParams(window.location.search);
			const enableDebug = urlParams.get('debug') === '1';

			if (enableDebug) {
				import('eruda').then((eruda) => {
					eruda.default.init();
					console.log('[Eruda] Mobile debugging console initialized');
				});
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
			sourceStatus.stop();
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
			<button on:click={toggleSidebar} class="btn btn-ghost btn-circle btn-md flex-shrink-0" aria-label={$_('nav.openSidebar')}>
				<Icon icon="solar:hamburger-menu-bold" width="24" />
			</button>
			<div class="flex items-center gap-2 flex-1 justify-center">
				<img src="{base}/logo-dustic.svg" alt="Dustic" class="w-6 h-6" />
				<h1 class="text-lg font-semibold">Dustic</h1>
			</div>
			<div class="w-12 flex-shrink-0"></div>
		</div>

		<!-- Overlay for mobile -->
		{#if isSidebarOpen}
			<div
				class="lg:hidden fixed inset-0 bg-black/50 z-30"
				on:click={closeSidebar}
				on:keydown={(e) => e.key === 'Escape' && closeSidebar()}
				role="button"
				tabindex="0"
				aria-label={$_('nav.closeSidebar')}
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
				<button on:click={closeSidebar} class="btn btn-ghost btn-sm btn-circle" aria-label={$_('common.close')}>
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
					{$_('nav.home')}
				</a>
				<a
					href="{base}/library"
					on:click={closeSidebar}
					class="block px-4 py-2 rounded-lg hover:bg-base-300 transition-all text-sm font-medium"
					class:bg-primary={currentPath.startsWith(`${base}/library`) || currentPath === `${base}/history`}
					class:text-primary-content={currentPath.startsWith(`${base}/library`) || currentPath === `${base}/history`}
				>
					{$_('nav.library')}
				</a>
				<a
					href="{base}/search"
					on:click={closeSidebar}
					class="block px-4 py-2 rounded-lg hover:bg-base-300 transition-all text-sm font-medium"
					class:bg-primary={currentPath === `${base}/search`}
					class:text-primary-content={currentPath === `${base}/search`}
				>
					{$_('nav.search')}
				</a>
				<a
					href="{base}/curated"
					on:click={closeSidebar}
					class="block px-4 py-2 rounded-lg hover:bg-base-300 transition-all text-sm font-medium"
					class:bg-primary={currentPath.startsWith(`${base}/curated`)}
					class:text-primary-content={currentPath.startsWith(`${base}/curated`)}
				>
					{$_('nav.curated')}
				</a>
				<a
					href="https://dustic.bearblog.dev/"
					target="_blank"
					rel="noopener noreferrer"
					on:click={closeSidebar}
					class="block px-4 py-2 rounded-lg hover:bg-base-300 transition-all text-sm font-medium"
				>
					{$_('nav.magazine')}
				</a>
				<!-- The PARCOURIR (Browse by content type) sub-list and the
				     About link were removed here: Search already lets users
				     filter by content type, and About moved into the
				     Settings tab strip. Dropping both shortens the nav and
				     gets rid of the extra dividers that made the bottom
				     spacing look uneven. -->
			</nav>

			<!-- Bottom cluster: Sources / Profile / Settings.
			     Same `space-y-1 px-2` rhythm as the top nav so the gaps
			     between buttons match what's above. A single border-t
			     marks the boundary with the main nav. -->
			<div class="border-t border-base-300 my-3 mx-2"></div>
			<nav class="space-y-1 px-2 mb-4">
				<SourcesStatus />
				<ProfileManager />
				<a
					href="{base}/settings"
					on:click={closeSidebar}
					class="btn btn-ghost btn-sm w-full justify-start gap-2 normal-case font-medium"
					class:btn-active={currentPath.startsWith(`${base}/settings`)}
				>
					<Icon icon="solar:settings-bold" width="18" />
					<span>{$_('nav.settings')}</span>
				</a>
			</nav>
		</aside>

		<!-- Main content -->
		<main class="flex-1 overflow-y-auto bg-base-100 safe-main-padding safe-content-padding lg:pt-0 lg:ml-0">
			{#key pageKey}
				<div in:fade={{ duration: 150, delay: 150 }} out:fade={{ duration: 150 }}>
					<slot />
				</div>
			{/key}
		</main>

		<!-- Queue right panel — desktop xl+ only -->
		{#if $queuePanelOpen}
			<aside class="hidden xl:flex w-96 bg-base-200 border-l border-base-300 flex-col sticky top-0 h-screen overflow-hidden shrink-0"
				style="padding-bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px));">
				<QueueContent on:close={() => queuePanelOpen.close()} />
			</aside>
		{/if}
	</div>

	<!-- Player bar - Fixed at bottom with iOS safe area support -->
	<footer class="fixed bottom-0 left-0 right-0 bg-base-200 border-t border-base-300 z-40 safe-player-bar">
		<PlayerBar />
	</footer>
</div>

<!-- Update notification -->
<UpdateNotification />

<!-- First-launch theme picker -->
{#if showThemePicker}
	<ThemePicker mode="first-launch" on:done={() => (showThemePicker = false)} />
{/if}
