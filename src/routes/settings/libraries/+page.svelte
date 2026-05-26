<script lang="ts">
	import { settings } from '$lib/stores/settings';
	import type { WebDAVLibrary } from '$lib/types';
	import { testLibrary } from '$lib/services/webdavLibrary';
	import { encryptValue, decryptValue } from '$lib/services/crypto';
	import { DEFAULT_FUNKWHALE_INSTANCES } from '$lib/utils/constants';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { _ } from '$lib/i18n';

	let libraries: WebDAVLibrary[] = [];

	// FunkWhale instance management
	let newInstanceUrl = '';
	let newInstanceName = '';
	let addInstanceError = '';
	$: funkwhaleInstances = $settings.funkwhaleInstances || DEFAULT_FUNKWHALE_INSTANCES;
	$: iaEnabled = $settings.iaEnabled !== false;

	function addInstance() {
		addInstanceError = '';
		const url = newInstanceUrl.trim();
		const name = newInstanceName.trim();
		if (!url) {
			addInstanceError = $_('settings.libraries.errUrlRequired');
			return;
		}
		try {
			new URL(url);
		} catch {
			addInstanceError = $_('settings.libraries.errInvalidUrl');
			return;
		}
		settings.addFunkwhaleInstance(url, name || new URL(url).host);
		newInstanceUrl = '';
		newInstanceName = '';
	}

	// Working copy for the "add new" form
	let form: WebDAVLibrary = blankForm();
	let showPassword = false;
	let testStatus: 'idle' | 'testing' | 'success' | 'error' = 'idle';
	let testMessage = '';
	let editingId: string | null = null;

	function blankForm(): WebDAVLibrary {
		return {
			id: '',
			name: '',
			url: '',
			username: '',
			password: '',
			rootPath: '/',
			enabled: true
		};
	}

	onMount(async () => {
		await refresh();
	});

	async function refresh() {
		// Decrypt passwords for display in the edit form
		const raw = settings.getWebDAVLibraries();
		libraries = await Promise.all(
			raw.map(async (l) => ({ ...l, password: await decryptValue(l.password) }))
		);
	}

	async function handleTest() {
		testStatus = 'testing';
		testMessage = '';
		try {
			const candidate: WebDAVLibrary = {
				...form,
				password: await encryptValue(form.password)
			};
			const result = await testLibrary(candidate);
			if (result.ok) {
				testStatus = 'success';
				testMessage = $_('settings.libraries.connSuccess');
			} else {
				testStatus = 'error';
				testMessage = result.error || $_('settings.libraries.connFailed');
			}
		} catch (err) {
			testStatus = 'error';
			testMessage = err instanceof Error ? err.message : $_('settings.libraries.unknownError');
		}
		setTimeout(() => {
			testStatus = 'idle';
			testMessage = '';
		}, 6000);
	}

	async function handleSave() {
		if (!form.name || !form.url || !form.username) return;
		const id = editingId || crypto.randomUUID();
		const encryptedPassword = form.password ? await encryptValue(form.password) : '';
		const lib: WebDAVLibrary = {
			...form,
			id,
			password: encryptedPassword,
			rootPath: form.rootPath || '/'
		};
		if (editingId) {
			settings.updateWebDAVLibrary(id, lib);
		} else {
			settings.addWebDAVLibrary(lib);
		}
		form = blankForm();
		editingId = null;
		await refresh();
	}

	function handleEdit(lib: WebDAVLibrary) {
		form = { ...lib };
		editingId = lib.id;
	}

	function handleCancelEdit() {
		form = blankForm();
		editingId = null;
	}

	function handleRemove(lib: WebDAVLibrary) {
		if (!confirm($_('settings.libraries.removeConfirm', { values: { name: lib.name } }))) return;
		settings.removeWebDAVLibrary(lib.id);
		refresh();
	}

	function handleToggle(lib: WebDAVLibrary) {
		settings.toggleWebDAVLibrary(lib.id);
		refresh();
	}
</script>

<svelte:head>
	<title>{$_('settings.libraries.pageTitle')}</title>
</svelte:head>

<p class="mb-6 text-sm opacity-70">
		{$_('settings.libraries.intro')}
	</p>

	<!-- Internet Archive -->
	<section class="card bg-base-200 p-4 mb-4">
		<div class="flex items-center gap-3">
			<img src="{base}/internet-archive-icon.svg" alt="Internet Archive" class="w-6 h-6" />
			<div class="flex-1 min-w-0">
				<div class="font-semibold">{$_('settings.libraries.iaTitle')}</div>
				<div class="text-xs opacity-60">
					{$_('settings.libraries.iaSubtitle')}
				</div>
			</div>
			<input
				type="checkbox"
				class="toggle toggle-primary toggle-sm"
				checked={iaEnabled}
				on:change={(e) => settings.setIaEnabled(e.currentTarget.checked)}
			/>
		</div>
	</section>

	<!-- FunkWhale -->
	<section class="card bg-base-200 p-4 mb-4">
		<div class="flex items-center gap-3 mb-3">
			<img src="{base}/funkwhale-icon.svg" alt="FunkWhale" class="w-6 h-6" />
			<div class="flex-1 min-w-0">
				<div class="font-semibold">{$_('settings.libraries.fwTitle')}</div>
				<div class="text-xs opacity-60">
					{$_('settings.libraries.fwSubtitle')}
				</div>
			</div>
		</div>

		<div class="space-y-2 mb-3">
			{#each funkwhaleInstances as instance}
				<div class="flex items-center gap-3 p-2 border border-base-300 rounded"
					class:opacity-50={!instance.enabled}
				>
					<input
						type="checkbox"
						class="toggle toggle-primary toggle-sm"
						checked={instance.enabled}
						on:change={() => settings.toggleFunkwhaleInstance(instance.url)}
					/>
					<div class="flex-1 min-w-0">
						<div class="text-sm font-medium truncate">{instance.name}</div>
						<div class="text-xs opacity-50 truncate">{instance.url}</div>
					</div>
					<button
						class="btn btn-ghost btn-xs btn-square"
						title={$_('settings.libraries.remove')}
						on:click={() => settings.removeFunkwhaleInstance(instance.url)}
					>
						<Icon icon="solar:close-circle-bold" width="16" />
					</button>
				</div>
			{/each}
			{#if funkwhaleInstances.length === 0}
				<p class="text-sm opacity-50 italic">{$_('settings.libraries.fwNone')}</p>
			{/if}
		</div>

		<details class="border-t border-base-content/10 pt-3">
			<summary class="cursor-pointer text-sm font-medium opacity-70 mb-2">
				{$_('settings.libraries.fwAddSummary')}
			</summary>
			<div class="space-y-2 mt-2">
				<input
					type="url"
					bind:value={newInstanceUrl}
					placeholder={$_('settings.libraries.fwUrlPlaceholder')}
					class="input input-bordered input-sm w-full"
					on:keydown={(e) => e.key === 'Enter' && addInstance()}
				/>
				<input
					type="text"
					bind:value={newInstanceName}
					placeholder={$_('settings.libraries.fwNamePlaceholder')}
					class="input input-bordered input-sm w-full"
					on:keydown={(e) => e.key === 'Enter' && addInstance()}
				/>
				<button class="btn btn-primary btn-sm w-full sm:w-auto" on:click={addInstance}>
					{$_('settings.libraries.fwAddButton')}
				</button>
				{#if addInstanceError}
					<p class="text-error text-xs">{addInstanceError}</p>
				{/if}
			</div>
		</details>
	</section>

	<!-- Your folders -->
	<section class="card bg-base-200 p-4 mb-4">
		<div class="flex items-center gap-3 mb-3">
			<Icon icon="mdi:folder-music" width="24" />
			<div class="flex-1 min-w-0">
				<div class="font-semibold">{$_('settings.libraries.foldersTitle')}</div>
				<div class="text-xs opacity-60">
					{$_('settings.libraries.foldersSubtitle')}
				</div>
			</div>
		</div>

	<!-- Existing libraries list -->
	{#if libraries.length > 0}
		<ul class="space-y-2">
			{#each libraries as lib (lib.id)}
				<li class="p-3 border border-base-300 rounded">
					<div class="flex items-center gap-3">
						<input
							type="checkbox"
							class="toggle toggle-primary toggle-sm"
							checked={lib.enabled}
							on:change={() => handleToggle(lib)}
						/>
						<div class="flex-1 min-w-0">
							<div class="font-medium truncate">{lib.name}</div>
							<div class="text-xs opacity-60 truncate">{lib.url}{lib.rootPath}</div>
						</div>
						<a
							href="{base}/library/webdav/{lib.id}"
							class="btn btn-sm btn-ghost"
							title={$_('settings.libraries.browse')}
							aria-label={$_('settings.libraries.browseAria', { values: { name: lib.name } })}
						>
							<Icon icon="mdi:folder-open" width="18" />
						</a>
						<button
							class="btn btn-sm btn-ghost"
							on:click={() => handleEdit(lib)}
							title={$_('settings.libraries.edit')}
							aria-label={$_('settings.libraries.editAria', { values: { name: lib.name } })}
						>
							<Icon icon="mdi:pencil" width="18" />
						</button>
						<button
							class="btn btn-sm btn-ghost text-error"
							on:click={() => handleRemove(lib)}
							title={$_('settings.libraries.remove')}
							aria-label={$_('settings.libraries.removeAria', { values: { name: lib.name } })}
						>
							<Icon icon="mdi:trash-can" width="18" />
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	<!-- Add/edit form -->
	<details class="mt-4" open={libraries.length === 0 || editingId !== null}>
		<summary class="cursor-pointer text-sm font-medium opacity-70 mb-2">
			{editingId ? $_('settings.libraries.editSummary') : $_('settings.libraries.connectSummary')}
		</summary>
	<form on:submit|preventDefault={handleSave} class="bg-base-100 border border-base-300 p-4 rounded space-y-3">
		<label class="form-control">
			<span class="label-text">{$_('settings.libraries.nicknameLabel')}</span>
			<input
				type="text"
				placeholder={$_('settings.libraries.nicknamePlaceholder')}
				class="input input-bordered"
				bind:value={form.name}
				required
			/>
		</label>

		<label class="form-control">
			<span class="label-text">{$_('settings.libraries.urlLabel')}</span>
			<input
				type="url"
				placeholder={$_('settings.libraries.urlPlaceholder')}
				class="input input-bordered"
				bind:value={form.url}
				required
			/>
			<span class="label-text-alt opacity-60">
				{$_('settings.libraries.urlHelp')}
			</span>
		</label>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
			<label class="form-control">
				<span class="label-text">{$_('settings.libraries.usernameLabel')}</span>
				<input
					type="text"
					class="input input-bordered"
					bind:value={form.username}
					autocomplete="username"
					required
				/>
			</label>

			<label class="form-control">
				<span class="label-text">{$_('settings.libraries.passwordLabel')}</span>
				<div class="join">
					<input
						type={showPassword ? 'text' : 'password'}
						class="input input-bordered join-item w-full"
						bind:value={form.password}
						autocomplete="current-password"
					/>
					<button
						type="button"
						class="btn join-item"
						on:click={() => (showPassword = !showPassword)}
					>
						<Icon icon={showPassword ? 'mdi:eye-off' : 'mdi:eye'} width="18" />
					</button>
				</div>
			</label>
		</div>

		<label class="form-control">
			<span class="label-text">{$_('settings.libraries.rootPathLabel')}</span>
			<input
				type="text"
				placeholder={$_('settings.libraries.rootPathPlaceholder')}
				class="input input-bordered"
				bind:value={form.rootPath}
			/>
			<span class="label-text-alt opacity-60">
				{$_('settings.libraries.rootPathHelp')}
			</span>
		</label>

		<div class="flex flex-wrap gap-2">
			<button type="submit" class="btn btn-primary">
				{editingId ? $_('settings.libraries.saveBtn') : $_('settings.libraries.connectBtn')}
			</button>
			<button type="button" class="btn btn-ghost" on:click={handleTest} disabled={testStatus === 'testing'}>
				{testStatus === 'testing' ? $_('settings.libraries.testing') : $_('settings.libraries.testBtn')}
			</button>
			{#if editingId}
				<button type="button" class="btn btn-ghost" on:click={handleCancelEdit}>{$_('common.cancel')}</button>
			{/if}
		</div>

		{#if testStatus === 'success'}
			<div class="alert alert-success py-2 text-sm">{testMessage}</div>
		{:else if testStatus === 'error'}
			<div class="alert alert-error py-2 text-sm">
				<div class="font-medium">{testMessage}</div>
				<div class="text-xs opacity-80 mt-1">
					{$_('settings.libraries.errExplain')}
				</div>
			</div>
		{/if}
	</form>
	</details>
	</section>

	<details class="mt-2">
		<summary class="cursor-pointer text-xs opacity-60 ml-2">{$_('settings.libraries.helpSummary')}</summary>
		<div class="mt-2 text-sm opacity-70 space-y-2">
			<p>
				{@html $_('settings.libraries.helpKoofr1')}<br />
				{$_('settings.libraries.helpKoofr2')}
			</p>
			<p>
				{@html $_('settings.libraries.helpNextcloud1')}<br />
				{$_('settings.libraries.helpNextcloud2')}
			</p>
			<p>
				{@html $_('settings.libraries.helpPCloud1')}
			</p>
		</div>
	</details>
