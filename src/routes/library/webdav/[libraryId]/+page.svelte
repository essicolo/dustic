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
		type WebDAVEntry
	} from '$lib/services/webdavLibrary';
	import { player } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import Icon from '$lib/components/Icon.svelte';
	import AudioCard from '$lib/components/AudioCard.svelte';

	let libraryId = '';
	let path = '';
	let library: WebDAVLibrary | undefined;
	let entries: WebDAVEntry[] = [];
	let loading = true;
	let error = '';
	let viewMode: 'tiles' | 'list' = 'tiles';

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
		library = findLibrary(settings.getWebDAVLibraries(), id);
		if (!library) {
			error = 'Library not found';
			loading = false;
			return;
		}
		try {
			entries = await listFolder(library, currentPath);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load folder';
		} finally {
			loading = false;
		}
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

	function pathSegments(): { label: string; href: string }[] {
		const out: { label: string; href: string }[] = [];
		const parts = path.split('/').filter(Boolean);
		let acc = '';
		for (const p of parts) {
			acc += '/' + p;
			out.push({
				label: p,
				href: `${base}/library/webdav/${libraryId}?p=${encodeURIComponent(acc)}`
			});
		}
		return out;
	}

	function fmtSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}
</script>

<svelte:head>
	<title>{library?.name || 'Library'} — Dustic</title>
</svelte:head>

<div class="container mx-auto max-w-6xl p-4">
	<!-- Breadcrumbs + view toggle -->
	<div class="mb-4 flex items-center gap-2 flex-wrap">
		<a href="{base}/library/webdav" class="btn btn-ghost btn-sm">
			<Icon icon="mdi:arrow-left" width="20" />
		</a>
		<a href="{base}/library/webdav/{libraryId}?p=/" class="font-semibold hover:underline">
			{library?.name || 'Library'}
		</a>
		{#each pathSegments() as seg}
			<span class="opacity-50">/</span>
			<a href={seg.href} class="hover:underline">{seg.label}</a>
		{/each}

		<div class="ml-auto btn-group" role="group" aria-label="View mode">
			<button
				on:click={() => (viewMode = 'tiles')}
				class="btn btn-sm btn-ghost {viewMode === 'tiles' ? 'btn-active' : ''}"
				title="Tiles view"
			>
				<Icon icon="mdi:view-grid" width="18" />
			</button>
			<button
				on:click={() => (viewMode = 'list')}
				class="btn btn-sm btn-ghost {viewMode === 'list' ? 'btn-active' : ''}"
				title="List view"
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
		{#if files.length > 0}
			<div class="mb-4">
				<button class="btn btn-primary btn-sm" on:click={playAll}>
					<Icon icon="mdi:play" width="18" />
					Play all ({files.length})
				</button>
			</div>
		{/if}

		{#if viewMode === 'tiles'}
			<!-- Folders row (always list-style) -->
			{#if folders.length > 0 || path !== '/' && path !== ''}
				<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-6">
					{#if path !== '/' && path !== ''}
						<button
							class="card bg-base-200 hover:bg-base-300 aspect-square flex flex-col items-center justify-center gap-2 p-3 transition-colors"
							on:click={navigateUp}
						>
							<Icon icon="mdi:folder-arrow-up" width="40" class="opacity-60" />
							<div class="text-sm opacity-70">..</div>
						</button>
					{/if}
					{#each folders as folder (folder.path)}
						<button
							class="card bg-base-200 hover:bg-base-300 aspect-square flex flex-col items-center justify-center gap-2 p-3 transition-colors text-center"
							on:click={() => navigateInto(folder)}
						>
							<Icon icon="mdi:folder" width="40" />
							<div class="text-sm font-medium line-clamp-2 leading-tight w-full">
								{folder.name}
							</div>
						</button>
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
				<div class="text-center opacity-60 p-12">Empty folder</div>
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
					<li>
						<button class="w-full text-left p-3 hover:bg-base-200 flex items-center gap-3" on:click={() => navigateInto(folder)}>
							<Icon icon="mdi:folder" width="22" />
							<span class="flex-1 truncate">{folder.name}</span>
							<Icon icon="mdi:chevron-right" width="18" />
						</button>
					</li>
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
					<li class="p-6 text-center opacity-60">Empty folder</li>
				{/if}
			</ul>
		{/if}
	{/if}
</div>
