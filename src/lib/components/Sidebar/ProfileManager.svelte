<script lang="ts">
	import { library } from '$lib/stores/library';
	import { history } from '$lib/stores/history';
	import { autoplayStore } from '$lib/stores/autoplay';
	import { player } from '$lib/stores/player';
	import { settings } from '$lib/stores/settings';
	import { exportProfile, importProfile, createDefaultProfile, mergeProfiles, profileToJson, importProfileFromText } from '$lib/services/storage';
	import { offline } from '$lib/stores/offline';
	import { formatBytes } from '$lib/services/offlineStorage';
	import type { UserProfile } from '$lib/types';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import Icon from '$lib/components/Icon.svelte';

	let fileInput: HTMLInputElement;
	let isImporting = false;
	let importError = '';
	let copySuccess = false;

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

		isImporting = true;
		importError = '';

		try {
			const imported = await importProfile(file);

			// Ask user if they want to merge or replace
			const shouldMerge = confirm(
				'Merge imported data with current data? (Cancel to replace everything)'
			);

			if (shouldMerge) {
				const current = createDefaultProfile();
				current.favorites = $library.favorites;
				current.playlists = $library.playlists;
				current.history = $history.entries;
				current.autoplayRules = $autoplayStore.rules;

				const merged = mergeProfiles(current, imported);
				loadProfile(merged);
			} else {
				loadProfile(imported);
			}

			// Mark as clean after successful import
			library.markClean();
			history.markClean();
		} catch (error) {
			importError = error instanceof Error ? error.message : 'Failed to import profile';
		} finally {
			isImporting = false;
			input.value = ''; // Reset file input
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

	async function handlePasteFromClipboard() {
		isImporting = true;
		importError = '';

		try {
			const text = await navigator.clipboard.readText();
			const imported = importProfileFromText(text);

			const shouldMerge = confirm(
				'Merge imported data with current data? (Cancel to replace everything)'
			);

			if (shouldMerge) {
				const current = buildCurrentProfile();
				const merged = mergeProfiles(current, imported);
				loadProfile(merged);
			} else {
				loadProfile(imported);
			}

			library.markClean();
			history.markClean();
		} catch (error) {
			if (error instanceof Error && error.message === 'Invalid profile format') {
				importError = 'Clipboard does not contain a valid profile';
			} else {
				importError = 'Failed to read from clipboard';
			}
		} finally {
			isImporting = false;
		}
	}

	function loadProfile(profile: UserProfile) {
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

		// Clean up orphaned cached tracks not referenced by the new profile
		cleanOrphanedCache(profile);
	}

	async function cleanOrphanedCache(profile: UserProfile) {
		const cachedTracks = $offline.offlineTracks;
		if (cachedTracks.length === 0) return;

		// Build set of all track IDs referenced by the profile
		const referencedIds = new Set<string>();
		for (const fav of profile.favorites) {
			referencedIds.add(fav.id);
			referencedIds.add(fav.id.split('#')[0]);
		}
		for (const playlist of Object.values(profile.playlists)) {
			for (const trackId of playlist.tracks) {
				referencedIds.add(trackId);
				referencedIds.add(trackId.split('#')[0]);
			}
		}

		// Find orphans
		const orphans = cachedTracks.filter((ot) => {
			const id = ot.track.identifier;
			const baseId = id.split('#')[0];
			return !referencedIds.has(id) && !referencedIds.has(baseId);
		});

		if (orphans.length === 0) return;

		const totalSize = orphans.reduce((sum, ot) => sum + (ot.fileSize || 0), 0);
		const shouldClean = confirm(
			`${orphans.length} cached track${orphans.length > 1 ? 's' : ''} (${formatBytes(totalSize)}) ${orphans.length > 1 ? 'are' : 'is'} not in the imported profile. Remove from cache?`
		);

		if (shouldClean) {
			for (const orphan of orphans) {
				await offline.deleteTrack(orphan.track.identifier);
			}
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
				on:click={handlePasteFromClipboard}
				class="btn btn-ghost btn-xs btn-circle"
				disabled={isImporting}
				title="Paste profile from clipboard"
			>
				<Icon icon="solar:clipboard-bold" width="16" />
			</button>
		</div>
	</div>

	<!-- Import Error -->
	{#if importError}
		<div class="alert alert-error mt-2 text-xs p-2">
			<span>{importError}</span>
		</div>
	{/if}
</div>
