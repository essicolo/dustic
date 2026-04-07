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
	import type { UserProfile } from '$lib/types';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import Icon from '$lib/components/Icon.svelte';

	let fileInput: HTMLInputElement;
	let isImporting = false;
	let importError = '';
	let copySuccess = false;
	let showPasteArea = false;
	let pasteText = '';
	let pasteTextarea: HTMLTextAreaElement;

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
	});

	function handleBeforeUnload(e: BeforeUnloadEvent) {
		if (isDirty) {
			e.preventDefault();
			e.returnValue = 'You have unsaved changes. Download your profile before leaving?';
		}
	}

	function handleExport() {
		const profile = buildCurrentProfile();
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
			importError = error instanceof Error ? error.message : 'Failed to import profile';
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
				favoriteInfluencedAutoplay: $settings.favoriteInfluencedAutoplay
			}
		};
	}

	async function handleCopyToClipboard() {
		const profile = buildCurrentProfile();
		const json = profileToJson(profile);

		try {
			await navigator.clipboard.writeText(json);
			copySuccess = true;
			setTimeout(() => (copySuccess = false), 2000);

			library.markClean();
			history.markClean();
		} catch {
			importError = 'Failed to copy to clipboard';
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
				importError = 'Clipboard does not contain a valid profile';
			} else {
				importError = 'Failed to parse profile JSON';
			}
		}
	}

	async function applyImport(mode: 'merge' | 'replace') {
		if (!pendingImport) return;

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
	}

	function cancelImport() {
		pendingImport = null;
	}

	async function loadProfile(profile: UserProfile) {
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

		// Persist the imported profile to both localStorage and IndexedDB immediately
		// This is critical for iOS PWA persistence
		await saveToStorage(profile);

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

	<!-- Compact Profile Manager - Single Line -->
	<div class="flex items-center justify-between gap-2">
		<span class="text-sm font-medium flex items-center gap-1.5">
			{#if isDirty}
				<Icon icon="solar:danger-triangle-bold" width="14" className="text-warning" />
			{/if}
			Profile
		</span>
		<div class="flex items-center gap-1">
			<button
				on:click={handleExport}
				class="btn btn-ghost btn-xs btn-circle"
				title="Download profile"
			>
				<Icon icon="solar:download-bold" width="16" />
			</button>
			<button
				on:click={handleImportClick}
				class="btn btn-ghost btn-xs btn-circle"
				disabled={isImporting}
				title="Upload profile"
			>
				{#if isImporting}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<Icon icon="solar:upload-bold" width="16" />
				{/if}
			</button>
			<span class="w-px h-4 bg-base-content/10"></span>
			<button
				on:click={handleCopyToClipboard}
				class="btn btn-ghost btn-xs btn-circle"
				title="Copy profile to clipboard"
			>
				{#if copySuccess}
					<Icon icon="solar:check-circle-bold" width="16" className="text-success" />
				{:else}
					<Icon icon="solar:copy-bold" width="16" />
				{/if}
			</button>
			<button
				on:click={openPasteArea}
				class="btn btn-ghost btn-xs btn-circle"
				title="Paste profile from clipboard"
			>
				<Icon icon="solar:clipboard-bold" width="16" />
			</button>
		</div>
	</div>

	<!-- Paste Area -->
	{#if showPasteArea}
		<div class="mt-2 border border-base-content/10 rounded-lg p-2">
			<div class="flex items-center justify-between mb-1.5">
				<span class="text-xs font-medium">Paste profile JSON</span>
				<button on:click={closePasteArea} class="btn btn-ghost btn-xs btn-circle" title="Cancel">
					<Icon icon="solar:close-circle-bold" width="14" />
				</button>
			</div>
			<textarea
				bind:this={pasteTextarea}
				bind:value={pasteText}
				placeholder="Paste your profile JSON here..."
				class="textarea textarea-bordered w-full text-xs h-24 font-mono leading-tight"
			></textarea>
			<button
				on:click={handlePasteImport}
				class="btn btn-primary btn-xs w-full mt-1.5"
				disabled={!pasteText.trim()}
			>
				Import
			</button>
		</div>
	{/if}

	<!-- Merge or Replace choice -->
	{#if pendingImport}
		<div class="mt-2 border border-primary/30 rounded-lg p-2">
			<p class="text-xs mb-2">Profile loaded. How do you want to import it?</p>
			<div class="flex gap-1.5">
				<button on:click={() => applyImport('merge')} class="btn btn-primary btn-xs flex-1">
					Merge
				</button>
				<button on:click={() => applyImport('replace')} class="btn btn-outline btn-xs flex-1">
					Replace
				</button>
				<button on:click={cancelImport} class="btn btn-ghost btn-xs btn-circle" title="Cancel">
					<Icon icon="solar:close-circle-bold" width="14" />
				</button>
			</div>
		</div>
	{/if}

	<!-- Import Error -->
	{#if importError}
		<div class="alert alert-error mt-2 text-xs p-2">
			<span>{importError}</span>
		</div>
	{/if}

	<!-- Orphaned Cache Cleanup -->
	{#if orphanedTracks.length > 0}
		<div class="mt-2 border border-warning/30 rounded-lg p-2">
			<div class="flex items-center justify-between mb-1.5">
				<span class="text-xs font-medium text-warning">Unreferenced cached tracks</span>
				<button on:click={dismissOrphans} class="btn btn-ghost btn-xs btn-circle" title="Dismiss">
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
				Select all ({orphanedTracks.length})
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
					Remove {selectedOrphans.size} track{selectedOrphans.size > 1 ? 's' : ''} ({formatBytes(selectedSize)})
				</button>
			{/if}
		</div>
	{/if}
</div>
