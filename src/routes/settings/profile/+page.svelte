<script lang="ts">
	import { devLog } from '$lib/utils/logger';
	import { library } from '$lib/stores/library';
	import { history } from '$lib/stores/history';
	import { autoplayStore } from '$lib/stores/autoplay';
	import { player } from '$lib/stores/player';
	import { settings } from '$lib/stores/settings';
	import { exportProfile, importProfile, createDefaultProfile, mergeProfiles } from '$lib/services/storage';
	import { saveToStorage } from '$lib/services/persistence';
	import type { UserProfile, WebDAVConfig } from '$lib/types';
	import { testWebDAVConnection, uploadProfileToWebDAV, downloadProfileFromWebDAV, checkProfileExists } from '$lib/services/webdav';
	import { encryptValue, decryptValue } from '$lib/services/crypto';
	import { base } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import { onMount } from 'svelte';
	import { _ } from '$lib/i18n';

	let fileInput: HTMLInputElement;
	let isImporting = false;
	let importError = '';
	let importSuccess = false;
	let pendingImport: UserProfile | null = null;


	// WebDAV sync state
	let webdavConfig: WebDAVConfig = $settings.webdav || {
		url: '',
		username: '',
		password: '',
		enabled: false,
		autoSyncMinutes: 0
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


	onMount(async () => {
		// Decrypt the stored password for display in the settings form
		if (webdavConfig.password) {
			webdavConfig.password = await decryptValue(webdavConfig.password);
		}
		// Enable auto-save after initial values are set (avoids saving on first load)
		webdavInitialized = true;
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

		importError = '';
		importSuccess = false;

		try {
			const imported = await importProfile(file);
			pendingImport = imported;
		} catch (error) {
			importError = error instanceof Error ? error.message : $_('settings.profile.importFailedFile');
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
			importError = $_('settings.profile.importFailedSave');
		}
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
			// (legacy `favoriteInfluencedAutoplay` from older exports is
			// silently dropped — that toggle was replaced by the
			// per-rule weight slider in the autoplay editor.)
		}

		// Persist the imported profile to both localStorage and IndexedDB immediately
		// CRITICAL for iOS PWA: Wait for BOTH storages to complete before continuing
		// This ensures the profile is fully persisted even if user closes app immediately
		devLog('[Settings] Persisting imported profile...');
		await saveToStorage(profile);
		devLog('[Settings] Profile import complete and persisted');
	}

	// WebDAV functions
	async function testWebdavConnection() {
		webdavTestStatus = 'testing';
		webdavTestMessage = '';

		try {
			const result = await testWebDAVConnection(webdavConfig);
			if (result.success) {
				webdavTestStatus = 'success';
				webdavTestMessage = $_('settings.profile.connSuccess');
			} else {
				webdavTestStatus = 'error';
				webdavTestMessage = result.error || $_('settings.profile.connFailed');
			}
		} catch (error) {
			webdavTestStatus = 'error';
			webdavTestMessage = error instanceof Error ? error.message : $_('settings.profile.connError');
		}

		setTimeout(() => {
			webdavTestStatus = 'idle';
			webdavTestMessage = '';
		}, 5000); // Longer timeout for error messages
	}

	// Auto-save WebDAV config when any field changes (debounced)
	let webdavSaveTimeout: ReturnType<typeof setTimeout> | null = null;
	let webdavInitialized = false;
	$: if (webdavInitialized && webdavConfig) {
		if (webdavSaveTimeout) clearTimeout(webdavSaveTimeout);
		webdavSaveTimeout = setTimeout(() => saveWebdavConfig(), 1000);
	}

	async function saveWebdavConfig() {
		const configToSave = {
			...webdavConfig,
			password: webdavConfig.password ? await encryptValue(webdavConfig.password) : ''
		};
		settings.setWebDAVConfig(configToSave);
	}

	async function uploadToWebdav() {
		if (!webdavConfig.enabled || !webdavConfig.url) {
			webdavSyncMessage = $_('settings.profile.configFirst');
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
					webdav: webdavConfig
				}
			};

			await uploadProfileToWebDAV(profile, webdavConfig);
			settings.updateWebDAVLastSync(Date.now());
			webdavConfig.lastSync = Date.now();

			webdavSyncStatus = 'success';
			webdavSyncMessage = $_('settings.profile.uploadOk');

			library.markClean();
			history.markClean();
		} catch (error) {
			webdavSyncStatus = 'error';
			webdavSyncMessage = error instanceof Error ? error.message : $_('settings.profile.uploadFailed');
		}

		setTimeout(() => {
			webdavSyncStatus = 'idle';
			webdavSyncMessage = '';
		}, 3000);
	}

	async function downloadFromWebdav() {
		if (!webdavConfig.enabled || !webdavConfig.url) {
			webdavSyncMessage = $_('settings.profile.configFirst');
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
			webdavSyncMessage = $_('settings.profile.downloadOk');
		} catch (error) {
			webdavSyncStatus = 'error';
			webdavSyncMessage = error instanceof Error ? error.message : $_('settings.profile.downloadFailed');
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

<!-- Profile Statistics -->
	<div class="mb-8 border-t border-base-300 pt-6">
		<div class="space-y-1">
			<h3 class="text-xl font-semibold mb-4">{$_('settings.profile.statsTitle')}</h3>
			<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
				<div class="stat bg-base-300 rounded-lg p-4">
					<div class="stat-title text-xs">{$_('settings.profile.statFavorites')}</div>
					<div class="stat-value text-2xl">{stats.favorites}</div>
				</div>
				<div class="stat bg-base-300 rounded-lg p-4">
					<div class="stat-title text-xs">{$_('settings.profile.statPlaylists')}</div>
					<div class="stat-value text-2xl">{stats.playlists}</div>
				</div>
				<div class="stat bg-base-300 rounded-lg p-4">
					<div class="stat-title text-xs">{$_('settings.profile.statPlaylistTracks')}</div>
					<div class="stat-value text-2xl">{stats.playlistTracks}</div>
				</div>
				<div class="stat bg-base-300 rounded-lg p-4">
					<div class="stat-title text-xs">{$_('settings.profile.statHistory')}</div>
					<div class="stat-value text-2xl">{stats.historyEntries}</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Profile Management -->
	<div class="mb-8 border-t border-base-300 pt-6">
		<div class="space-y-1">
			<h3 class="text-xl font-semibold mb-4">{$_('settings.profile.backupTitle')}</h3>

			<!-- Dirty indicator -->
			{#if isDirty}
				<div class="alert alert-warning mb-4 flex items-center gap-2">
					<Icon icon="solar:danger-triangle-bold" width="20" />
					<span>{$_('settings.profile.unsavedChanges')}</span>
				</div>
			{/if}

			<!-- Success message -->
			{#if importSuccess}
				<div class="alert alert-success mb-4 flex items-center gap-2">
					<Icon icon="solar:check-circle-bold" width="20" />
					<span>{$_('settings.profile.importSuccess')}</span>
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
						<p class="mb-3">{$_('settings.profile.pendingPrompt')}</p>
						<div class="flex gap-2">
							<button on:click={() => applyImport('merge')} class="btn btn-primary btn-sm flex-1">
								{$_('settings.profile.merge')}
							</button>
							<button on:click={() => applyImport('replace')} class="btn btn-outline btn-sm flex-1">
								{$_('settings.profile.replace')}
							</button>
							<button on:click={cancelImport} class="btn btn-ghost btn-sm">
								{$_('common.cancel')}
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
					<span>{$_('settings.profile.downloadProfile')}</span>
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
					<span>{$_('settings.profile.uploadProfile')}</span>
				</button>
			</div>

			<div class="text-sm text-base-content/70 mt-4 space-y-2">
				<p>
					<strong>{$_('settings.profile.backupHelp1Strong')}</strong>{$_('settings.profile.backupHelp1Rest')}
				</p>
				<p>
					{$_('settings.profile.backupHelp2')}
				</p>
				<p>
					{$_('settings.profile.backupHelp3')}
				</p>
			</div>
		</div>
	</div>

	<!-- What's Stored -->
	<div class="mb-8 border-t border-base-300 pt-6">
		<div class="space-y-1">
			<h3 class="text-xl font-semibold mb-4">{$_('settings.profile.includedTitle')}</h3>
			<ul class="space-y-2 text-base-content/80">
				<li class="flex items-start gap-2">
					<Icon icon="solar:heart-bold" width="20" className="text-primary flex-shrink-0 mt-0.5" />
					<div>
						<strong>{$_('settings.profile.included.favoritesStrong')}</strong>{$_('settings.profile.included.favoritesRest')}
					</div>
				</li>
				<li class="flex items-start gap-2">
					<Icon icon="solar:playlist-bold" width="20" className="text-primary flex-shrink-0 mt-0.5" />
					<div>
						<strong>{$_('settings.profile.included.playlistsStrong')}</strong>{$_('settings.profile.included.playlistsRest')}
					</div>
				</li>
				<li class="flex items-start gap-2">
					<Icon icon="solar:history-bold" width="20" className="text-base-content/70 flex-shrink-0 mt-0.5" />
					<div>
						<strong>{$_('settings.profile.included.historyStrong')}</strong>{$_('settings.profile.included.historyRest')}
					</div>
				</li>
				<li class="flex items-start gap-2">
					<Icon icon="solar:widget-bold" width="20" className="text-base-content/70 flex-shrink-0 mt-0.5" />
					<div>
						<strong>{$_('settings.profile.included.autoplayStrong')}</strong>{$_('settings.profile.included.autoplayRest')}
					</div>
				</li>
				<li class="flex items-start gap-2">
					<Icon icon="solar:settings-bold" width="20" className="text-base-content/70 flex-shrink-0 mt-0.5" />
					<div>
						<strong>{$_('settings.profile.included.settingsStrong')}</strong>{$_('settings.profile.included.settingsRest')}
					</div>
				</li>
			</ul>
		</div>
	</div>

	<!-- WebDAV Sync -->
	<div class="mb-8 border-t border-base-300 pt-6">
		<div class="space-y-1">
			<h3 class="text-xl font-semibold mb-4">
				<Icon icon="solar:cloud-bold" width="24" className="inline mr-2" />
				{$_('settings.profile.webdavTitle')}
			</h3>
			<p class="text-sm text-base-content/70 mb-4">
				{$_('settings.profile.webdavSubtitle')}
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
					<span class="text-sm font-medium">{$_('settings.profile.webdavEnable')}</span>
				</div>

				{#if webdavConfig.enabled}
					<div class="alert alert-warning text-xs">
						<Icon icon="solar:lock-keyhole-bold" width="18" />
						<div>
							<p>{$_('settings.profile.webdavWarn')}</p>
						</div>
					</div>
				{/if}

				<!-- Server URL -->
				<div class="form-control">
					<label class="label">
						<span class="label-text">{$_('settings.profile.webdavUrlLabel')}</span>
					</label>
					<input
						type="url"
						bind:value={webdavConfig.url}
						placeholder={$_('settings.profile.webdavUrlPlaceholder')}
						class="input input-bordered"
						disabled={!webdavConfig.enabled}
					/>
					<label class="label">
						<span class="label-text-alt">{$_('settings.profile.webdavUrlHelp')}</span>
					</label>
				</div>

				<!-- Username -->
				<div class="form-control">
					<label class="label">
						<span class="label-text">{$_('settings.profile.webdavUsernameLabel')}</span>
					</label>
					<input
						type="text"
						bind:value={webdavConfig.username}
						placeholder={$_('settings.profile.webdavUsernamePlaceholder')}
						class="input input-bordered"
						disabled={!webdavConfig.enabled}
					/>
				</div>

				<!-- Password -->
				<div class="form-control">
					<label class="label">
						<span class="label-text">{$_('settings.profile.webdavPasswordLabel')}</span>
					</label>
					<div class="relative">
						<input
							type={showWebdavPassword ? 'text' : 'password'}
							bind:value={webdavConfig.password}
							placeholder={$_('settings.profile.webdavPasswordPlaceholder')}
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
						<span class="label-text-alt">{$_('settings.profile.webdavPasswordHelp')}</span>
					</label>
				</div>

				<!-- Auto-sync interval -->
				<div class="form-control">
					<label class="label">
						<span class="label-text text-sm">{$_('settings.profile.webdavIntervalLabel')}</span>
					</label>
					<input
						type="number"
						min="0"
						step="1"
						bind:value={webdavConfig.autoSyncMinutes}
						disabled={!webdavConfig.enabled}
						placeholder="0"
						class="input input-bordered input-sm w-24"
					/>
					<label class="label">
						<span class="label-text-alt">{$_('settings.profile.webdavIntervalHelp')}</span>
					</label>
				</div>

				<!-- Last sync timestamp -->
				{#if webdavConfig.lastSync}
					<div class="text-sm text-base-content/60">
						{$_('settings.profile.webdavLastSynced', { values: { date: new Date(webdavConfig.lastSync).toLocaleString() } })}
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
							<Icon icon="solar:wi-fi-router-bold" width="16" />
						{/if}
						{$_('settings.profile.testConnection')}
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
						{$_('settings.profile.uploadToServer')}
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
						{$_('settings.profile.downloadFromServer')}
					</button>
				</div>
			</div>
		</div>
	</div>

	<!-- Offline storage moved to its own settings tab -->
	<div class="border-t border-base-300 pt-6">
		<a href="{base}/settings/offline" class="btn btn-outline btn-sm gap-2">
			<Icon icon="solar:download-minimalistic-bold" width="16" />
			{$_('settings.offline.manageLink')}
		</a>
	</div>
