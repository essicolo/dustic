<script lang="ts">
	import { library } from '$lib/stores/library';
	import { history } from '$lib/stores/history';
	import { autoplayStore } from '$lib/stores/autoplay';
	import { player } from '$lib/stores/player';
	import { settings } from '$lib/stores/settings';
	import { exportProfile, importProfile, createDefaultProfile, mergeProfiles } from '$lib/services/storage';
	import type { UserProfile } from '$lib/types';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import Icon from '$lib/components/Icon.svelte';

	let fileInput: HTMLInputElement;
	let isImporting = false;
	let importError = '';

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
		const profile: UserProfile = {
			schemaVersion: 1,
			exported: Date.now(),
			favorites: $library.favorites,
			playlists: $library.playlists,
			history: $history.entries,
			autoplayRules: $autoplayStore.rules,
			settings: {
				volume: $player.volume,
				repeat: $player.repeat,
				audioQuality: $settings.audioQuality || 'medium',
				funkwhaleInstances: $settings.funkwhaleInstances
			}
		};

		exportProfile(profile);

		// Mark as clean after export
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
		</div>
	</div>

	<!-- Import Error -->
	{#if importError}
		<div class="alert alert-error mt-2 text-xs p-2">
			<span>{importError}</span>
		</div>
	{/if}
</div>
