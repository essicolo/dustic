<script lang="ts">
	import { library } from '$lib/stores/library';
	import { history } from '$lib/stores/history';
	import { autoplayStore } from '$lib/stores/autoplay';
	import { player } from '$lib/stores/player';
	import { exportProfile, importProfile, createDefaultProfile, mergeProfiles } from '$lib/services/storage';
	import type { UserProfile } from '$lib/types';
	import { onMount, onDestroy } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';

	let fileInput: HTMLInputElement;
	let isImporting = false;
	let importError = '';

	// Combined dirty state
	$: isDirty = $library.isDirty || $history.isDirty;

	onMount(() => {
		// Warn on page close if unsaved changes
		window.addEventListener('beforeunload', handleBeforeUnload);
	});

	onDestroy(() => {
		window.removeEventListener('beforeunload', handleBeforeUnload);
	});

	function handleBeforeUnload(e: BeforeUnloadEvent) {
		if (isDirty) {
			e.preventDefault();
			e.returnValue = 'You have unsaved changes. Download your profile before leaving?';
		}
	}

	function handleExport() {
		const profile: UserProfile = {
			version: '1.0.0',
			exported: Date.now(),
			favorites: $library.favorites,
			playlists: $library.playlists,
			history: $history.entries,
			autoplayRules: $autoplayStore.rules,
			settings: {
				volume: $player.volume,
				repeat: $player.repeat
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
		}
	}
</script>

<div class="p-4 border-t border-base-content/10">
	<!-- Hidden file input -->
	<input
		type="file"
		bind:this={fileInput}
		on:change={handleFileSelected}
		accept=".json"
		class="hidden"
	/>

	<!-- Dirty indicator -->
	{#if isDirty}
		<div class="alert alert-warning mb-3 text-xs p-2 flex items-center gap-1">
			<Icon icon="solar:danger-triangle-bold" width="16" />
			<span>Unsaved changes</span>
		</div>
	{/if}

	<!-- Import Error -->
	{#if importError}
		<div class="alert alert-error mb-3 text-xs p-2">
			<span>{importError}</span>
		</div>
	{/if}

	<!-- Actions -->
	<div class="space-y-2">
		<button
			on:click={handleExport}
			class="btn btn-primary btn-sm w-full"
			title="Download your profile"
		>
			<span>↓</span>
			<span>Download Profile</span>
		</button>

		<button
			on:click={handleImportClick}
			class="btn btn-ghost btn-sm w-full"
			disabled={isImporting}
			title="Upload a profile"
		>
			{#if isImporting}
				<span class="loading loading-spinner loading-xs"></span>
			{:else}
				<span>↑</span>
			{/if}
			<span>Upload Profile</span>
		</button>
	</div>

	<!-- Info -->
	<div class="text-xs text-base-content/50 mt-3">
		<p>Your data stays on your device.</p>
		<p>Download to backup or move between browsers.</p>
	</div>
</div>
