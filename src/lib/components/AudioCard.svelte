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
	import { getAllTracks, getThumbnailUrl } from '$lib/services/internetArchive';
	import { unifiedGetTrack as getTrack } from '$lib/services/sources';
	import { shareTrack } from '$lib/utils/share';
	import { getThumbnailFor } from '$lib/services/thumbnails';
	import { fetchAudioMetadata, type AudioMetadata } from '$lib/services/audioMetadata';
	import { decodeIdentifier as decodeWebDAVIdentifier, findLibrary as findWebDAVLibrary } from '$lib/services/webdavLibrary';
	import { settings } from '$lib/stores/settings';

	// Components
	import DownloadButton from '$lib/components/DownloadButton.svelte';
	import LoadingImage from './LoadingImage.svelte';

	// Types
	import type { ArchiveItem, Track } from '$lib/types';
	import { isFunkwhaleTrack } from '$lib/services/funkwhale';

	// AudioCard accepts either a full Track (FW / WebDAV / loaded IA track)
	// or an ArchiveItem (IA album/listing). ArchiveItem already has an
	// index signature so Track fields like `streamUrl` / `thumbnailUrl` are
	// reachable without casts; we keep one narrow helper to keep TS happy
	// for the optional ones.
	type CardItem = ArchiveItem & Partial<Track>;
	export let item: CardItem;
	export let type: 'album' | 'track' = 'album';
	export let layout: 'tile' | 'list' = 'tile';
	export let compact = false;
	export let showRemoveFromQueue = false;
	export let actionsLayout: 'full' | 'collapsed' | 'auto' = 'auto';
	export let inQueue = false; // When true, clicking plays at queue index instead of replacing queue
	export let queueIndex: number | undefined = undefined; // Index in queue (when inQueue is true)

	const dispatch = createEventDispatcher();

	let isFetching = false;
	let showPlaylistSelector = false;
	let showActions = false;
	let tracks: Track[] = item.tracks || [];
	let actionsButton: HTMLElement;
	let actionsMenu: HTMLElement;
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;

	// `actionsLayout` is preserved as a prop for backwards compat but the
	// inline action row was replaced by a single overflow menu in the
	// rebrand. See README "Change 1".
	let windowWidth = 0;
	$: void actionsLayout;
	$: void windowWidth;

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
		const gap = 4;

		// Position vertically below the button
		const top = btnRect.bottom + window.scrollY + gap;
		actionsMenu.style.top = `${top}px`;

		// Force layout so we get the real width
		const menuWidth = actionsMenu.scrollWidth || actionsMenu.offsetWidth || 224;

		// Always try to right-align (menu's right edge = button's right edge)
		const rightEdge = window.innerWidth - btnRect.right;
		const leftEdge = btnRect.right - menuWidth;

		if (leftEdge >= gap) {
			// Right-aligned fits within viewport
			actionsMenu.style.right = `${rightEdge}px`;
			actionsMenu.style.left = 'auto';
		} else {
			// Doesn't fit right-aligned, pin to left edge of viewport
			actionsMenu.style.left = `${gap}px`;
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

	function startLongPress(event: TouchEvent) {
		cancelLongPress();
		longPressTimer = setTimeout(() => {
			event.preventDefault();
			showActions = true;
			setTimeout(positionActionsMenu, 0);
		}, 500);
	}

	function cancelLongPress() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
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


	$: isFavorite = $library.favorites.some((f) => f.id === item.identifier);
	$: playlists = Object.values($library.playlists).sort((a, b) => b.updated - a.updated);
	$: isFW = isFunkwhaleTrack(item.identifier);
	$: isWD = item.identifier.startsWith('wd:');

	// WebDAV cards display tags read from the file itself (overriding the
	// path-derived heuristics) and the embedded cover art when present.
	let parsedMeta: AudioMetadata | null = null;
	let fetchedThumb: string | null = null;
	let thumbLookupDone = false;
	let lookedUpId: string | null = null;

	$: displayTitle = (isWD && parsedMeta?.title) || item.title || 'Untitled';
	$: displayArtist =
		(isWD && parsedMeta?.artist) ||
		item.artist ||
		(item as ArchiveItem).creator ||
		'Unknown Artist';
	$: displayAlbum = (isWD && parsedMeta?.album) || item.album || undefined;

	$: thumb = isFW
		? (item.thumbnailUrl || '')
		: isWD
			? parsedMeta?.pictureUrl || fetchedThumb || ''
			: getThumbnailUrl(item.identifier);
	$: sourceName = isFW
		? (item.identifier.split(':')[1] || 'FunkWhale')
		: isWD
			? (item.collection?.[0] || 'WebDAV')
			: 'Internet Archive';

	$: if (isWD && item.identifier !== lookedUpId) {
		lookedUpId = item.identifier;
		parsedMeta = null;
		fetchedThumb = null;
		thumbLookupDone = false;
		void loadWebDAVMetadata(item.identifier);
	}

	async function loadWebDAVMetadata(id: string) {
		const decoded = decodeWebDAVIdentifier(id);
		const library = decoded
			? findWebDAVLibrary(settings.getWebDAVLibraries(), decoded.libraryId)
			: undefined;
		if (!decoded || !library) {
			thumbLookupDone = true;
			return;
		}

		// 1. Read embedded ID3/Vorbis/MP4 tags.
		const meta = await fetchAudioMetadata(id, library, decoded.path);
		if (lookedUpId !== id) return;
		parsedMeta = meta;

		// 2. If no embedded picture, fall back to iTunes with whatever the
		// real tags gave us (more accurate than path heuristics).
		if (!meta?.pictureUrl) {
			const enriched: Track = {
				...(item as Track),
				artist: meta?.artist || item.artist || 'Unknown Artist',
				album: meta?.album || item.album,
				title: meta?.title || item.title || 'Untitled'
			};
			const url = await getThumbnailFor(enriched);
			if (lookedUpId !== id) return;
			fetchedThumb = url;
		}
		thumbLookupDone = true;
	}

	async function ensureTracks(): Promise<Track[]> {
		if (tracks.length > 0) return tracks;
		isFetching = true;
		try {
			let fetchedTracks: Track[] = [];
			if (isFW || isWD) {
				// FW & WebDAV tracks already arrive with full data including
				// streamUrl. Re-fetching loses upload data (FW v2) and incurs
				// extra PROPFIND calls (WebDAV).
				if (item.streamUrl) {
					fetchedTracks = [item as Track];
				} else {
					const track = await getTrack(item.identifier);
					if (track) fetchedTracks = [track];
				}
			} else if (type === 'album') {
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

		// If this track is in the queue, jump to it instead of replacing the queue
		if (inQueue && queueIndex !== undefined) {
			const track = queue.playAt(queueIndex);
			if (track) {
				player.play(track);
			}
			return;
		}

		// Normal behavior: replace queue with this track/album
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
		library.toggleFavorite(item.identifier, type === 'album' ? 'album' : 'track');
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
		// IA albums navigate to the album page; everything else (FW, WebDAV,
		// individual tracks) plays directly.
		if (type === 'album' && !isFW && !isWD) {
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
			// Catch-all cleanup for the scroll/resize handlers in case the
			// component unmounts while the overflow menu is still open.
			if (scrollResizeHandler) {
				window.removeEventListener('scroll', scrollResizeHandler, true);
				window.removeEventListener('resize', scrollResizeHandler);
				scrollResizeHandler = null;
			}
		};
	});

	// Track scroll/resize handler for cleanup
	let scrollResizeHandler: (() => void) | null = null;

	// Reposition menu on scroll/resize when open
	$: {
		if (showActions && actionsMenu) {
			scrollResizeHandler = () => positionActionsMenu();
			window.addEventListener('scroll', scrollResizeHandler, true);
			window.addEventListener('resize', scrollResizeHandler);
		} else if (scrollResizeHandler) {
			// Cleanup when showActions becomes false
			window.removeEventListener('scroll', scrollResizeHandler, true);
			window.removeEventListener('resize', scrollResizeHandler);
			scrollResizeHandler = null;
		}
	}
</script>

<svelte:window bind:innerWidth={windowWidth} />

<div
	class="card bg-base-200 hover:bg-base-300 transition-colors duration-200 cursor-pointer group outline-none"
	class:card-side={layout === 'list'}
	class:h-full={layout === 'tile'}
	on:click={handleNavigate}
	on:keydown={handleKeyDown}
	role="button"
	tabindex="0"
	aria-label="Play {item.title}"
>
	<figure
		class="relative bg-neutral overflow-hidden"
		class:aspect-square={layout === 'tile'}
		class:w-20={layout === 'list'}
		class:h-20={layout === 'list'}
		class:flex-shrink-0={layout === 'list'}
		on:touchstart={startLongPress}
		on:touchend={cancelLongPress}
		on:touchmove={cancelLongPress}
		on:touchcancel={cancelLongPress}
	>
		{#if isWD && !fetchedThumb}
			<!-- WebDAV tracks: show music-note placeholder during lookup; if
			     iTunes returns nothing we keep the placeholder permanently
			     instead of an ugly gray pulse. -->
			<div class="w-full h-full bg-base-300 flex items-center justify-center">
				<Icon
					icon="solar:music-note-bold-duotone"
					width="40"
					class="opacity-30 {thumbLookupDone ? '' : 'animate-pulse'}"
				/>
			</div>
		{:else}
			<LoadingImage
				src={thumb}
				alt="Cover for {item.title}"
				className="w-full h-full object-cover"
				aspectRatio="square"
			/>
		{/if}
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
			? 'flex-row items-center justify-between p-3'
			: `flex flex-col ${compact ? 'p-2' : 'p-4'}`}"
	>
		<div class="flex-grow min-w-0 {layout === 'list' ? 'max-w-[60%]' : ''}">
			<h2
				class="card-title {layout === 'list' ? 'truncate' : 'card-title-clamp'} {compact ? 'text-sm' : 'text-base'}"
				title={displayTitle}
			>
				{displayTitle}
			</h2>
			<button
				class="text-sm opacity-70 truncate {compact ? 'text-xs' : 'text-sm'} hover:opacity-100 hover:underline text-left w-full"
				on:click={(e) => {
					e.stopPropagation();
					if (displayArtist && displayArtist !== 'Unknown Artist') {
						goto(`${base}/search?artist=${encodeURIComponent(displayArtist)}`);
					}
				}}
				title="Search for more by this artist"
			>
				{displayArtist}
			</button>
			{#if layout !== 'list' && sourceName && sourceName !== displayArtist}
				<div class="text-xs opacity-50 truncate mt-0.5">{sourceName}</div>
			{/if}
		</div>

		<div
			class="card-actions items-center {layout === 'list'
				? 'flex-shrink-0 flex-nowrap gap-0'
				: 'justify-end mt-auto -mr-1 gap-0'}"
		>
			<slot name="extra-actions" />

			<button
				class="btn btn-ghost btn-circle {compact ? 'btn-xs' : 'btn-sm'}"
				title="Favorite"
				on:click={handleToggleFavorite}
				aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
			>
				<Icon
					icon={isFavorite ? 'solar:heart-bold' : 'solar:heart-linear'}
					class={isFavorite ? 'text-accent' : ''}
					width="20"
				/>
			</button>

			<div class="relative">
				<button
					bind:this={actionsButton}
					on:click={toggleActions}
					class="btn btn-ghost btn-circle {compact ? 'btn-xs' : 'btn-sm'}"
					title="More actions"
					aria-label="More actions"
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
								class="menu p-2 shadow-2xl bg-base-300 rounded-box min-w-[14rem] w-max max-w-xs"
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
									<a role="button" tabindex="0" on:click={handleShare} on:keydown={handleShare} class="flex items-center">
										<Icon icon="solar:share-linear" width="20" />
										Share
									</a>
								</li>
								<li on:click|stopPropagation={() => (showPlaylistSelector = !showPlaylistSelector)}>
									<a role="button" tabindex="0" class="flex items-center">
										<Icon icon="mdi:playlist-plus" width="20" />
										Add to Playlist
									</a>
								</li>
								<li>
									<a role="button" tabindex="0" on:click={handleAddToQueue} on:keydown={handleAddToQueue} class="flex items-center">
										<Icon icon="mdi:playlist-music" width="20" />
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
		</div>
	</div>
</div>

<style>
	/* Reserve consistent space for 2-line titles (Change 2): prevents grid jitter
	   when some titles are short and others wrap. */
	.card-title-clamp {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-overflow: ellipsis;
		word-break: break-word;
		min-height: calc(2 * 1.25em);
		line-height: 1.25;
	}
</style>
