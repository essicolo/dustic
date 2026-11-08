<script lang="ts">
	// A WebDAV folder shown like a track card: hover-to-play, a direct
	// offline-download button, and an overflow menu (play, shuffle, queue,
	// offline). Actions apply to the folder and everything below it.
	import { createEventDispatcher } from 'svelte';
	import type { Track, WebDAVLibrary } from '$lib/types';
	import {
		buildTrack,
		listAudioFilesRecursive,
		isPathInside,
		decodeIdentifier,
		encodeIdentifier,
		toRelativePath,
		type WebDAVEntry
	} from '$lib/services/webdavLibrary';
	import { offline, folderId } from '$lib/stores/offline';
	import { player } from '$lib/stores/player';
	import { library as libraryStore } from '$lib/stores/library';
	import { queue } from '$lib/stores/queue';
	import { notifications } from '$lib/stores/notifications';
	import Icon from '$lib/components/Icon.svelte';
	import { _ } from '$lib/i18n';

	export let library: WebDAVLibrary;
	export let folder: WebDAVEntry;
	export let layout: 'tile' | 'list' = 'tile';

	const dispatch = createEventDispatcher<{ open: WebDAVEntry }>();

	let showMenu = false;
	let menuButton: HTMLButtonElement;
	let menuEl: HTMLDivElement;
	let busy = false; // resolving tracks for play/queue

	$: id = folderId(library.id, folder.path);
	$: favId = encodeIdentifier(library.id, folder.path);
	$: isFavorite = $libraryStore.favoriteFolders.some((f) => f.id === favId);

	function toggleFavorite(event?: Event) {
		event?.stopPropagation();
		showMenu = false;
		libraryStore.toggleFavoriteFolder({
			id: favId,
			libraryId: library.id,
			path: folder.path,
			name: folder.name
		});
	}
	$: pinned = $offline.folders.some((f) => f.id === id);
	$: coveredByParent =
		!pinned &&
		$offline.folders.some(
			(f) => f.libraryId === library.id && f.id !== id && isPathInside(folder.path, f.path)
		);
	$: job = $offline.folderJobs.get(id);
	$: syncing = job?.phase === 'listing' || job?.phase === 'downloading';
	$: progressPct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
	$: offlineCount = $offline.offlineTracks.filter((ot) => {
		const d = decodeIdentifier(ot.track.identifier);
		return d?.libraryId === library.id && isPathInside(d.path, folder.path);
	}).length;

	/** Every audio file under the folder; falls back to downloads when the server is unreachable. */
	async function resolveTracks(): Promise<Track[]> {
		try {
			const { files } = await listAudioFilesRecursive(library, toRelativePath(library, folder.path));
			return files.map((f) => buildTrack(library, f));
		} catch {
			return $offline.offlineTracks
				.map((ot) => ot.track)
				.filter((t) => {
					const d = decodeIdentifier(t.identifier);
					return d?.libraryId === library.id && isPathInside(d.path, folder.path);
				})
				.sort((a, b) => (a.identifier < b.identifier ? -1 : 1));
		}
	}

	async function withTracks(fn: (tracks: Track[]) => void) {
		if (busy) return;
		busy = true;
		showMenu = false;
		try {
			const tracks = await resolveTracks();
			if (tracks.length === 0) {
				notifications.info('webdav.folderCard.noAudio');
				return;
			}
			fn(tracks);
		} finally {
			busy = false;
		}
	}

	function playTracks(tracks: Track[]) {
		queue.clear();
		queue.addToEnd(tracks);
		const first = queue.next() || queue.getCurrentTrack();
		if (first) player.playNow(first, false);
	}

	function play(event?: Event) {
		event?.stopPropagation();
		player.unlockIOSAudio?.();
		void withTracks(playTracks);
	}

	function shufflePlay() {
		player.unlockIOSAudio?.();
		void withTracks((tracks) => {
			const shuffled = [...tracks];
			for (let i = shuffled.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
			}
			playTracks(shuffled);
		});
	}

	function addToQueue() {
		void withTracks((tracks) => {
			queue.addToEnd(tracks);
			notifications.info('webdav.folderCard.queued', { count: tracks.length });
		});
	}

	function keepOffline(event?: Event) {
		event?.stopPropagation();
		showMenu = false;
		void offline.syncFolder(library.id, folder.path, folder.name);
	}

	async function removeOffline() {
		showMenu = false;
		if (!confirm($_('settings.offline.removeFolderConfirm', { values: { name: folder.name } }))) return;
		await offline.removeFolder(id, true);
	}

	function open() {
		dispatch('open', folder);
	}

	function onKey(e: KeyboardEvent) {
		if (e.target !== e.currentTarget) return;
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			open();
		}
	}

	// --- overflow menu (portalled so card overflow can't clip it) ---
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}

	function position() {
		if (!menuButton || !menuEl) return;
		const r = menuButton.getBoundingClientRect();
		const w = menuEl.offsetWidth || 224;
		menuEl.style.top = `${r.bottom + 4}px`;
		menuEl.style.left = `${Math.max(4, Math.min(r.right - w, window.innerWidth - w - 4))}px`;
	}

	function toggleMenu(e: MouseEvent) {
		e.stopPropagation();
		showMenu = !showMenu;
		if (showMenu) setTimeout(position, 0);
	}

	function outside(node: HTMLElement) {
		const onClick = (e: MouseEvent) => {
			if (!node.contains(e.target as Node) && !menuButton?.contains(e.target as Node)) showMenu = false;
		};
		const close = () => (showMenu = false);
		document.addEventListener('click', onClick, true);
		window.addEventListener('scroll', close, true);
		window.addEventListener('resize', close);
		return {
			destroy() {
				document.removeEventListener('click', onClick, true);
				window.removeEventListener('scroll', close, true);
				window.removeEventListener('resize', close);
			}
		};
	}
</script>

<div
	class="group cursor-pointer transition-colors {layout === 'tile'
		? 'card bg-base-200 hover:bg-base-300 h-full'
		: 'flex items-center gap-3 hover:bg-base-200'}"
	data-testid="folder-card"
	on:click={open}
	on:keydown={onKey}
	role="button"
	tabindex="0"
	aria-label={folder.name}
>
	<figure
		class="relative bg-base-300 flex items-center justify-center {layout === 'tile'
			? 'aspect-square'
			: 'w-14 h-14 rounded my-2 ml-2 flex-shrink-0'}"
	>
		<Icon icon="mdi:folder" width={layout === 'tile' ? '64' : '28'} className="opacity-70" />
		{#if pinned || coveredByParent}
			<span
				class="absolute {layout === 'tile' ? 'top-2 left-2' : 'top-0.5 left-0.5'}"
				title={$_('webdav.offline.pinned')}
			>
				<Icon icon="solar:check-circle-bold" width={layout === 'tile' ? '20' : '14'} className="text-success" />
			</span>
		{/if}
		<div
			class="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
		>
			{#if busy}
				<span class="loading loading-spinner text-primary"></span>
			{:else}
				<button
					class="btn btn-primary btn-circle"
					class:btn-sm={layout === 'list'}
					on:click={play}
					aria-label={$_('webdav.folderCard.play')}
				>
					<Icon icon="solar:play-bold" width={layout === 'list' ? '18' : '28'} />
				</button>
			{/if}
		</div>
	</figure>

	<div class={layout === 'tile' ? 'card-body p-3 gap-1' : 'min-w-0 flex-1 py-2'}>
		<h3 class="font-medium leading-tight {layout === 'tile' ? 'line-clamp-2 text-sm' : 'truncate'}">
			{folder.name}
		</h3>
		{#if syncing && job}
			<div class="text-xs text-base-content/60">
				{#if job.phase === 'listing'}
					{$_('webdav.offline.listing')}
				{:else}
					{$_('webdav.offline.progress', { values: { done: job.done, total: job.total } })}
				{/if}
			</div>
		{:else if offlineCount > 0}
			<div class="text-xs text-base-content/60">
				{$_('webdav.folderCard.offlineCount', { values: { count: offlineCount } })}
			</div>
		{/if}
		{#if job?.phase === 'done' && job.failed > 0}
			<div class="text-xs text-warning">{$_('webdav.offline.doneWithErrors', { values: { failed: job.failed } })}</div>
		{:else if job?.phase === 'error'}
			<div class="text-xs text-error">{$_('webdav.offline.error')}</div>
		{/if}
	</div>

	<div
		class="card-actions items-center gap-0 {layout === 'tile'
			? 'justify-end mt-auto px-2 pb-2 -mt-2'
			: 'flex-shrink-0 flex-nowrap pr-1'}"
	>
		<button
			class="btn btn-ghost btn-circle btn-sm"
			title={$_('components.audioCard.favoriteTitle')}
			aria-label={isFavorite ? $_('player.removeFavorite') : $_('player.addFavorite')}
			data-testid="folder-favorite"
			on:click={toggleFavorite}
		>
			<Icon
				icon={isFavorite ? 'solar:heart-bold' : 'solar:heart-linear'}
				width="18"
				className={isFavorite ? 'text-primary' : ''}
			/>
		</button>

		<!-- Direct offline toggle, like the per-track download button -->
		{#if syncing}
			<button class="btn btn-ghost btn-circle btn-sm" disabled title={$_('webdav.offline.listing')}>
				{#if job?.phase === 'downloading'}
					<div class="radial-progress text-xs" style="--value:{progressPct}; --size:1.5rem; --thickness: 2px;">
						<Icon icon="solar:download-minimalistic-linear" width="14" />
					</div>
				{:else}
					<span class="loading loading-spinner loading-xs"></span>
				{/if}
			</button>
		{:else if pinned || coveredByParent}
			<button
				class="btn btn-ghost btn-circle btn-sm"
				title={$_('webdav.offline.pinned')}
				aria-label={$_('webdav.offline.pinned')}
				on:click|stopPropagation={toggleMenu}
			>
				<Icon icon="solar:check-circle-bold" width="18" className="text-success" />
			</button>
		{:else}
			<button
				class="btn btn-ghost btn-circle btn-sm"
				title={$_('webdav.offline.keepFolder')}
				aria-label={$_('webdav.offline.keepFolder')}
				data-testid="folder-keep-offline"
				on:click={keepOffline}
			>
				<Icon icon="solar:download-minimalistic-linear" width="18" />
			</button>
		{/if}

		<button
			bind:this={menuButton}
			class="btn btn-ghost btn-circle btn-sm"
			title={$_('components.audioCard.moreActions')}
			aria-label={$_('components.audioCard.moreActions')}
			data-testid="folder-menu"
			on:click={toggleMenu}
		>
			<Icon icon="solar:menu-dots-bold" width="20" />
		</button>
	</div>
</div>

{#if showMenu}
	<div use:portal use:outside bind:this={menuEl} class="fixed z-popover">
		<ul class="menu p-2 shadow-2xl bg-base-300 rounded-box min-w-[14rem] w-max max-w-xs">
			<li>
				<button type="button" on:click={() => play()}>
					<Icon icon="solar:play-linear" width="20" />
					{$_('webdav.folderCard.play')}
				</button>
			</li>
			<li>
				<button type="button" on:click={shufflePlay}>
					<Icon icon="solar:shuffle-linear" width="20" />
					{$_('webdav.folderCard.shuffle')}
				</button>
			</li>
			<li>
				<button type="button" on:click={addToQueue}>
					<Icon icon="mdi:playlist-plus" width="20" />
					{$_('components.audioCard.addToQueue')}
				</button>
			</li>
			<li>
				<button type="button" on:click={() => toggleFavorite()}>
					<Icon icon={isFavorite ? 'solar:heart-bold' : 'solar:heart-linear'} width="20" />
					{isFavorite ? $_('player.removeFavorite') : $_('player.addFavorite')}
				</button>
			</li>
			<li class="menu-title pt-2 pb-0">{$_('settings.offline.title')}</li>
			{#if pinned}
				<li>
					<button type="button" on:click={() => keepOffline()} disabled={syncing}>
						<Icon icon="mdi:sync" width="20" />
						{$_('settings.offline.sync')}
					</button>
				</li>
				<li>
					<button type="button" class="text-error" on:click={removeOffline}>
						<Icon icon="solar:trash-bin-trash-linear" width="20" />
						{$_('settings.offline.removeFolder')}
					</button>
				</li>
			{:else if coveredByParent}
				<li class="disabled"><span>{$_('webdav.offline.coveredByParent')}</span></li>
			{:else}
				<li>
					<button type="button" on:click={() => keepOffline()} disabled={syncing} data-testid="folder-menu-keep-offline">
						<Icon icon="solar:download-minimalistic-linear" width="20" />
						{$_('webdav.offline.keepFolder')}
					</button>
				</li>
			{/if}
		</ul>
	</div>
{/if}
