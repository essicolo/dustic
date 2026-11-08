<script lang="ts">
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { settings } from '$lib/stores/settings';
	import type { Track, WebDAVLibrary } from '$lib/types';
	import {
		listFolder,
		buildTrack,
		findLibrary,
		toAbsolutePath,
		entriesFromOffline,
		type WebDAVEntry
	} from '$lib/services/webdavLibrary';
	import { offline, folderId } from '$lib/stores/offline';
	import { player } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import Icon from '$lib/components/Icon.svelte';
	import AudioCard from '$lib/components/AudioCard.svelte';
	import FolderCard from '$lib/components/FolderCard.svelte';
	import { _ } from '$lib/i18n';

	let libraryId = '';
	let path = '';
	let library: WebDAVLibrary | undefined;
	let entries: WebDAVEntry[] = [];
	let loading = true;
	let error = '';
	let viewMode: 'tiles' | 'list' = 'tiles';
	/** True when the listing was rebuilt from downloads (server unreachable). */
	let showingOffline = false;

	$: libraryId = $page.params.libraryId ?? '';
	$: path = (($page.url.searchParams.get('p') || '/')).replace(/\/+$/, '') || '/';

	$: if (libraryId) {
		void load(libraryId, path);
	}

	$: folders = entries.filter((e) => e.type === 'folder');
	$: files = entries.filter((e) => e.type === 'file');
	$: tracks = library ? files.map((e) => buildTrack(library!, e)) : [];

	async function load(id: string, currentPath: string) {
		loading = true;
		error = '';
		entries = [];
		showingOffline = false;
		library = findLibrary(settings.getWebDAVLibraries(), id);
		if (!library) {
			error = $_('webdav.libraryNotFound');
			loading = false;
			return;
		}
		try {
			entries = await listFolder(library, currentPath);
		} catch (err) {
			// Server unreachable (offline, plane mode…): fall back to what has
			// been downloaded so offline folders stay browsable and playable.
			if ($offline.offlineTracks.length === 0) await offline.loadOfflineTracks();
			const local = entriesFromOffline(
				$offline.offlineTracks,
				id,
				toAbsolutePath(library, currentPath)
			);
			if (local.length > 0) {
				entries = local;
				showingOffline = true;
			} else {
				error = err instanceof Error ? err.message : $_('webdav.loadError');
			}
		} finally {
			loading = false;
		}
	}

	// Offline-folder state for the folder being displayed.
	$: currentAbs = library ? toAbsolutePath(library, path) : '';
	$: currentFolderId = library ? folderId(library.id, currentAbs) : '';
	$: currentPinned = $offline.folders.some((f) => f.id === currentFolderId);
	$: currentJob = currentFolderId ? $offline.folderJobs.get(currentFolderId) : undefined;
	$: currentBusy = currentJob?.phase === 'listing' || currentJob?.phase === 'downloading';
	// A parent folder pinned offline already covers this one.
	$: coveredByParent = !!library && $offline.folders.some(
		(f) => f.libraryId === library!.id && f.id !== currentFolderId &&
			(f.path === '/' || currentAbs.startsWith(f.path + '/'))
	);


	function keepOffline(absPath: string, name: string) {
		if (!library) return;
		void offline.syncFolder(library.id, absPath, name);
	}

	function keepCurrentOffline() {
		if (!library) return;
		const name = path === '/' || !path ? library.name : path.split('/').filter(Boolean).pop() || library.name;
		keepOffline(currentAbs, name);
	}

	async function removeCurrentOffline() {
		if (!confirm($_('settings.offline.removeFolderConfirm', { values: { name: path.split('/').filter(Boolean).pop() || library?.name || '' } }))) return;
		await offline.removeFolder(currentFolderId, true);
	}

	function navigateInto(folder: WebDAVEntry) {
		const rel = relativePath(folder.path);
		const url = new URL($page.url);
		url.searchParams.set('p', rel);
		goto(url.toString(), { keepFocus: true });
	}

	function navigateUp() {
		if (path === '/' || !path) return;
		const parts = path.split('/').filter(Boolean);
		parts.pop();
		const parent = '/' + parts.join('/');
		const url = new URL($page.url);
		url.searchParams.set('p', parent || '/');
		goto(url.toString(), { keepFocus: true });
	}

	/** Back button: go up one folder if possible, else back to Library hub. */
	function goBack() {
		if (path && path !== '/') navigateUp();
		else goto(`${base}/library`);
	}

	function relativePath(absPath: string): string {
		const root = (library?.rootPath || '/').replace(/\/+$/, '') || '/';
		if (root === '/') return absPath;
		if (absPath.startsWith(root)) return absPath.slice(root.length) || '/';
		return absPath;
	}

	function playAll() {
		if (tracks.length === 0) return;
		queue.clear();
		tracks.forEach((t) => queue.addToEnd(t));
		const first = queue.next() || queue.getCurrentTrack();
		if (first) {
			player.unlockIOSAudio?.();
			player.playNow(first, false);
		}
	}

	$: pathParts = path.split('/').filter(Boolean);
	$: segments = pathParts.map((label, i) => {
		const acc = '/' + pathParts.slice(0, i + 1).join('/');
		return {
			label,
			href: `${base}/library/webdav/${libraryId}?p=${encodeURIComponent(acc)}`
		};
	});

	function fmtSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}
</script>

<svelte:head>
	<title>{library?.name || $_('webdav.libraryFallback')} — dustic</title>
</svelte:head>

<div class="container mx-auto max-w-6xl p-4">
	<!-- Breadcrumbs + view toggle -->
	<div class="mb-4 flex items-center gap-2 flex-wrap">
		<button
			class="btn btn-ghost btn-sm"
			on:click={goBack}
			aria-label={$_('common.back')}
			title={path === '/' || !path ? $_('webdav.backToLibrary') : $_('webdav.upOneFolder')}
		>
			<Icon icon="mdi:arrow-left" width="20" />
		</button>
		<a href="{base}/library/webdav/{libraryId}?p=/" class="font-semibold hover:underline">
			{library?.name || $_('webdav.libraryFallback')}
		</a>
		{#each segments as seg}
			<span class="opacity-50">/</span>
			<a href={seg.href} class="hover:underline">{seg.label}</a>
		{/each}

		<div class="ml-auto btn-group" role="group" aria-label={$_('viewMode.label')}>
			<button
				on:click={() => (viewMode = 'tiles')}
				class="btn btn-sm btn-ghost {viewMode === 'tiles' ? 'btn-active' : ''}"
				title={$_('viewMode.tiles')}
			>
				<Icon icon="mdi:view-grid" width="18" />
			</button>
			<button
				on:click={() => (viewMode = 'list')}
				class="btn btn-sm btn-ghost {viewMode === 'list' ? 'btn-active' : ''}"
				title={$_('viewMode.list')}
			>
				<Icon icon="mdi:view-list" width="18" />
			</button>
		</div>
	</div>

	{#if loading}
		<div class="text-center p-6"><span class="loading loading-spinner"></span></div>
	{:else if error}
		<div class="alert alert-error">{error}</div>
	{:else}
		{#if showingOffline}
			<div class="alert alert-warning mb-4 text-sm">
				<Icon icon="mdi:cloud-off-outline" width="20" />
				<span>{$_('webdav.offline.showingDownloaded')}</span>
			</div>
		{/if}

		<div class="mb-4 flex flex-wrap items-center gap-2">
			{#if files.length > 0}
				<button class="btn btn-primary btn-sm" on:click={playAll}>
					<Icon icon="mdi:play" width="18" />
					{$_('common.playAllCount', { values: { count: files.length } })}
				</button>
			{/if}

			{#if !showingOffline && (files.length > 0 || folders.length > 0)}
				{#if currentBusy && currentJob}
					<button class="btn btn-sm btn-ghost gap-2" disabled>
						<span class="loading loading-spinner loading-xs"></span>
						{#if currentJob.phase === 'listing'}
							{$_('webdav.offline.listing')}
						{:else}
							{$_('webdav.offline.progress', { values: { done: currentJob.done, total: currentJob.total } })}
						{/if}
					</button>
				{:else if currentPinned}
					<span class="badge badge-success gap-1 h-8 px-3">
						<Icon icon="solar:check-circle-bold" width="14" />
						{$_('webdav.offline.pinned')}
					</span>
					<button class="btn btn-sm btn-ghost gap-1" on:click={keepCurrentOffline} title={$_('settings.offline.sync')}>
						<Icon icon="mdi:sync" width="16" />
						{$_('settings.offline.sync')}
					</button>
					<button class="btn btn-sm btn-ghost gap-1 text-error" on:click={removeCurrentOffline}>
						<Icon icon="solar:trash-bin-trash-linear" width="16" />
						{$_('settings.offline.removeFolder')}
					</button>
				{:else if coveredByParent}
					<span class="badge badge-ghost gap-1 h-8 px-3">
						<Icon icon="solar:check-circle-linear" width="14" />
						{$_('webdav.offline.coveredByParent')}
					</span>
				{:else}
					<button class="btn btn-sm btn-outline gap-2" on:click={keepCurrentOffline} data-testid="webdav-keep-offline">
						<Icon icon="mdi:folder-download" width="18" />
						{$_('webdav.offline.keepFolder')}
					</button>
				{/if}
				{#if currentJob?.phase === 'done' && currentJob.failed > 0}
					<span class="text-xs text-warning">{$_('webdav.offline.doneWithErrors', { values: { failed: currentJob.failed } })}</span>
				{:else if currentJob?.phase === 'error'}
					<span class="text-xs text-error">{$_('webdav.offline.error')}</span>
				{/if}
			{/if}
		</div>

		{#if viewMode === 'tiles'}
			<!-- Folders row (always list-style) -->
			{#if folders.length > 0 || path !== '/' && path !== ''}
				<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-6">
					{#if path !== '/' && path !== ''}
						<button
							class="card bg-base-200 hover:bg-base-300 h-full min-h-32 flex flex-col items-center justify-center gap-2 p-3 transition-colors"
							on:click={navigateUp}
						>
							<Icon icon="mdi:folder-arrow-up" width="40" class="opacity-60" />
							<div class="text-sm opacity-70">..</div>
						</button>
					{/if}
					{#each folders as folder (folder.path)}
						{#if library}
							<FolderCard {library} {folder} layout="tile" on:open={() => navigateInto(folder)} />
						{/if}
					{/each}
				</div>
			{/if}

			<!-- Tracks tile grid -->
			{#if tracks.length > 0}
				<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
					{#each tracks as track (track.identifier)}
						<AudioCard
							item={{ ...track, tracks: [track] } as any}
							type="track"
							layout="tile"
						/>
					{/each}
				</div>
			{/if}

			{#if folders.length === 0 && tracks.length === 0 && (path === '/' || !path)}
				<div class="text-center opacity-60 p-12">{$_('webdav.emptyFolder')}</div>
			{/if}
		{:else}
			<!-- List view -->
			<ul class="divide-y divide-base-300">
				{#if path !== '/' && path !== ''}
					<li>
						<button class="w-full text-left p-3 hover:bg-base-200 flex items-center gap-3" on:click={navigateUp}>
							<Icon icon="mdi:arrow-up" width="20" />
							<span class="opacity-70">..</span>
						</button>
					</li>
				{/if}
				{#each folders as folder (folder.path)}
					{#if library}
						<li class="p-1">
							<FolderCard {library} {folder} layout="list" on:open={() => navigateInto(folder)} />
						</li>
					{/if}
				{/each}
				{#each tracks as track, i (track.identifier)}
					<li class="p-1">
						<AudioCard
							item={{ ...track, tracks: [track] } as any}
							type="track"
							layout="list"
						/>
					</li>
				{/each}
				{#if folders.length === 0 && tracks.length === 0}
					<li class="p-6 text-center opacity-60">{$_('webdav.emptyFolder')}</li>
				{/if}
			</ul>
		{/if}
	{/if}
</div>
