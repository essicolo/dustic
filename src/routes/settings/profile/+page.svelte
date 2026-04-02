<script lang="ts">
	import { library } from '$lib/stores/library';
	import { history } from '$lib/stores/history';
	import { autoplayStore } from '$lib/stores/autoplay';
	import { player } from '$lib/stores/player';
	import { settings } from '$lib/stores/settings';
	import { offline } from '$lib/stores/offline';
	import { exportProfile, importProfile, createDefaultProfile, mergeProfiles } from '$lib/services/storage';
	import { formatBytes as formatBytesShared, type OfflineTrack } from '$lib/services/offlineStorage';
	import { findOrphanedTracks } from '$lib/services/orphanDetection';
	import { saveToStorage } from '$lib/services/persistence';
	import type { UserProfile } from '$lib/types';
	import { base } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import { onMount } from 'svelte';

	let fileInput: HTMLInputElement;
	let isImporting = false;
	let importError = '';
	let importSuccess = false;

	// Orphan detection state
	let orphanedTracks: OfflineTrack[] = [];
	let selectedOrphans: Set<string> = new Set();
	let orphanScanDone = false;

	// Combined dirty state
	$: isDirty = $library.isDirty || $history.isDirty;

	// Statistics
	$: stats = {
		favorites: $library.favorites.length,
		playlists: Object.keys($library.playlists).length,
		playlistTracks: Object.values($library.playlists).reduce((sum, p) => sum + p.tracks.length, 0),
		historyEntries: $history.entries.length
	};

	// Offline storage stats
	$: offlineStats = {
		tracks: $offline.offlineTracks.length,
		storageUsed: $offline.storageUsed,
		storageQuota: $offline.storageQuota
	};

	// Format bytes to human readable
	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}

	onMount(() => {
		offline.loadOfflineTracks();
	});

	function handleExport() {
		const profile: UserProfile = {
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
		importSuccess = false;

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
			importSuccess = true;

			// Clear success message after 3 seconds
			setTimeout(() => {
				importSuccess = false;
			}, 3000);
		} catch (error) {
			importError = error instanceof Error ? error.message : 'Failed to import profile';
		} finally {
			isImporting = false;
			input.value = ''; // Reset file input
		}
	}

	function handleScanOrphans() {
		const orphans = findOrphanedTracks(
			$offline.offlineTracks,
			$library.favorites,
			$library.playlists
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
		if (selectedOrphans.has(id)) {
			selectedOrphans.delete(id);
		} else {
			selectedOrphans.add(id);
		}
	}

	function toggleAllOrphans() {
		if (allOrphansSelected) {
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

		// Persist the imported profile to localStorage immediately
		saveToStorage(profile);
	}
</script>

<!-- Hidden file input -->
<input
	type="file"
	bind:this={fileInput}
	on:change={handleFileSelected}
	accept=".json"
	class="hidden"
/>

<div class="p-4 md:p-8 max-w-4xl">
	<h2 class="text-2xl md:text-3xl font-bold mb-6">Settings</h2>

	<!-- Navigation Tabs -->
	<div class="tabs tabs-boxed mb-6">
		<a href="{base}/settings" class="tab">Autoplay</a>
		<a href="{base}/settings/profile" class="tab tab-active">Profile Data</a>
	</div>

	<!-- Profile Statistics -->
	<div class="card bg-base-200 mb-6">
		<div class="card-body">
			<h3 class="text-xl font-semibold mb-4">Your Profile Statistics</h3>
			<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
				<div class="stat bg-base-300 rounded-lg p-4">
					<div class="stat-title text-xs">Favorites</div>
					<div class="stat-value text-2xl">{stats.favorites}</div>
				</div>
				<div class="stat bg-base-300 rounded-lg p-4">
					<div class="stat-title text-xs">Playlists</div>
					<div class="stat-value text-2xl">{stats.playlists}</div>
				</div>
				<div class="stat bg-base-300 rounded-lg p-4">
					<div class="stat-title text-xs">Playlist Tracks</div>
					<div class="stat-value text-2xl">{stats.playlistTracks}</div>
				</div>
				<div class="stat bg-base-300 rounded-lg p-4">
					<div class="stat-title text-xs">History</div>
					<div class="stat-value text-2xl">{stats.historyEntries}</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Profile Management -->
	<div class="card bg-base-200 mb-6">
		<div class="card-body">
			<h3 class="text-xl font-semibold mb-4">Backup & Restore</h3>

			<!-- Dirty indicator -->
			{#if isDirty}
				<div class="alert alert-warning mb-4 flex items-center gap-2">
					<Icon icon="solar:danger-triangle-bold" width="20" />
					<span>You have unsaved changes</span>
				</div>
			{/if}

			<!-- Success message -->
			{#if importSuccess}
				<div class="alert alert-success mb-4 flex items-center gap-2">
					<Icon icon="solar:check-circle-bold" width="20" />
					<span>Profile imported successfully!</span>
				</div>
			{/if}

			<!-- Import Error -->
			{#if importError}
				<div class="alert alert-error mb-4">
					<span>{importError}</span>
				</div>
			{/if}

			<div class="space-y-4">
				<button
					on:click={handleExport}
					class="btn btn-primary w-full"
				>
					<Icon icon="solar:download-bold" width="20" />
					<span>Download Profile</span>
				</button>

				<button
					on:click={handleImportClick}
					class="btn btn-outline w-full"
					disabled={isImporting}
				>
					{#if isImporting}
						<span class="loading loading-spinner loading-sm"></span>
					{:else}
						<Icon icon="solar:upload-bold" width="20" />
					{/if}
					<span>Upload Profile</span>
				</button>
			</div>

			<div class="text-sm text-base-content/70 mt-4 space-y-2">
				<p>
					<strong>Your data is stored locally</strong> in your browser's localStorage and never
					leaves your device.
				</p>
				<p>
					Download your profile regularly to backup your favorites, playlists, and listening
					history.
				</p>
				<p>
					When uploading a profile, you can choose to merge it with your current data or replace
					everything.
				</p>
			</div>
		</div>
	</div>

	<!-- What's Stored -->
	<div class="card bg-base-200 mb-6">
		<div class="card-body">
			<h3 class="text-xl font-semibold mb-4">What's Included in Your Profile</h3>
			<ul class="space-y-2 text-base-content/80">
				<li class="flex items-start gap-2">
					<Icon icon="solar:heart-bold" width="20" className="text-red-500 flex-shrink-0 mt-0.5" />
					<div>
						<strong>Favorites</strong> - All tracks you've marked as favorites
					</div>
				</li>
				<li class="flex items-start gap-2">
					<Icon icon="solar:playlist-bold" width="20" className="text-primary flex-shrink-0 mt-0.5" />
					<div>
						<strong>Playlists</strong> - Your custom playlists and their tracks
					</div>
				</li>
				<li class="flex items-start gap-2">
					<Icon icon="solar:history-bold" width="20" className="text-base-content/70 flex-shrink-0 mt-0.5" />
					<div>
						<strong>Listening History</strong> - Recently played tracks
					</div>
				</li>
				<li class="flex items-start gap-2">
					<Icon icon="solar:widget-bold" width="20" className="text-base-content/70 flex-shrink-0 mt-0.5" />
					<div>
						<strong>Autoplay Rules</strong> - Your autoplay preferences and weights
					</div>
				</li>
				<li class="flex items-start gap-2">
					<Icon icon="solar:settings-bold" width="20" className="text-base-content/70 flex-shrink-0 mt-0.5" />
					<div>
						<strong>Settings</strong> - Volume, audio quality, and source configuration
					</div>
				</li>
			</ul>
		</div>
	</div>

	<!-- Offline Storage Information -->
	<div class="card bg-base-200">
		<div class="card-body">
			<h3 class="text-xl font-semibold mb-4">
				<Icon icon="solar:download-minimalistic-bold" width="24" className="inline mr-2" />
				Offline Storage
			</h3>

			<!-- Storage stats -->
			<div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
				<div class="stat bg-base-300 rounded-lg p-4">
					<div class="stat-title text-xs">Downloaded Tracks</div>
					<div class="stat-value text-2xl">{offlineStats.tracks}</div>
				</div>
				<div class="stat bg-base-300 rounded-lg p-4">
					<div class="stat-title text-xs">Storage Used</div>
					<div class="stat-value text-xl">{formatBytes(offlineStats.storageUsed)}</div>
				</div>
				<div class="stat bg-base-300 rounded-lg p-4">
					<div class="stat-title text-xs">Storage Quota</div>
					<div class="stat-value text-xl">{formatBytes(offlineStats.storageQuota)}</div>
				</div>
			</div>

			<!-- Orphan Detection -->
			<div class="mb-4">
				<button
					on:click={handleScanOrphans}
					class="btn btn-outline btn-sm gap-2"
				>
					<Icon icon="solar:magnifer-bold" width="16" />
					Find unreferenced cached tracks
				</button>

				{#if orphanScanDone && orphanedTracks.length === 0}
					<div class="alert alert-success mt-3 text-sm">
						<Icon icon="solar:check-circle-bold" width="18" />
						<span>All cached tracks are referenced by your favorites or playlists.</span>
					</div>
				{/if}

				{#if orphanedTracks.length > 0}
					<div class="border border-warning/30 rounded-lg p-3 mt-3">
						<div class="flex items-center justify-between mb-2">
							<span class="text-sm font-medium text-warning">
								{orphanedTracks.length} unreferenced track{orphanedTracks.length > 1 ? 's' : ''} found
							</span>
						</div>

						<!-- Select all -->
						<label class="flex items-center gap-2 text-sm cursor-pointer mb-2 opacity-70">
							<input
								type="checkbox"
								class="checkbox checkbox-sm"
								checked={allOrphansSelected}
								on:change={toggleAllOrphans}
							/>
							Select all
						</label>

						<!-- Track list -->
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
										<span class="text-base-content/40 shrink-0 text-xs">{formatBytesShared(ot.fileSize)}</span>
									{/if}
								</label>
							{/each}
						</div>

						<!-- Remove button -->
						{#if selectedOrphans.size > 0}
							<button
								on:click={removeSelectedOrphans}
								class="btn btn-warning btn-sm w-full mt-3"
							>
								Remove {selectedOrphans.size} track{selectedOrphans.size > 1 ? 's' : ''} ({formatBytesShared(selectedOrphanSize)})
							</button>
						{/if}
					</div>
				{/if}
			</div>

			<div class="space-y-3 text-sm text-base-content/70">
				<div class="alert alert-info">
					<Icon icon="solar:info-circle-bold" width="20" />
					<div class="space-y-2">
						<p>
							<strong>Storage Location:</strong> Offline files are stored in your browser's storage:
						</p>
						<ul class="list-disc list-inside ml-4 space-y-1">
							<li><strong>Audio files:</strong> Cache API (<code class="text-xs bg-base-300 px-1 py-0.5 rounded">dustic-audio-cache</code>)</li>
							<li><strong>Metadata:</strong> IndexedDB (<code class="text-xs bg-base-300 px-1 py-0.5 rounded">dustic-offline</code>)</li>
						</ul>
					</div>
				</div>

				<div class="alert alert-warning">
					<Icon icon="solar:danger-triangle-bold" width="20" />
					<div>
						<p><strong>Important:</strong> Offline files cannot be exported or synced across devices due to browser security restrictions. Downloaded tracks must be re-downloaded on each device where you want offline access.</p>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
