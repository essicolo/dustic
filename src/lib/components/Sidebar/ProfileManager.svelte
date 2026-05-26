<script lang="ts">
	import { library } from '$lib/stores/library';
	import { history } from '$lib/stores/history';
	import { autoplayStore } from '$lib/stores/autoplay';
	import { player } from '$lib/stores/player';
	import { settings } from '$lib/stores/settings';
	import { exportProfile, importProfile, createDefaultProfile, mergeProfiles, profileToJson, importProfileFromText } from '$lib/services/storage';
	import { offline } from '$lib/stores/offline';
	import { formatBytes, type OfflineTrack } from '$lib/services/offlineStorage';
	import { findOrphanedTracks } from '$lib/services/orphanDetection';
	import { saveToStorage } from '$lib/services/persistence';
	import { uploadProfileToWebDAV } from '$lib/services/webdav';
	import type { UserProfile } from '$lib/types';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import Icon from '$lib/components/Icon.svelte';
	import { _ } from '$lib/i18n';

	let fileInput: HTMLInputElement;
	let isImporting = false;
	let importError = '';
	let copySuccess = false;
	let showPasteArea = false;
	let pasteText = '';
	let pasteTextarea: HTMLTextAreaElement;
	let importSuccess = false;
	let isSyncing = false;
	let syncSuccess = false;
	let syncError = '';
	let autoSyncInterval: ReturnType<typeof setInterval> | null = null;
	let panelOpen = false;

	// Pending import awaiting merge/replace choice
	let pendingImport: UserProfile | null = null;

	// Orphan cleanup state
	let orphanedTracks: OfflineTrack[] = [];
	let selectedOrphans: Set<string> = new Set();

	// Combined dirty state
	$: isDirty = $library.isDirty || $history.isDirty;

	onMount(() => {
		// Warn on page close if unsaved changes
		if (browser) {
			window.addEventListener('beforeunload', handleBeforeUnload);
		}
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('beforeunload', handleBeforeUnload);
		}
		if (autoSyncInterval) {
			clearInterval(autoSyncInterval);
		}
	});

	function handleBeforeUnload(e: BeforeUnloadEvent) {
		if (isDirty) {
			e.preventDefault();
			e.returnValue = $_('profileMgr.beforeUnload');
		}
	}

	function handleExport() {
		const profile = buildCurrentProfile();
		// Strip WebDAV credentials from exported file
		if (profile.settings.webdav) {
			const { url, enabled, autoSyncMinutes, lastSync } = profile.settings.webdav;
			profile.settings.webdav = { url, username: '', password: '', enabled, autoSyncMinutes, lastSync };
		}
		exportProfile(profile);

		library.markClean();
		history.markClean();
	}

	async function handleImportClick() {
		fileInput.click();
	}

	async function handleFileSelected(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) return;

		importError = '';

		try {
			const imported = await importProfile(file);
			pendingImport = imported;
		} catch (error) {
			importError = error instanceof Error ? error.message : $_('profileMgr.importFailed');
		} finally {
			input.value = '';
		}
	}

	function buildCurrentProfile(): UserProfile {
		return {
			schemaVersion: 2,
			exported: Date.now(),
			favorites: $library.favorites,
			playlists: $library.playlists,
			history: $history.entries,
			autoplayRules: $autoplayStore.rules,
			settings: {
				volume: $player.volume,
				repeat: $player.repeat,
				audioQuality: $settings.audioQuality || 'medium',
				funkwhaleInstances: $settings.funkwhaleInstances,
				favoriteInfluencedAutoplay: $settings.favoriteInfluencedAutoplay,
				webdav: $settings.webdav
			},
			lastPlayedTrack: $player.currentTrack || undefined,
			lastPlayedPosition: $player.currentTime
		};
	}

	async function handleCopyToClipboard() {
		const profile = buildCurrentProfile();
		// Strip WebDAV credentials from clipboard export
		if (profile.settings.webdav) {
			const { url, enabled, autoSyncMinutes, lastSync } = profile.settings.webdav;
			profile.settings.webdav = { url, username: '', password: '', enabled, autoSyncMinutes, lastSync };
		}
		const json = profileToJson(profile);

		try {
			await navigator.clipboard.writeText(json);
			copySuccess = true;
			setTimeout(() => (copySuccess = false), 2000);

			library.markClean();
			history.markClean();
		} catch {
			importError = $_('profileMgr.copyFailed');
		}
	}

	function openPasteArea() {
		showPasteArea = true;
		pasteText = '';
		importError = '';
		// Focus the textarea after it renders
		setTimeout(() => pasteTextarea?.focus(), 50);
	}

	function closePasteArea() {
		showPasteArea = false;
		pasteText = '';
	}

	function handlePasteImport() {
		if (!pasteText.trim()) return;

		importError = '';

		try {
			const imported = importProfileFromText(pasteText);
			pendingImport = imported;
			showPasteArea = false;
			pasteText = '';
		} catch (error) {
			if (error instanceof Error && error.message === 'Invalid profile format') {
				importError = $_('profileMgr.invalidProfile');
			} else {
				importError = $_('profileMgr.parseFailed');
			}
		}
	}

	async function applyImport(mode: 'merge' | 'replace') {
		if (!pendingImport) return;

		try {
			importError = '';

			if (mode === 'merge') {
				const current = buildCurrentProfile();
				const merged = mergeProfiles(current, pendingImport);
				await loadProfile(merged);
			} else {
				await loadProfile(pendingImport);
			}

			library.markClean();
			history.markClean();
			pendingImport = null;

			// Show success message after save is complete
			importSuccess = true;
			setTimeout(() => (importSuccess = false), 3000);
		} catch (error) {
			console.error('[ProfileManager] Import failed:', error);
			importError = $_('settings.profile.importFailedSave');
		}
	}

	function cancelImport() {
		pendingImport = null;
	}

	async function loadProfile(profile: UserProfile) {
		// CRITICAL: Persist FIRST before loading into stores
		// This ensures data is saved even if subsequent operations fail
		console.log('[ProfileManager] Persisting imported profile to storage...');
		try {
			await saveToStorage(profile);
			console.log('[ProfileManager] ✓ Profile saved to localStorage');
			console.log('[ProfileManager] ✓ Profile saved to IndexedDB');
		} catch (error) {
			console.error('[ProfileManager] ✗ Failed to save profile:', error);
			throw new Error($_('profileMgr.saveStoreFailed'));
		}

		// Now load into stores (these won't trigger auto-saves)
		library.loadFromProfile({
			favorites: profile.favorites,
			playlists: profile.playlists
		});

		history.loadFromProfile(profile.history);

		// Load autoplay rules
		autoplayStore.subscribe(() => {})(); // Trigger update
		profile.autoplayRules.forEach((rule) => {
			autoplayStore.setWeight(rule.id, rule.weight);
			if (!rule.enabled) {
				autoplayStore.toggleRule(rule.id);
			}
		});

		// Load settings
		if (profile.settings) {
			player.setVolume(profile.settings.volume);
			if (profile.settings.audioQuality) {
				settings.setAudioQuality(profile.settings.audioQuality);
			}
			if (profile.settings.funkwhaleInstances) {
				settings.setFunkwhaleInstances(profile.settings.funkwhaleInstances);
			}
			if (profile.settings.favoriteInfluencedAutoplay !== undefined) {
				settings.setFavoriteInfluencedAutoplay(profile.settings.favoriteInfluencedAutoplay);
			}
		}

		// Restore last played track and position
		if (profile.lastPlayedTrack) {
			player.restoreLastTrack(profile.lastPlayedTrack, profile.lastPlayedPosition || 0);
		}

		console.log('[ProfileManager] ✓ Profile loaded into all stores');

		// Detect orphaned cached tracks not referenced by the new profile
		findOrphanedCache(profile);
	}

	function findOrphanedCache(profile: UserProfile) {
		const orphans = findOrphanedTracks(
			$offline.offlineTracks,
			profile.favorites,
			profile.playlists
		);

		if (orphans.length === 0) return;

		orphanedTracks = orphans;
		selectedOrphans = new Set(orphans.map((ot) => ot.track.identifier));
	}

	$: allSelected = orphanedTracks.length > 0 && selectedOrphans.size === orphanedTracks.length;
	$: selectedSize = orphanedTracks
		.filter((ot) => selectedOrphans.has(ot.track.identifier))
		.reduce((sum, ot) => sum + (ot.fileSize || 0), 0);

	function toggleOrphan(id: string) {
		selectedOrphans = new Set(selectedOrphans);
		if (selectedOrphans.has(id)) {
			selectedOrphans.delete(id);
		} else {
			selectedOrphans.add(id);
		}
	}

	function toggleAllOrphans() {
		if (allSelected) {
			selectedOrphans = new Set();
		} else {
			selectedOrphans = new Set(orphanedTracks.map((ot) => ot.track.identifier));
		}
	}

	async function removeSelectedOrphans() {
		for (const id of selectedOrphans) {
			await offline.deleteTrack(id);
		}
		orphanedTracks = orphanedTracks.filter((ot) => !selectedOrphans.has(ot.track.identifier));
		selectedOrphans = new Set();
	}

	function dismissOrphans() {
		orphanedTracks = [];
		selectedOrphans = new Set();
	}

	// WebDAV sync
	$: webdavEnabled = $settings.webdav?.enabled ?? false;

	async function handleWebDAVSync() {
		const config = $settings.webdav;
		if (!config?.enabled || isSyncing) return;

		if (!navigator.onLine) {
			syncError = $_('profileMgr.offlineSkip');
			setTimeout(() => (syncError = ''), 3000);
			return;
		}

		isSyncing = true;
		syncError = '';
		syncSuccess = false;

		try {
			const profile = buildCurrentProfile();
			await uploadProfileToWebDAV(profile, config);
			settings.updateWebDAVLastSync(Date.now());
			syncSuccess = true;
			setTimeout(() => (syncSuccess = false), 3000);
		} catch (error) {
			syncError = error instanceof Error ? error.message : $_('profileMgr.syncFailed');
			setTimeout(() => (syncError = ''), 5000);
		} finally {
			isSyncing = false;
		}
	}

	// Auto-sync timer — reacts to config changes
	$: {
		if (autoSyncInterval) {
			clearInterval(autoSyncInterval);
			autoSyncInterval = null;
		}
		const minutes = $settings.webdav?.autoSyncMinutes ?? 0;
		if (browser && $settings.webdav?.enabled && minutes > 0) {
			autoSyncInterval = setInterval(() => {
				if (navigator.onLine) {
					handleWebDAVSync();
				}
			}, minutes * 60 * 1000);
		}
	}

</script>

<div class="px-4 pb-4 border-t border-base-content/10 pt-3">
	<!-- Hidden file input -->
	<input
		type="file"
		bind:this={fileInput}
		on:change={handleFileSelected}
		accept=".json"
		class="hidden"
	/>

	<!-- Single "Profile" entry point (Change 4) -->
	<button
		class="btn btn-ghost btn-sm w-full justify-start gap-2 normal-case font-medium"
		on:click={() => (panelOpen = true)}
		aria-label={$_('profileMgr.openPanel')}
	>
		<Icon icon="solar:user-circle-bold-duotone" width="20" />
		<span>{$_('profileMgr.profile')}</span>
		{#if isDirty}
			<Icon icon="solar:danger-triangle-bold" width="14" className="text-warning ml-auto" />
		{/if}
	</button>

	{#if panelOpen}
		<!-- Modal backdrop -->
		<div
			class="modal modal-open"
			on:click|self={() => (panelOpen = false)}
			on:keydown={(e) => e.key === 'Escape' && (panelOpen = false)}
			role="dialog"
			tabindex="-1"
		>
			<div class="modal-box max-w-sm">
				<div class="flex items-center justify-between mb-4">
					<h3 class="text-lg font-semibold">{$_('profileMgr.profile')}</h3>
					<button
						class="btn btn-ghost btn-sm btn-circle"
						on:click={() => (panelOpen = false)}
						aria-label={$_('common.close')}
					>
						<Icon icon="solar:close-circle-bold" width="18" />
					</button>
				</div>

				<div class="grid grid-cols-1 gap-1.5">
					<button
						class="btn btn-ghost justify-start gap-3 normal-case font-normal"
						on:click={handleExport}
					>
						<Icon icon="solar:download-bold" width="20" />
						{$_('profileMgr.exportBtn')}
					</button>

					<button
						class="btn btn-ghost justify-start gap-3 normal-case font-normal"
						on:click={handleImportClick}
						disabled={isImporting}
					>
						{#if isImporting}
							<span class="loading loading-spinner loading-sm"></span>
						{:else}
							<Icon icon="solar:upload-bold" width="20" />
						{/if}
						{$_('profileMgr.importBtn')}
					</button>

					<button
						class="btn btn-ghost justify-start gap-3 normal-case font-normal"
						on:click={handleCopyToClipboard}
					>
						{#if copySuccess}
							<Icon icon="solar:check-circle-bold" width="20" className="text-success" />
						{:else}
							<Icon icon="solar:copy-bold" width="20" />
						{/if}
						{copySuccess ? $_('profileMgr.copied') : $_('profileMgr.copyToClipboard')}
					</button>

					<button
						class="btn btn-ghost justify-start gap-3 normal-case font-normal"
						on:click={openPasteArea}
					>
						<Icon icon="solar:clipboard-bold" width="20" />
						{$_('profileMgr.pasteFromClipboard')}
					</button>

					{#if webdavEnabled}
						<button
							class="btn btn-ghost justify-start gap-3 normal-case font-normal"
							on:click={handleWebDAVSync}
							disabled={isSyncing}
							class:text-success={syncSuccess}
						>
							{#if isSyncing}
								<span class="loading loading-spinner loading-sm"></span>
							{:else if syncSuccess}
								<Icon icon="solar:check-circle-bold" width="20" />
							{:else}
								<Icon icon="solar:refresh-bold" width="20" />
							{/if}
							{syncSuccess ? $_('profileMgr.synced') : $_('profileMgr.syncToCloud')}
						</button>
					{/if}
				</div>

	<!-- Paste Area -->
	{#if showPasteArea}
		<div class="mt-2 border border-base-content/10 rounded-lg p-2">
			<div class="flex items-center justify-between mb-1.5">
				<span class="text-xs font-medium">{$_('profileMgr.pasteHeader')}</span>
				<button on:click={closePasteArea} class="btn btn-ghost btn-xs btn-circle" title={$_('common.cancel')}>
					<Icon icon="solar:close-circle-bold" width="14" />
				</button>
			</div>
			<textarea
				bind:this={pasteTextarea}
				bind:value={pasteText}
				placeholder={$_('profileMgr.pastePlaceholder')}
				class="textarea textarea-bordered w-full text-xs h-24 font-mono leading-tight"
			></textarea>
			<button
				on:click={handlePasteImport}
				class="btn btn-primary btn-xs w-full mt-1.5"
				disabled={!pasteText.trim()}
			>
				{$_('profileMgr.importBtn')}
			</button>
		</div>
	{/if}

	<!-- Merge or Replace choice -->
	{#if pendingImport}
		<div class="mt-2 border border-primary/30 rounded-lg p-2">
			<p class="text-xs mb-2">{$_('profileMgr.mergeReplaceTitle')}</p>
			<div class="flex gap-1.5">
				<button on:click={() => applyImport('merge')} class="btn btn-primary btn-xs flex-1">
					{$_('settings.profile.merge')}
				</button>
				<button on:click={() => applyImport('replace')} class="btn btn-outline btn-xs flex-1">
					{$_('settings.profile.replace')}
				</button>
				<button on:click={cancelImport} class="btn btn-ghost btn-xs btn-circle" title={$_('common.cancel')}>
					<Icon icon="solar:close-circle-bold" width="14" />
				</button>
			</div>
		</div>
	{/if}

	<!-- Import Success -->
	{#if importSuccess}
		<div class="alert alert-success mt-2 text-xs p-2 flex items-center gap-1">
			<Icon icon="solar:check-circle-bold" width="16" />
			<span>{$_('profileMgr.importSuccessShort')}</span>
		</div>
	{/if}

	<!-- Import Error -->
	{#if importError}
		<div class="alert alert-error mt-2 text-xs p-2">
			<span>{importError}</span>
		</div>
	{/if}

	<!-- Sync Error -->
	{#if syncError}
		<div class="alert alert-error mt-2 text-xs p-2">
			<span>{syncError}</span>
		</div>
	{/if}
			</div>
		</div>
	{/if}

	<!-- Orphaned Cache Cleanup -->
	{#if orphanedTracks.length > 0}
		<div class="mt-2 border border-warning/30 rounded-lg p-2">
			<div class="flex items-center justify-between mb-1.5">
				<span class="text-xs font-medium text-warning">{$_('profileMgr.orphansHeader')}</span>
				<button on:click={dismissOrphans} class="btn btn-ghost btn-xs btn-circle" title={$_('profileMgr.dismissOrphans')}>
					<Icon icon="solar:close-circle-bold" width="14" />
				</button>
			</div>

			<!-- Select all -->
			<label class="flex items-center gap-1.5 text-xs cursor-pointer mb-1 opacity-70">
				<input
					type="checkbox"
					class="checkbox checkbox-xs"
					checked={allSelected}
					on:change={toggleAllOrphans}
				/>
				{$_('profileMgr.selectAllN', { values: { count: orphanedTracks.length } })}
			</label>

			<!-- Track list -->
			<div class="max-h-32 overflow-y-auto space-y-0.5">
				{#each orphanedTracks as ot (ot.track.identifier)}
					<label class="flex items-center gap-1.5 text-xs cursor-pointer py-0.5">
						<input
							type="checkbox"
							class="checkbox checkbox-xs"
							checked={selectedOrphans.has(ot.track.identifier)}
							on:change={() => toggleOrphan(ot.track.identifier)}
						/>
						<span class="truncate flex-1">{ot.track.title || ot.track.identifier}</span>
						{#if ot.fileSize}
							<span class="text-base-content/40 shrink-0">{formatBytes(ot.fileSize)}</span>
						{/if}
					</label>
				{/each}
			</div>

			<!-- Actions -->
			{#if selectedOrphans.size > 0}
				<button
					on:click={removeSelectedOrphans}
					class="btn btn-warning btn-xs w-full mt-1.5"
				>
					{$_('profileMgr.removeOrphans', { values: { count: selectedOrphans.size, size: formatBytes(selectedSize) } })}
				</button>
			{/if}
		</div>
	{/if}
</div>
