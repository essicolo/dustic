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
	import type { UserProfile, WebDAVConfig } from '$lib/types';
	import { testWebDAVConnection, uploadProfileToWebDAV, downloadProfileFromWebDAV, checkProfileExists } from '$lib/services/webdav';
	import { base } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import { onMount } from 'svelte';

	let fileInput: HTMLInputElement;
	let isImporting = false;
	let importError = '';
	let importSuccess = false;
	let pendingImport: UserProfile | null = null;

	// Orphan detection state
	let orphanedTracks: OfflineTrack[] = [];
	let selectedOrphans: Set<string> = new Set();
	let orphanScanDone = false;

	// WebDAV sync state
	let webdavConfig: WebDAVConfig = $settings.webdav || {
		url: '',
		username: '',
		password: '',
		enabled: false,
		autoSync: false
	};
	let webdavTestStatus: 'idle' | 'testing' | 'success' | 'error' = 'idle';
	let webdavTestMessage = '';
	let webdavSyncStatus: 'idle' | 'uploading' | 'downloading' | 'success' | 'error' = 'idle';
	let webdavSyncMessage = '';
	let showWebdavPassword = false;

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

		importError = '';
		importSuccess = false;

		try {
			const imported = await importProfile(file);
			pendingImport = imported;
		} catch (error) {
			importError = error instanceof Error ? error.message : 'Failed to import profile';
		} finally {
			input.value = '';
		}
	}

	async function applyImport(mode: 'merge' | 'replace') {
		if (!pendingImport) return;

		try {
			importError = '';

			if (mode === 'merge') {
				const current = createDefaultProfile();
				current.favorites = $library.favorites;
				current.playlists = $library.playlists;
				current.history = $history.entries;
				current.autoplayRules = $autoplayStore.rules;

				const merged = mergeProfiles(current, pendingImport);
				await loadProfile(merged);
			} else {
				await loadProfile(pendingImport);
			}

			library.markClean();
			history.markClean();
			pendingImport = null;
			importSuccess = true;
			setTimeout(() => { importSuccess = false; }, 3000);
		} catch (error) {
			console.error('[Settings] Import failed:', error);
			importError = 'Failed to save profile. Please try again.';
		}
	}

	function cancelImport() {
		pendingImport = null;
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
		// CRITICAL for iOS PWA: Wait for BOTH storages to complete before continuing
		// This ensures the profile is fully persisted even if user closes app immediately
		console.log('[Settings] Persisting imported profile...');
		await saveToStorage(profile);
		console.log('[Settings] Profile import complete and persisted');
	}

	// WebDAV functions
	async function testWebdavConnection() {
		webdavTestStatus = 'testing';
		webdavTestMessage = '';

		try {
			const result = await testWebDAVConnection(webdavConfig);
			if (result.success) {
				webdavTestStatus = 'success';
				webdavTestMessage = 'Connection successful!';
			} else {
				webdavTestStatus = 'error';
				webdavTestMessage = result.error || 'Connection failed. Check your credentials.';
			}
		} catch (error) {
			webdavTestStatus = 'error';
			webdavTestMessage = error instanceof Error ? error.message : 'Connection failed';
		}

		setTimeout(() => {
			webdavTestStatus = 'idle';
			webdavTestMessage = '';
		}, 5000); // Longer timeout for error messages
	}

	function saveWebdavConfig() {
		settings.setWebDAVConfig(webdavConfig);
		webdavTestMessage = 'Configuration saved!';
		setTimeout(() => { webdavTestMessage = ''; }, 2000);
	}

	async function uploadToWebdav() {
		if (!webdavConfig.enabled || !webdavConfig.url) {
			webdavSyncMessage = 'Please configure and enable WebDAV first';
			webdavSyncStatus = 'error';
			setTimeout(() => { webdavSyncStatus = 'idle'; webdavSyncMessage = ''; }, 3000);
			return;
		}

		webdavSyncStatus = 'uploading';
		webdavSyncMessage = '';

		try {
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
					favoriteInfluencedAutoplay: $settings.favoriteInfluencedAutoplay,
					webdav: webdavConfig
				}
			};

			await uploadProfileToWebDAV(profile, webdavConfig);
			settings.updateWebDAVLastSync(Date.now());
			webdavConfig.lastSync = Date.now();

			webdavSyncStatus = 'success';
			webdavSyncMessage = 'Profile uploaded successfully!';

			library.markClean();
			history.markClean();
		} catch (error) {
			webdavSyncStatus = 'error';
			webdavSyncMessage = error instanceof Error ? error.message : 'Upload failed';
		}

		setTimeout(() => {
			webdavSyncStatus = 'idle';
			webdavSyncMessage = '';
		}, 3000);
	}

	async function downloadFromWebdav() {
		if (!webdavConfig.enabled || !webdavConfig.url) {
			webdavSyncMessage = 'Please configure and enable WebDAV first';
			webdavSyncStatus = 'error';
			setTimeout(() => { webdavSyncStatus = 'idle'; webdavSyncMessage = ''; }, 3000);
			return;
		}

		webdavSyncStatus = 'downloading';
		webdavSyncMessage = '';

		try {
			const profile = await downloadProfileFromWebDAV(webdavConfig);
			await loadProfile(profile);
			settings.updateWebDAVLastSync(Date.now());
			webdavConfig.lastSync = Date.now();

			webdavSyncStatus = 'success';
			webdavSyncMessage = 'Profile downloaded and applied successfully!';
		} catch (error) {
			webdavSyncStatus = 'error';
			webdavSyncMessage = error instanceof Error ? error.message : 'Download failed';
		}

		setTimeout(() => {
			webdavSyncStatus = 'idle';
			webdavSyncMessage = '';
		}, 3000);
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
					<span>Profile imported and saved successfully! Safe to close app.</span>
				</div>
			{/if}

			<!-- Import Error -->
			{#if importError}
				<div class="alert alert-error mb-4">
					<span>{importError}</span>
				</div>
			{/if}

			<!-- Merge or Replace choice -->
			{#if pendingImport}
				<div class="alert mb-4">
					<div class="w-full">
						<p class="mb-3">Profile loaded. How do you want to import it?</p>
						<div class="flex gap-2">
							<button on:click={() => applyImport('merge')} class="btn btn-primary btn-sm flex-1">
								Merge
							</button>
							<button on:click={() => applyImport('replace')} class="btn btn-outline btn-sm flex-1">
								Replace
							</button>
							<button on:click={cancelImport} class="btn btn-ghost btn-sm">
								Cancel
							</button>
						</div>
					</div>
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

	<!-- WebDAV Sync -->
	<div class="card bg-base-200 mb-6">
		<div class="card-body">
			<h3 class="text-xl font-semibold mb-4">
				<Icon icon="solar:cloud-bold" width="24" className="inline mr-2" />
				WebDAV Sync
			</h3>
			<p class="text-sm text-base-content/70 mb-4">
				Automatically sync your profile to a WebDAV server.
			</p>

			<!-- Status messages -->
			{#if webdavTestMessage}
				<div class="alert mb-4"
					class:alert-success={webdavTestStatus === 'success'}
					class:alert-error={webdavTestStatus === 'error'}
				>
					<span>{webdavTestMessage}</span>
				</div>
			{/if}

			{#if webdavSyncMessage}
				<div class="alert mb-4"
					class:alert-success={webdavSyncStatus === 'success'}
					class:alert-error={webdavSyncStatus === 'error'}
				>
					<span>{webdavSyncMessage}</span>
				</div>
			{/if}

			<!-- Configuration form -->
			<div class="space-y-4">
				<!-- Enable toggle -->
				<div class="flex items-center gap-3">
					<input
						type="checkbox"
						class="toggle toggle-primary"
						bind:checked={webdavConfig.enabled}
					/>
					<span class="text-sm font-medium">Enable WebDAV Sync</span>
				</div>

				<!-- Server URL -->
				<div class="form-control">
					<label class="label">
						<span class="label-text">WebDAV Server URL</span>
					</label>
					<input
						type="url"
						bind:value={webdavConfig.url}
						placeholder="https://example.com/remote.php/dav/files/username/"
						class="input input-bordered"
						disabled={!webdavConfig.enabled}
					/>
					<label class="label">
						<span class="label-text-alt">Base WebDAV URL (without filename)</span>
					</label>
				</div>

				<!-- Username -->
				<div class="form-control">
					<label class="label">
						<span class="label-text">Username</span>
					</label>
					<input
						type="text"
						bind:value={webdavConfig.username}
						placeholder="username"
						class="input input-bordered"
						disabled={!webdavConfig.enabled}
					/>
				</div>

				<!-- Password -->
				<div class="form-control">
					<label class="label">
						<span class="label-text">Password</span>
					</label>
					<div class="relative">
						<input
							type={showWebdavPassword ? 'text' : 'password'}
							bind:value={webdavConfig.password}
							placeholder="password or app token"
							class="input input-bordered w-full pr-10"
							disabled={!webdavConfig.enabled}
						/>
						<button
							type="button"
							class="btn btn-ghost btn-sm btn-square absolute right-1 top-1"
							on:click={() => showWebdavPassword = !showWebdavPassword}
							disabled={!webdavConfig.enabled}
						>
							<Icon icon={showWebdavPassword ? 'solar:eye-bold' : 'solar:eye-closed-bold'} width="20" />
						</button>
					</div>
					<label class="label">
						<span class="label-text-alt">Use an app-specific password if your server requires it</span>
					</label>
				</div>

				<!-- Auto-sync toggle -->
				<div class="flex items-center gap-3">
					<input
						type="checkbox"
						class="toggle toggle-primary toggle-sm"
						bind:checked={webdavConfig.autoSync}
						disabled={!webdavConfig.enabled}
					/>
					<span class="text-sm">Auto-sync on changes</span>
				</div>

				<!-- Last sync timestamp -->
				{#if webdavConfig.lastSync}
					<div class="text-sm text-base-content/60">
						Last synced: {new Date(webdavConfig.lastSync).toLocaleString()}
					</div>
				{/if}

				<!-- Action buttons -->
				<div class="flex flex-wrap gap-2 pt-2">
					<button
						class="btn btn-sm btn-outline"
						on:click={testWebdavConnection}
						disabled={!webdavConfig.enabled || !webdavConfig.url || webdavTestStatus === 'testing'}
					>
						{#if webdavTestStatus === 'testing'}
							<span class="loading loading-spinner loading-sm"></span>
						{:else}
							<Icon icon="solar:wifi-router-bold" width="16" />
						{/if}
						Test Connection
					</button>

					<button
						class="btn btn-sm btn-primary"
						on:click={saveWebdavConfig}
						disabled={!webdavConfig.enabled}
					>
						<Icon icon="solar:diskette-bold" width="16" />
						Save Configuration
					</button>

					<button
						class="btn btn-sm btn-success"
						on:click={uploadToWebdav}
						disabled={!webdavConfig.enabled || !webdavConfig.url || webdavSyncStatus === 'uploading'}
					>
						{#if webdavSyncStatus === 'uploading'}
							<span class="loading loading-spinner loading-sm"></span>
						{:else}
							<Icon icon="solar:upload-bold" width="16" />
						{/if}
						Upload to Server
					</button>

					<button
						class="btn btn-sm btn-info"
						on:click={downloadFromWebdav}
						disabled={!webdavConfig.enabled || !webdavConfig.url || webdavSyncStatus === 'downloading'}
					>
						{#if webdavSyncStatus === 'downloading'}
							<span class="loading loading-spinner loading-sm"></span>
						{:else}
							<Icon icon="solar:download-bold" width="16" />
						{/if}
						Download from Server
					</button>
				</div>
			</div>
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
