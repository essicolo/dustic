<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { library } from '$lib/stores/library';
	import { settings } from '$lib/stores/settings';
	import {
		offline,
		offlineBreakdown,
		isInOfflineFolder,
		type OfflineFolder,
		type SourceKey
	} from '$lib/stores/offline';
	import { formatBytes, type OfflineTrack } from '$lib/services/offlineStorage';
	import { findOrphanedTracks } from '$lib/services/orphanDetection';
	import { decodeIdentifier, isPathInside, toRelativePath } from '$lib/services/webdavLibrary';
	import Icon from '$lib/components/Icon.svelte';
	import { _ } from '$lib/i18n';

	const SOURCES: { key: SourceKey; icon: string }[] = [
		{ key: 'ia', icon: 'mdi:bank' },
		{ key: 'funkwhale', icon: 'mdi:music-circle' },
		{ key: 'webdav', icon: 'mdi:folder-network' }
	];

	let orphanedTracks: OfflineTrack[] = [];
	let selectedOrphans: Set<string> = new Set();
	let orphanScanDone = false;
	let clearing = false;

	onMount(() => {
		offline.loadOfflineTracks();
	});

	$: usagePercent =
		$offline.storageQuota > 0 ? Math.min(100, ($offline.appUsage / $offline.storageQuota) * 100) : 0;

	$: libraries = $settings.webdavLibraries || [];
	function libraryName(id: string): string {
		return libraries.find((l) => l.id === id)?.name || $_('webdav.libraryFallback');
	}

	/** Files and bytes currently stored for a pinned folder. */
	function folderStats(folder: OfflineFolder, tracks: OfflineTrack[]) {
		let count = 0;
		let bytes = 0;
		for (const ot of tracks) {
			const decoded = decodeIdentifier(ot.track.identifier);
			if (!decoded || decoded.libraryId !== folder.libraryId) continue;
			if (!isPathInside(decoded.path, folder.path)) continue;
			count++;
			bytes += ot.fileSize || 0;
		}
		return { count, bytes };
	}

	function folderHref(folder: OfflineFolder): string {
		const lib = libraries.find((l) => l.id === folder.libraryId);
		const rel = lib ? toRelativePath(lib, folder.path) : folder.path;
		return `${base}/library/webdav/${folder.libraryId}?p=${encodeURIComponent(rel)}`;
	}

	async function removeFolder(folder: OfflineFolder) {
		if (!confirm($_('settings.offline.removeFolderConfirm', { values: { name: folder.name } }))) return;
		await offline.removeFolder(folder.id, true);
	}

	async function clearAll() {
		if (!confirm($_('settings.offline.clearConfirm'))) return;
		clearing = true;
		try {
			await offline.clearAll();
			orphanedTracks = [];
			orphanScanDone = false;
		} finally {
			clearing = false;
		}
	}

	function handleScanOrphans() {
		const orphans = findOrphanedTracks(
			$offline.offlineTracks,
			$library.favorites,
			$library.playlists,
			$isInOfflineFolder
		);
		orphanedTracks = orphans;
		selectedOrphans = new Set(orphans.map((ot) => ot.track.identifier));
		orphanScanDone = true;
	}

	$: allOrphansSelected = orphanedTracks.length > 0 && selectedOrphans.size === orphanedTracks.length;
	$: selectedOrphanSize = orphanedTracks
		.filter((ot) => selectedOrphans.has(ot.track.identifier))
		.reduce((sum, ot) => sum + (ot.fileSize || 0), 0);

	function toggleOrphan(id: string) {
		selectedOrphans = new Set(selectedOrphans);
		if (selectedOrphans.has(id)) selectedOrphans.delete(id);
		else selectedOrphans.add(id);
	}

	function toggleAllOrphans() {
		selectedOrphans = allOrphansSelected
			? new Set()
			: new Set(orphanedTracks.map((ot) => ot.track.identifier));
	}

	async function removeSelectedOrphans() {
		for (const id of selectedOrphans) {
			await offline.deleteTrack(id);
		}
		orphanedTracks = orphanedTracks.filter((ot) => !selectedOrphans.has(ot.track.identifier));
		selectedOrphans = new Set();
	}
</script>

<svelte:head>
	<title>{$_('settings.offline.title')} — dustic</title>
</svelte:head>

<div class="space-y-8">
	<!-- Summary -->
	<section>
		<h3 class="text-xl font-semibold mb-4">
			<Icon icon="solar:download-minimalistic-bold" width="24" className="inline mr-2" />
			{$_('settings.offline.title')}
		</h3>

		<div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
			<div class="stat bg-base-300 rounded-lg p-4" data-testid="offline-stat-files">
				<div class="stat-title text-xs">{$_('settings.offline.statFiles')}</div>
				<div class="stat-value text-2xl">{$offline.offlineTracks.length}</div>
			</div>
			<div class="stat bg-base-300 rounded-lg p-4" data-testid="offline-stat-size">
				<div class="stat-title text-xs">{$_('settings.offline.statSize')}</div>
				<div class="stat-value text-xl">{formatBytes($offline.storageUsed)}</div>
			</div>
			<div class="stat bg-base-300 rounded-lg p-4 col-span-2 md:col-span-1">
				<div class="stat-title text-xs">{$_('settings.offline.statAppUsage')}</div>
				<div class="stat-value text-xl">{formatBytes($offline.appUsage)}</div>
				{#if $offline.storageQuota > 0}
					<div class="stat-desc">
						{$_('settings.offline.ofQuota', { values: { quota: formatBytes($offline.storageQuota) } })}
					</div>
					<progress class="progress progress-primary w-full mt-2" value={usagePercent} max="100"></progress>
				{/if}
			</div>
		</div>

		<!-- Per-source breakdown -->
		<div class="overflow-x-auto">
			<table class="table table-sm">
				<thead>
					<tr>
						<th>{$_('settings.offline.colSource')}</th>
						<th class="text-right">{$_('settings.offline.colFiles')}</th>
						<th class="text-right">{$_('settings.offline.colSize')}</th>
					</tr>
				</thead>
				<tbody>
					{#each SOURCES as src}
						<tr>
							<td class="flex items-center gap-2">
								<Icon icon={src.icon} width="16" />
								{$_(`settings.offline.source.${src.key}`)}
							</td>
							<td class="text-right tabular-nums">{$offlineBreakdown[src.key].tracks}</td>
							<td class="text-right tabular-nums">{formatBytes($offlineBreakdown[src.key].bytes)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Persistence -->
		<div class="mt-4 flex flex-wrap items-center gap-3 text-sm">
			{#if $offline.persisted === true}
				<span class="badge badge-success gap-1">
					<Icon icon="solar:shield-check-bold" width="14" />
					{$_('settings.offline.persisted')}
				</span>
			{:else if $offline.persisted === false}
				<span class="badge badge-warning gap-1">
					<Icon icon="solar:danger-triangle-linear" width="14" />
					{$_('settings.offline.notPersisted')}
				</span>
				<button class="btn btn-xs btn-outline" on:click={() => offline.requestPersistence()}>
					{$_('settings.offline.requestPersist')}
				</button>
			{/if}
		</div>
	</section>

	<!-- WebDAV folders kept offline -->
	<section class="border-t border-base-300 pt-6">
		<h3 class="text-lg font-semibold mb-1">
			<Icon icon="mdi:folder-download" width="22" className="inline mr-2" />
			{$_('settings.offline.foldersTitle')}
		</h3>
		<p class="text-sm text-base-content/60 mb-4">{$_('settings.offline.foldersHelp')}</p>

		{#if $offline.folders.length === 0}
			<div class="text-sm text-base-content/50 italic">{$_('settings.offline.foldersEmpty')}</div>
		{:else}
			<ul class="space-y-2" data-testid="offline-folders">
				{#each $offline.folders as folder (folder.id)}
					{@const stats = folderStats(folder, $offline.offlineTracks)}
					{@const job = $offline.folderJobs.get(folder.id)}
					<li class="bg-base-200 rounded-lg p-3">
						<div class="flex items-center gap-3">
							<Icon icon="mdi:folder" width="22" />
							<div class="flex-1 min-w-0">
								<a href={folderHref(folder)} class="font-medium hover:underline truncate block">{folder.name}</a>
								<div class="text-xs text-base-content/50 truncate">
									{libraryName(folder.libraryId)} · {folder.path}
								</div>
								<div class="text-xs text-base-content/70 mt-0.5">
									{$_('settings.offline.folderStats', { values: { count: stats.count, size: formatBytes(stats.bytes) } })}
									{#if folder.lastSyncedAt}
										· {$_('settings.offline.lastSynced', { values: { date: new Date(folder.lastSyncedAt).toLocaleString() } })}
									{/if}
								</div>
								{#if folder.truncated}
									<div class="text-xs text-warning">{$_('settings.offline.truncated')}</div>
								{/if}
							</div>
							<button
								class="btn btn-ghost btn-sm btn-square"
								title={$_('settings.offline.sync')}
								aria-label={$_('settings.offline.sync')}
								disabled={job?.phase === 'listing' || job?.phase === 'downloading'}
								on:click={() => offline.syncFolder(folder.libraryId, folder.path, folder.name)}
							>
								<Icon icon="mdi:sync" width="18" />
							</button>
							<button
								class="btn btn-ghost btn-sm btn-square text-error"
								title={$_('settings.offline.removeFolder')}
								aria-label={$_('settings.offline.removeFolder')}
								on:click={() => removeFolder(folder)}
							>
								<Icon icon="solar:trash-bin-trash-linear" width="18" />
							</button>
						</div>
						{#if job}
							<div class="mt-2 text-xs">
								{#if job.phase === 'listing'}
									<span class="loading loading-spinner loading-xs"></span>
									{$_('webdav.offline.listing')}
								{:else if job.phase === 'downloading'}
									<progress class="progress progress-primary w-full" value={job.done} max={job.total || 1}></progress>
									{$_('webdav.offline.progress', { values: { done: job.done, total: job.total } })}
								{:else if job.phase === 'done' && job.failed > 0}
									<span class="text-warning">{$_('webdav.offline.doneWithErrors', { values: { failed: job.failed } })}</span>
								{:else if job.phase === 'error'}
									<span class="text-error">{$_('webdav.offline.error')}</span>
								{/if}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Orphan Detection -->
	<section class="border-t border-base-300 pt-6">
		<button on:click={handleScanOrphans} class="btn btn-outline btn-sm gap-2">
			<Icon icon="solar:magnifer-bold" width="16" />
			{$_('settings.offline.findOrphans')}
		</button>

		{#if orphanScanDone && orphanedTracks.length === 0}
			<div class="alert alert-success mt-3 text-sm">
				<Icon icon="solar:check-circle-bold" width="18" />
				<span>{$_('settings.offline.allReferenced')}</span>
			</div>
		{/if}

		{#if orphanedTracks.length > 0}
			<div class="border border-warning/30 rounded-lg p-3 mt-3">
				<div class="flex items-center justify-between mb-2">
					<span class="text-sm font-medium text-warning">
						{$_('settings.offline.orphansFound', { values: { count: orphanedTracks.length } })}
					</span>
				</div>

				<label class="flex items-center gap-2 text-sm cursor-pointer mb-2 opacity-70">
					<input
						type="checkbox"
						class="checkbox checkbox-sm"
						checked={allOrphansSelected}
						on:change={toggleAllOrphans}
					/>
					{$_('settings.offline.selectAll')}
				</label>

				<div class="max-h-48 overflow-y-auto space-y-1">
					{#each orphanedTracks as ot (ot.track.identifier)}
						<label class="flex items-center gap-2 text-sm cursor-pointer py-1 px-1 rounded hover:bg-base-300">
							<input
								type="checkbox"
								class="checkbox checkbox-sm"
								checked={selectedOrphans.has(ot.track.identifier)}
								on:change={() => toggleOrphan(ot.track.identifier)}
							/>
							<span class="truncate flex-1">{ot.track.title || ot.track.identifier}</span>
							{#if ot.fileSize}
								<span class="text-base-content/40 shrink-0 text-xs">{formatBytes(ot.fileSize)}</span>
							{/if}
						</label>
					{/each}
				</div>

				{#if selectedOrphans.size > 0}
					<button on:click={removeSelectedOrphans} class="btn btn-warning btn-sm w-full mt-3">
						{$_('settings.offline.removeOrphans', { values: { count: selectedOrphans.size, size: formatBytes(selectedOrphanSize) } })}
					</button>
				{/if}
			</div>
		{/if}
	</section>

	<!-- Info + danger zone -->
	<section class="border-t border-base-300 pt-6 space-y-3 text-sm text-base-content/70">
		<div class="alert alert-info">
			<Icon icon="solar:info-circle-bold" width="20" />
			<div class="space-y-2">
				<p>
					<strong>{$_('settings.offline.storageInfoStrong')}</strong>{$_('settings.offline.storageInfoRest')}
				</p>
				<ul class="list-disc list-inside ml-4 space-y-1">
					<li>{@html $_('settings.offline.storageInfoAudio')}</li>
					<li>{@html $_('settings.offline.storageInfoMeta')}</li>
				</ul>
			</div>
		</div>

		<div class="alert alert-warning">
			<Icon icon="solar:danger-triangle-bold" width="20" />
			<div>
				<p><strong>{$_('settings.offline.importantStrong')}</strong>{$_('settings.offline.importantRest')}</p>
			</div>
		</div>

		{#if $offline.offlineTracks.length > 0}
			<button class="btn btn-error btn-outline btn-sm gap-2" on:click={clearAll} disabled={clearing}>
				{#if clearing}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<Icon icon="solar:trash-bin-trash-linear" width="16" />
				{/if}
				{$_('settings.offline.clearAll', { values: { size: formatBytes($offline.storageUsed) } })}
			</button>
		{/if}
	</section>
</div>
