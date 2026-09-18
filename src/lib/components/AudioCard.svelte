<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import Icon from '@iconify/svelte';

	// Stores
	import { library } from '$lib/stores/library';
	import { queue } from '$lib/stores/queue';
	import { player } from '$lib/stores/player';
	import { notifications } from '$lib/stores/notifications';
	import {
		unavailableItems,
		isUnplayableItemError,
		isRestrictedItemError
	} from '$lib/stores/unavailable';

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
	import CoverFallback from './CoverFallback.svelte';

	// Types
	import type { ArchiveItem, Track } from '$lib/types';
	import { isFunkwhaleTrack } from '$lib/services/funkwhale';
	import { _ } from '$lib/i18n';

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

	$: displayTitle = (isWD && parsedMeta?.title) || item.title || $_('components.audioCard.untitled');
	$: displayArtist =
		(isWD && parsedMeta?.artist) ||
		item.artist ||
		(item as ArchiveItem).creator ||
		$_('components.audioCard.unknownArtist');
	$: displayAlbum = (isWD && parsedMeta?.album) || item.album || undefined;

	$: thumb = isFW
		? (item.thumbnailUrl || '')
		: isWD
			? parsedMeta?.pictureUrl || fetchedThumb || ''
			: getThumbnailUrl(item.identifier);
	$: sourceName = isFW
		? (item.identifier.split(':')[1] || $_('components.audioCard.sourceFW'))
		: isWD
			? (item.collection?.[0] || $_('components.audioCard.sourceWD'))
			: $_('components.audioCard.sourceIA');

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
				artist: meta?.artist || item.artist || $_('components.audioCard.unknownArtist'),
				album: meta?.album || item.album,
				title: meta?.title || item.title || $_('components.audioCard.untitled')
			};
			const url = await getThumbnailFor(enriched);
			if (lookedUpId !== id) return;
			fetchedThumb = url;
		}
		thumbLookupDone = true;
	}

	/**
	 * Handle a failure from ensureTracks(). An item the archive no longer
	 * serves is a normal outcome, not a bug: its search document outlives it,
	 * so the row looked playable. Remember it so it stops coming back in
	 * results, and say so rather than failing silently.
	 */
	function reportTrackFailure(error: unknown, fallbackKey: string) {
		console.warn('[AudioCard] Failed for', item.identifier, error);
		if (isUnplayableItemError(error)) {
			unavailableItems.mark(item.identifier);
			notifications.error(
				isRestrictedItemError(error) ? 'errors.itemRestricted' : 'errors.itemUnavailable'
			);
		} else {
			notifications.error(fallbackKey);
		}
	}

	async function ensureTracks(): Promise<Track[]> {
		// A seeded track without a streamUrl is display data (a listing row,
		// a batched search hit), not something that can be played, queued or
		// downloaded. Treat it as absent so it gets resolved properly.
		if (tracks.length > 0 && tracks.every((t) => t.streamUrl)) return tracks;
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

		// Normal behavior: replace queue with this track/album.
		// ensureTracks() reaches the network, and the archive regularly
		// returns search rows whose metadata has since been removed. Without
		// this catch the rejection escaped the handler and the play button
		// simply did nothing, with the only trace in the console.
		try {
			const tracksToPlay = await ensureTracks();
			if (tracksToPlay?.length > 0) {
				queue.setQueue(tracksToPlay, 0);
				player.play(tracksToPlay[0]);
			} else {
				notifications.error('errors.tracksFailed');
			}
		} catch (error) {
			reportTrackFailure(error, 'errors.playFailed');
		}
	}

	async function handleAddToQueue(e: Event) {
		e.stopPropagation();
		showActions = false;
		try {
			const tracksToAdd = await ensureTracks();
			if (tracksToAdd?.length > 0) {
				queue.addToEnd(tracksToAdd[0]);
			} else {
				notifications.error('errors.tracksFailed');
			}
		} catch (error) {
			reportTrackFailure(error, 'errors.tracksFailed');
		}
	}

	async function handleShare(e: Event) {
		e.stopPropagation();
		showActions = false;
		const tracksToShare = await ensureTracks().catch(() => []);
		if (!tracksToShare?.[0]) {
			notifications.error('errors.tracksFailed');
			return;
		}
		// Sharing from a card used to give no feedback at all; only the
		// page-level share buttons showed a toast.
		const result = await shareTrack(tracksToShare[0]);
		notifications[result.success ? 'info' : 'error'](result.messageKey);
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

<!-- Tile keeps the card: a cover, a title and actions genuinely are one
     object, and the surface is what separates it from its neighbours in a
     grid. The list row drops it. Fifty stacked boxes are not a hierarchy,
     they are wallpaper; a row separated by a hairline reads as a list, packs
     more of the archive onto the screen, and lets the artwork be the only
     thing carrying colour. The hairline belongs to the container (divide-y),
     not to the row, so that anything the container groups with a row stays
     visually attached to it. -->
<div
	class="transition-colors duration-200 cursor-pointer group"
	class:card={layout === 'tile'}
	class:bg-base-200={layout === 'tile'}
	class:hover:bg-base-300={layout === 'tile'}
	class:h-full={layout === 'tile'}
	class:flex={layout === 'list'}
	class:items-center={layout === 'list'}
	class:gap-3={layout === 'list'}
	class:hover:bg-base-200={layout === 'list'}
	data-row={layout === 'list' ? '' : undefined}
	on:click={handleNavigate}
	on:keydown={handleKeyDown}
	role="button"
	tabindex="0"
	aria-label={$_('components.audioCard.playAria', { values: { title: item.title } })}
>
	<figure
		class="relative bg-neutral overflow-hidden"
		class:aspect-square={layout === 'tile'}
		class:w-14={layout === 'list'}
		class:h-14={layout === 'list'}
		class:rounded={layout === 'list'}
		class:my-2={layout === 'list'}
		class:ml-2={layout === 'list'}
		class:flex-shrink-0={layout === 'list'}
		on:touchstart={startLongPress}
		on:touchend={cancelLongPress}
		on:touchmove={cancelLongPress}
		on:touchcancel={cancelLongPress}
	>
		{#if isWD && !thumb}
			<!-- WebDAV tracks: pulse while the tag read and the Deezer lookup
			     are still out, then settle on the generated tile if neither
			     produced a cover. Gated on `thumb` (not just `fetchedThumb`)
			     so embedded covers from parsedMeta.pictureUrl actually render
			     — gating on fetchedThumb hid them whenever Deezer was skipped. -->
			{#if thumbLookupDone}
				<CoverFallback seed={item.identifier} className="w-full h-full" />
			{:else}
				<div class="w-full h-full bg-base-300 animate-pulse"></div>
			{/if}
		{:else}
			<LoadingImage
				src={thumb}
				alt={$_('components.audioCard.coverAlt', { values: { title: item.title } })}
				className="w-full h-full object-cover"
				aspectRatio="square"
				fallbackSeed={item.identifier}
			/>
		{/if}
		<div
			class="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
		>
			{#if isFetching}
				<span class="loading loading-spinner text-primary"></span>
			{:else}
				<!-- The list row's thumbnail is 56px, so the default 48px
				     circle would all but fill it. -->
				<button
					class="btn btn-primary btn-circle"
					class:btn-sm={compact || layout === 'list'}
					on:click={handlePlay}
					aria-label={$_('components.audioCard.playButtonAria')}
				>
					<Icon icon="solar:play-bold" width={compact || layout === 'list' ? '18' : '28'} />
				</button>
			{/if}
		</div>
	</figure>

	<div
		class="min-w-0 {layout === 'list'
			? 'flex flex-1 flex-row items-center justify-between gap-2 py-2 pr-2'
			: `card-body flex flex-col ${compact ? 'p-2' : 'p-4'}`}"
	>
		<!-- No max-width in list layout: the action cluster beside it is
		     already flex-shrink-0, so capping the title at 60% only left a
		     dead strip and truncated titles that had room to spare. -->
		<div class="flex-grow min-w-0">
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
				title={$_('components.audioCard.searchByArtist')}
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
				title={$_('components.audioCard.favoriteTitle')}
				on:click={handleToggleFavorite}
				aria-label={isFavorite ? $_('player.removeFavorite') : $_('player.addFavorite')}
			>
				<Icon
					icon={isFavorite ? 'solar:heart-bold' : 'solar:heart-linear'}
					class={isFavorite ? 'text-primary' : ''}
					width="20"
				/>
			</button>

			<div class="relative">
				<button
					bind:this={actionsButton}
					on:click={toggleActions}
					class="btn btn-ghost btn-circle {compact ? 'btn-xs' : 'btn-sm'}"
					title={$_('components.audioCard.moreActions')}
					aria-label={$_('components.audioCard.moreActions')}
				>
					<Icon icon="solar:menu-dots-bold" width="20" />
				</button>

				{#if showActions}
						<div
							use:portal
							bind:this={actionsMenu}
							use:clickOutside
							class="fixed z-popover"
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
										{$_('components.audioCard.share')}
									</a>
								</li>
								<li on:click|stopPropagation={() => (showPlaylistSelector = !showPlaylistSelector)}>
									<a role="button" tabindex="0" class="flex items-center">
										<Icon icon="mdi:playlist-plus" width="20" />
										{$_('components.audioCard.addToPlaylist')}
									</a>
								</li>
								<li>
									<a role="button" tabindex="0" on:click={handleAddToQueue} on:keydown={handleAddToQueue} class="flex items-center">
										<Icon icon="mdi:playlist-music" width="20" />
										{$_('components.audioCard.addToQueue')}
									</a>
								</li>
								{#if showRemoveFromQueue}
									<li class="border-t border-base-content/10 mt-1 pt-1">
										<a role="button" tabindex="0" on:click={handleRemoveFromQueue} on:keydown={handleRemoveFromQueue} class="flex items-center">
											<Icon icon="solar:close-circle-bold" width="20" />
											{$_('components.audioCard.removeFromQueue')}
										</a>
									</li>
								{/if}
							</ul>
						</div>
					{/if}

					{#if showPlaylistSelector}
						<div
							id="playlist-selector-{item.identifier}"
							class="absolute bottom-full right-0 mb-2 w-48 bg-base-100 rounded-lg shadow-2xl z-popover border border-base-content/10 max-h-60 overflow-y-auto"
						>
							<h3 class="text-xs font-bold p-2 text-base-content/70">{$_('components.audioCard.addToPlaylistHeader')}</h3>
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
								{$_('components.audioCard.newPlaylist')}
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
