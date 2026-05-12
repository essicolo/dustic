<script lang="ts">
	import { onMount } from 'svelte';
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
	import DownloadButton from '$lib/components/DownloadButton.svelte';

	let libraryId = '';
	let path = '';
	let library: WebDAVLibrary | undefined;
	let entries: WebDAVEntry[] = [];
	let loading = true;
	let error = '';

	$: libraryId = $page.params.libraryId ?? '';
	$: path = (($page.url.searchParams.get('p') || '/')).replace(/\/+$/, '') || '/';

	$: if (libraryId) {
		void load(libraryId, path);
	}

	async function load(id: string, currentPath: string) {
		loading = true;
		error = '';
		entries = [];
		library = findLibrary(settings.getWebDAVLibraries(), id);
		if (!library) {
			error = 'Bibliothèque introuvable';
			loading = false;
			return;
		}
		try {
			entries = await listFolder(library, currentPath);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erreur de chargement';
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
		// Strip the library rootPath prefix; we navigate by relative path
		const root = (library?.rootPath || '/').replace(/\/+$/, '') || '/';
		if (root === '/') return absPath;
		if (absPath.startsWith(root)) return absPath.slice(root.length) || '/';
		return absPath;
	}

	function buildTracksList(): Track[] {
		if (!library) return [];
		return entries.filter((e) => e.type === 'file').map((e) => buildTrack(library!, e));
	}

	async function playFile(entry: WebDAVEntry) {
		if (!library) return;
		const tracks = buildTracksList();
		const idx = tracks.findIndex((t) => t.identifier.endsWith(encodeURIComponentSafe(entry.path)));
		// Replace queue with this folder; play the chosen track
		queue.clear();
		tracks.forEach((t) => queue.addToEnd(t));
		const startTrack = tracks.find((t) => t.metadata.webdavPath === entry.path);
		if (startTrack) {
			player.unlockIOSAudio?.();
			player.playNow(startTrack, false);
			// Advance queue cursor to the chosen track
			while (queue.getCurrentTrack()?.identifier !== startTrack.identifier && queue.next()) {}
		}
		// `idx` referenced to silence unused warning
		void idx;
	}

	function encodeURIComponentSafe(s: string): string {
		try {
			return encodeURIComponent(s);
		} catch {
			return s;
		}
	}

	function playAll() {
		const tracks = buildTracksList();
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
</script>

<svelte:head>
	<title>{library?.name || 'Bibliothèque'} — Inde</title>
</svelte:head>

<div class="container mx-auto max-w-4xl p-4">
	<div class="mb-4 flex items-center gap-2 flex-wrap">
		<a href="{base}/library/webdav" class="btn btn-ghost btn-sm">
			<Icon icon="mdi:arrow-left" width="20" />
		</a>
		<a href="{base}/library/webdav/{libraryId}?p=/" class="font-semibold hover:underline">
			{library?.name || 'Bibliothèque'}
		</a>
		{#each pathSegments() as seg}
			<span class="opacity-50">/</span>
			<a href={seg.href} class="hover:underline">{seg.label}</a>
		{/each}
	</div>

	{#if loading}
		<div class="text-center p-6"><span class="loading loading-spinner"></span></div>
	{:else if error}
		<div class="alert alert-error">{error}</div>
	{:else}
		{#if entries.some((e) => e.type === 'file')}
			<div class="mb-3">
				<button class="btn btn-primary btn-sm" on:click={playAll}>
					<Icon icon="mdi:play" width="18" />
					Tout lire ({entries.filter((e) => e.type === 'file').length})
				</button>
			</div>
		{/if}

		<ul class="divide-y divide-base-300">
			{#if path !== '/' && path !== ''}
				<li>
					<button class="w-full text-left p-3 hover:bg-base-200 flex items-center gap-3" on:click={navigateUp}>
						<Icon icon="mdi:arrow-up" width="20" />
						<span class="opacity-70">..</span>
					</button>
				</li>
			{/if}
			{#each entries as entry (entry.path)}
				{#if entry.type === 'folder'}
					<li>
						<button class="w-full text-left p-3 hover:bg-base-200 flex items-center gap-3" on:click={() => navigateInto(entry)}>
							<Icon icon="mdi:folder" width="22" />
							<span class="flex-1 truncate">{entry.name}</span>
							<Icon icon="mdi:chevron-right" width="18" />
						</button>
					</li>
				{:else}
					<li class="p-3 flex items-center gap-3 hover:bg-base-200">
						<button class="btn btn-ghost btn-sm btn-circle" on:click={() => playFile(entry)} title="Lire">
							<Icon icon="mdi:play" width="18" />
						</button>
						<div class="flex-1 min-w-0">
							<div class="truncate">{entry.name}</div>
							{#if entry.size}
								<div class="text-xs opacity-50">{(entry.size / 1024 / 1024).toFixed(1)} MB</div>
							{/if}
						</div>
						{#if library}
							<DownloadButton track={buildTrack(library, entry)} />
						{/if}
					</li>
				{/if}
			{:else}
				<li class="p-6 text-center opacity-60">Dossier vide</li>
			{/each}
		</ul>
	{/if}
</div>
