<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import Icon from '@iconify/svelte';

	// Stores
	import { library } from '$lib/stores/library';
	import { queue } from '$lib/stores/queue';
	import { player } from '$lib/stores/player';

	// Services & Utils
	import { getTrack, getAllTracks, getThumbnailUrl } from '$lib/services/internetArchive';
	import { shareTrack } from '$lib/utils/share';

	// Components
	import DownloadButton from '$lib/components/DownloadButton.svelte';
	import LoadingImage from './LoadingImage.svelte';

	// Types
	import type { ArchiveItem, Track } from '$lib/types';

	export let item: ArchiveItem;
	export let type: 'album' | 'track' = 'album';
	export let layout: 'tile' | 'list' = 'tile';
	export let compact = false;
	export let showRemoveFromQueue = false;
	export let actionsLayout: 'full' | 'collapsed' | 'auto' = 'auto';

	const dispatch = createEventDispatcher();

	let isFetching = false;
	let showPlaylistSelector = false;
	let showActions = false;
	let tracks: Track[] = item.tracks || [];
	let actionsButton: HTMLElement;
	let actionsMenu: HTMLElement;

	// Auto-collapse actions on mobile in list view for better space usage
	$: effectiveActionsLayout = actionsLayout === 'auto'
		? (layout === 'list' ? 'collapsed' : 'full')
		: actionsLayout;

	// --- Portal Action for Dropdown ---
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		node.style.display = 'block';

		return {
			destroy() {
				if (node.parentNode) {
					node.parentNode.removeChild(node);
				}
			}
		};
	}

	function positionActionsMenu() {
		if (!actionsButton || !actionsMenu) return;

		const btnRect = actionsButton.getBoundingClientRect();
		const menuWidth = 224; // w-56 = 14rem = 224px
		const gap = 4;

		// Calculate available space
		const spaceRight = window.innerWidth - btnRect.right;
		const spaceLeft = btnRect.left;

		// Position vertically below the button
		const top = btnRect.bottom + window.scrollY + gap;
		actionsMenu.style.top = `${top}px`;

		// Position horizontally - prefer right-aligned but check for overflow
		if (spaceRight >= menuWidth) {
			// Enough space on the right, align menu's right edge with button's right edge
			actionsMenu.style.right = `${window.innerWidth - btnRect.right}px`;
			actionsMenu.style.left = 'auto';
		} else if (spaceLeft >= menuWidth) {
			// Not enough space on right, align menu's left edge with button's left edge
			actionsMenu.style.left = `${btnRect.left + window.scrollX}px`;
			actionsMenu.style.right = 'auto';
		} else {
			// Not enough space on either side, center the menu
			actionsMenu.style.left = `${Math.max(gap, btnRect.left + window.scrollX - menuWidth / 2)}px`;
			actionsMenu.style.right = 'auto';
		}
	}

	function toggleActions(event: MouseEvent) {
		event.stopPropagation();
		showActions = !showActions;
		if (showActions) {
			setTimeout(positionActionsMenu, 0);
		}
	}

	function clickOutside(node: HTMLElement) {
		const handleClick = (event: MouseEvent) => {
			if (node && !node.contains(event.target as Node) && !actionsButton.contains(event.target as Node)) {
				showActions = false;
			}
		};

		document.addEventListener('click', handleClick, true);

		return {
			destroy() {
				document.removeEventListener('click', handleClick, true);
			}
		};
	}


	$: isFavorite = $library.favorites.includes(item.identifier);
	$: playlists = Object.values($library.playlists).sort((a, b) => b.updated - a.updated);
	$: thumb = getThumbnailUrl(item.identifier);

	async function ensureTracks(): Promise<Track[]> {
		if (tracks.length > 0) return tracks;
		isFetching = true;
		try {
			let fetchedTracks: Track[] = [];
			if (type === 'album') {
				fetchedTracks = await getAllTracks(item.identifier);
			} else {
				const track = await getTrack(item.identifier);
				if (track) fetchedTracks = [track];
			}
			tracks = fetchedTracks;
			item.tracks = fetchedTracks; // Cache on the item object
			return tracks;
		} finally {
			isFetching = false;
		}
	}

	async function handlePlay(e?: MouseEvent | KeyboardEvent) {
		e?.stopPropagation();

		// CRITICAL: Unlock iOS audio synchronously BEFORE any await
		// This must happen in the user gesture context
		player.unlockIOSAudio();

		const tracksToPlay = await ensureTracks();
		if (tracksToPlay?.length > 0) {
			queue.setQueue(tracksToPlay, 0);
			player.play(tracksToPlay[0]);
		}
	}

	async function handleAddToQueue(e: Event) {
		e.stopPropagation();
		showActions = false;
		const tracksToAdd = await ensureTracks();
		if (tracksToAdd?.length > 0) {
			queue.addToEnd(tracksToAdd[0]);
		}
	}

	async function handleShare(e: Event) {
		e.stopPropagation();
		showActions = false;
		const tracksToShare = await ensureTracks();
		if (tracksToShare?.[0]) {
			await shareTrack(tracksToShare[0]);
		}
	}

	function handleToggleFavorite(e: Event) {
		e.stopPropagation();
		showActions = false;
		library.toggleFavorite(item.identifier);
	}

	function handleAddToPlaylist(e: Event, playlistId: string) {
		e.stopPropagation();
		showActions = false;
		library.addToPlaylist(playlistId, item.identifier);
		showPlaylistSelector = false;
	}

	function handleRemoveFromQueue(e: Event) {
		e.stopPropagation();
		showActions = false;
		dispatch('removeFromQueue');
	}

	function handleNavigate() {
		if (type === 'album') {
			goto(`${base}/item/${item.identifier}`);
		} else {
			handlePlay();
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleNavigate();
		}
		if (e.key === 'Escape') {
			showPlaylistSelector = false;
			showActions = false;
		}
	}

	onMount(() => {
		const closeOnEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				showPlaylistSelector = false;
				showActions = false;
			}
		};

		const closeOnClickOutside = (e: MouseEvent) => {
			if (showPlaylistSelector) {
				const playlistSelector = document.getElementById(`playlist-selector-${item.identifier}`);
				if (playlistSelector && !playlistSelector.contains(e.target as Node)) {
					showPlaylistSelector = false;
				}
			}
		};

		window.addEventListener('keydown', closeOnEscape);
		document.addEventListener('click', closeOnClickOutside);

		return () => {
			window.removeEventListener('keydown', closeOnEscape);
			document.removeEventListener('click', closeOnClickOutside);
		};
	});

	// Reposition menu on scroll/resize when open
	$: if (showActions && actionsMenu) {
		const handleScrollResize = () => positionActionsMenu();
		window.addEventListener('scroll', handleScrollResize, true);
		window.addEventListener('resize', handleScrollResize);

		// Cleanup when showActions becomes false
		return () => {
			window.removeEventListener('scroll', handleScrollResize, true);
			window.removeEventListener('resize', handleScrollResize);
		};
	}
</script>

<div
	class="card bg-base-200 hover:bg-base-300 transition-colors duration-200 cursor-pointer group"
	class:card-side={layout === 'list'}
	class:h-full={layout === 'tile'}
	on:click={handleNavigate}
	on:keydown={handleKeyDown}
	role="button"
	tabindex="0"
	aria-label="Play {item.title}"
>
	<figure
		class="relative bg-neutral"
		class:aspect-square={layout === 'tile'}
		class:w-20={layout === 'list'}
		class:h-20={layout === 'list'}
		class:flex-shrink-0={layout === 'list'}
	>
		<LoadingImage
			src={thumb}
			alt="Cover for {item.title}"
			className="w-full h-full object-cover"
			aspectRatio="square"
		/>
		<div
			class="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
		>
			{#if isFetching}
				<span class="loading loading-spinner text-primary"></span>
			{:else}
				<button
					class="btn btn-primary btn-circle"
					class:btn-sm={compact}
					on:click={handlePlay}
					aria-label="Play"
				>
					<Icon icon="solar:play-bold" width={compact ? '20' : '28'} />
				</button>
			{/if}
		</div>
	</figure>

	<div
		class="card-body min-w-0 {layout === 'list'
			? 'flex-row items-center justify-between'
			: 'flex flex-col'} {compact ? 'p-2' : 'p-4'}"
	>
		<div class="flex-grow min-w-0 {layout === 'list' ? 'max-w-[60%]' : ''}">
			<h2 class="card-title {layout === 'list' ? 'line-clamp-2' : 'truncate'} {compact ? 'text-sm' : 'text-base'}">
				{item.title}
			</h2>
			<button
				class="text-sm opacity-70 truncate {compact ? 'text-xs' : 'text-sm'} hover:opacity-100 hover:underline text-left w-full"
				on:click={(e) => {
					e.stopPropagation();
					const artist = (item as any).artist || item.creator || '';
					if (artist && artist !== 'Unknown Artist') {
						goto(`${base}/search?q=creator:"${encodeURIComponent(artist)}"`);
					}
				}}
				title="Search for more by this artist"
			>
				{(item as any).artist || item.creator || 'Unknown Artist'}
			</button>
		</div>

		<div
			class="card-actions items-center {layout === 'list'
				? 'flex-shrink-0 flex-nowrap'
				: 'justify-between mt-auto -ml-2'}"
		>
			{#if effectiveActionsLayout === 'full'}
				<div on:click|stopPropagation class="{layout === 'list' ? '' : 'order-1'}">
					<DownloadButton
						track={tracks?.[0] || item}
						lazy={!tracks?.length}
						size={compact ? 'xs' : 'sm'}
					/>
				</div>

				<slot name="extra-actions" />

				<button
					class="btn btn-ghost btn-circle {compact ? 'btn-xs' : 'btn-sm'} {layout === 'list'
						? ''
						: 'order-2'}"
					title="Favorite"
					on:click={handleToggleFavorite}
				>
					<Icon
						icon={isFavorite ? 'solar:heart-bold' : 'solar:heart-linear'}
						class={isFavorite ? 'text-error' : ''}
						width="20"
					/>
				</button>

				<button
					class="btn btn-ghost btn-circle {compact ? 'btn-xs' : 'btn-sm'} {layout === 'list'
						? ''
						: 'order-3'}"
					title="Share"
					on:click={handleShare}
				>
					<Icon icon="solar:share-linear" width="20" />
				</button>

				<div class="relative {layout === 'list' ? '' : 'order-4'}">
					<button
						class="btn btn-ghost btn-circle {compact ? 'btn-xs' : 'btn-sm'}"
						title="Add to Playlist"
						on:click|stopPropagation={() => (showPlaylistSelector = !showPlaylistSelector)}
					>
						<Icon icon="solar:list-heart-minimalistic-outline" width="20" />
					</button>
					{#if showPlaylistSelector}
						<div
							id="playlist-selector-{item.identifier}"
							class="absolute bottom-full left-0 mb-2 w-48 bg-base-100 rounded-lg shadow-2xl z-50 border border-base-content/10 max-h-60 overflow-y-auto"
						>
							<h3 class="text-xs font-bold p-2 text-base-content/70">Add to playlist</h3>
							{#each playlists as p}
								<button
									class="w-full text-left px-3 py-2 hover:bg-base-300 text-sm truncate border-b border-base-content/5"
									on:click={(e) => handleAddToPlaylist(e, p.id)}
								>
									{p.name}
								</button>
							{/each}
							<a
								href="{base}/library/playlists"
								class="block px-3 py-2 text-sm text-primary hover:bg-base-300 font-bold"
							>
								+ New Playlist
							</a>
						</div>
					{/if}
				</div>

				<button
					class="btn btn-ghost btn-circle {compact ? 'btn-xs' : 'btn-sm'} {layout === 'list'
						? ''
						: 'order-5'}"
					title="Add to Queue"
					on:click={handleAddToQueue}
				>
					<Icon icon="solar:plaaylist-minimalistic-linear" width="20" />
				</button>

				{#if showRemoveFromQueue}
					<button
						class="btn btn-ghost btn-circle {compact ? 'btn-xs' : 'btn-sm'} {layout === 'list'
							? ''
							: 'order-6'}"
						title="Remove from Queue"
						on:click={handleRemoveFromQueue}
					>
						<Icon icon="solar:close-circle-bold" width="20" />
					</button>
				{/if}
			{:else}
				<div class="relative">
					<button
						bind:this={actionsButton}
						on:click={toggleActions}
						class="btn btn-ghost btn-circle btn-xs"
					>
						<Icon icon="solar:menu-dots-bold" width="20" />
					</button>

					{#if showActions}
						<div
							use:portal
							bind:this={actionsMenu}
							use:clickOutside
							class="fixed z-[99]"
						>
							<ul
								class="menu p-2 shadow-2xl bg-base-300 rounded-box w-56"
							>
								<li>
									<div on:click|stopPropagation class="p-0">
										<DownloadButton
											track={tracks?.[0] || item}
											lazy={!tracks?.length}
											size="sm"
											showLabel={true}
											className="w-full justify-start gap-3 px-4 font-normal normal-case"
										/>
									</div>
								</li>
								<li>
									<a role="button" tabindex="0" on:click={handleToggleFavorite} on:keydown={handleToggleFavorite} class="flex items-center">
										<Icon
											icon={isFavorite ? 'solar:heart-bold' : 'solar:heart-linear'}
											class={isFavorite ? 'text-error' : ''}
											width="20"
										/>
										Favorite
									</a>
								</li>
								<li>
									<a role="button" tabindex="0" on:click={handleShare} on:keydown={handleShare} class="flex items-center">
										<Icon icon="solar:share-linear" width="20" />
										Share
									</a>
								</li>
								<li on:click|stopPropagation={() => (showPlaylistSelector = !showPlaylistSelector)}>
									<a role="button" tabindex="0" class="flex items-center">
										<Icon icon="solar:list-heart-minimalistic-outline" width="20" />
										Add to Playlist
									</a>
								</li>
								<li>
									<a role="button" tabindex="0" on:click={handleAddToQueue} on:keydown={handleAddToQueue} class="flex items-center">
										<Icon icon="solar:plaaylist-minimalistic-linear" width="20" />
										Add to Queue
									</a>
								</li>
								{#if showRemoveFromQueue}
									<li class="border-t border-base-content/10 mt-1 pt-1">
										<a role="button" tabindex="0" on:click={handleRemoveFromQueue} on:keydown={handleRemoveFromQueue} class="flex items-center">
											<Icon icon="solar:close-circle-bold" width="20" />
											Remove from Queue
										</a>
									</li>
								{/if}
							</ul>
						</div>
					{/if}
					
					{#if showPlaylistSelector}
						<div
							id="playlist-selector-{item.identifier}"
							class="absolute bottom-full right-0 mb-2 w-48 bg-base-100 rounded-lg shadow-2xl z-50 border border-base-content/10 max-h-60 overflow-y-auto"
						>
							<h3 class="text-xs font-bold p-2 text-base-content/70">Add to playlist</h3>
							{#each playlists as p}
								<button
									class="w-full text-left px-3 py-2 hover:bg-base-300 text-sm truncate border-b border-base-content/5"
									on:click={(e) => handleAddToPlaylist(e, p.id)}
								>
									{p.name}
								</button>
							{/each}
							<a
								href="{base}/library/playlists"
								class="block px-3 py-2 text-sm text-primary hover:bg-base-300 font-bold"
							>
								+ New Playlist
							</a>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
