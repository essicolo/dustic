<script lang="ts">
	import { settings } from '$lib/stores/settings';
	import type { WebDAVLibrary } from '$lib/types';
	import { testLibrary } from '$lib/services/webdavLibrary';
	import { encryptValue, decryptValue } from '$lib/services/crypto';
	import { DEFAULT_FUNKWHALE_INSTANCES } from '$lib/utils/constants';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';

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
			addInstanceError = 'URL is required';
			return;
		}
		try {
			new URL(url);
		} catch {
			addInstanceError = 'Invalid URL';
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
				testMessage = 'Connection successful!';
			} else {
				testStatus = 'error';
				testMessage = result.error || 'Connection failed';
			}
		} catch (err) {
			testStatus = 'error';
			testMessage = err instanceof Error ? err.message : 'Unknown error';
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
		if (!confirm(`Remove the "${lib.name}" library?`)) return;
		settings.removeWebDAVLibrary(lib.id);
		refresh();
	}

	function handleToggle(lib: WebDAVLibrary) {
		settings.toggleWebDAVLibrary(lib.id);
		refresh();
	}
</script>

<svelte:head>
	<title>Audio sources — Dustic</title>
</svelte:head>

<p class="mb-6 text-sm opacity-70">
		Choose where your audio comes from: the Internet Archive's public catalogue,
		one or more FunkWhale servers, and/or your own cloud folders.
	</p>

	<!-- Internet Archive -->
	<section class="card bg-base-200 p-4 mb-4">
		<div class="flex items-center gap-3">
			<img src="{base}/internet-archive-icon.svg" alt="Internet Archive" class="w-6 h-6" />
			<div class="flex-1 min-w-0">
				<div class="font-semibold">Internet Archive</div>
				<div class="text-xs opacity-60">
					Millions of free recordings: live concerts, vinyl rips, old radio, audiobooks…
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
				<div class="font-semibold">FunkWhale servers</div>
				<div class="text-xs opacity-60">
					Federated music communities. Add one or more public instances.
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
						title="Remove"
						on:click={() => settings.removeFunkwhaleInstance(instance.url)}
					>
						<Icon icon="solar:close-circle-bold" width="16" />
					</button>
				</div>
			{/each}
			{#if funkwhaleInstances.length === 0}
				<p class="text-sm opacity-50 italic">No FunkWhale server configured.</p>
			{/if}
		</div>

		<details class="border-t border-base-content/10 pt-3">
			<summary class="cursor-pointer text-sm font-medium opacity-70 mb-2">
				+ Add a server
			</summary>
			<div class="space-y-2 mt-2">
				<input
					type="url"
					bind:value={newInstanceUrl}
					placeholder="https://funkwhale.example.com"
					class="input input-bordered input-sm w-full"
					on:keydown={(e) => e.key === 'Enter' && addInstance()}
				/>
				<input
					type="text"
					bind:value={newInstanceName}
					placeholder="Nickname (optional)"
					class="input input-bordered input-sm w-full"
					on:keydown={(e) => e.key === 'Enter' && addInstance()}
				/>
				<button class="btn btn-primary btn-sm w-full sm:w-auto" on:click={addInstance}>
					Add server
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
				<div class="font-semibold">Your folders</div>
				<div class="text-xs opacity-60">
					Play your own audio — music, audiobooks, courses — from a cloud folder you
					already use. Works with Koofr, Nextcloud, pCloud (paid plan), or any cloud that
					supports WebDAV.
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
							title="Browse"
							aria-label="Browse {lib.name}"
						>
							<Icon icon="mdi:folder-open" width="18" />
						</a>
						<button
							class="btn btn-sm btn-ghost"
							on:click={() => handleEdit(lib)}
							title="Edit"
							aria-label="Edit {lib.name}"
						>
							<Icon icon="mdi:pencil" width="18" />
						</button>
						<button
							class="btn btn-sm btn-ghost text-error"
							on:click={() => handleRemove(lib)}
							title="Remove"
							aria-label="Remove {lib.name}"
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
			{editingId ? 'Edit folder' : '+ Connect a folder'}
		</summary>
	<form on:submit|preventDefault={handleSave} class="bg-base-100 border border-base-300 p-4 rounded space-y-3">
		<label class="form-control">
			<span class="label-text">Nickname</span>
			<input
				type="text"
				placeholder="e.g. My audiobooks, koofr, Cours d'histoire"
				class="input input-bordered"
				bind:value={form.name}
				required
			/>
		</label>

		<label class="form-control">
			<span class="label-text">Server address (WebDAV URL)</span>
			<input
				type="url"
				placeholder="https://app.koofr.net/dav/Koofr"
				class="input input-bordered"
				bind:value={form.url}
				required
			/>
			<span class="label-text-alt opacity-60">
				Get this from your cloud provider's settings. Common examples in Help below.
			</span>
		</label>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
			<label class="form-control">
				<span class="label-text">Username</span>
				<input
					type="text"
					class="input input-bordered"
					bind:value={form.username}
					autocomplete="username"
					required
				/>
			</label>

			<label class="form-control">
				<span class="label-text">Password</span>
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
			<span class="label-text">Folder to listen to (optional)</span>
			<input
				type="text"
				placeholder="/Music"
				class="input input-bordered"
				bind:value={form.rootPath}
			/>
			<span class="label-text-alt opacity-60">
				The folder inside your cloud that holds your audio. Leave as "/" to browse everything.
			</span>
		</label>

		<div class="flex flex-wrap gap-2">
			<button type="submit" class="btn btn-primary">
				{editingId ? 'Save' : 'Connect'}
			</button>
			<button type="button" class="btn btn-ghost" on:click={handleTest} disabled={testStatus === 'testing'}>
				{testStatus === 'testing' ? 'Testing…' : 'Test connection'}
			</button>
			{#if editingId}
				<button type="button" class="btn btn-ghost" on:click={handleCancelEdit}>Cancel</button>
			{/if}
		</div>

		{#if testStatus === 'success'}
			<div class="alert alert-success py-2 text-sm">{testMessage}</div>
		{:else if testStatus === 'error'}
			<div class="alert alert-error py-2 text-sm">
				<div class="font-medium">{testMessage}</div>
				<div class="text-xs opacity-80 mt-1">
					401 = bad username/password, or your provider requires an app-specific password
					(see Help below). 404 = the URL or root folder doesn't exist.
				</div>
			</div>
		{/if}
	</form>
	</details>
	</section>

	<details class="mt-2">
		<summary class="cursor-pointer text-xs opacity-60 ml-2">Help: common WebDAV URLs</summary>
		<div class="mt-2 text-sm opacity-70 space-y-2">
			<p>
				<strong>Koofr</strong>: <code>https://app.koofr.net/dav/Koofr</code><br />
				Username = your Koofr email. Password = an <em>app-specific password</em> generated in
				Koofr → Account → Preferences → Password → App passwords.
			</p>
			<p>
				<strong>Nextcloud</strong>: <code>https://&lt;your-server&gt;/remote.php/dav/files/&lt;username&gt;/</code><br />
				Username + password from your Nextcloud account. App password recommended if 2FA is on.
			</p>
			<p>
				<strong>pCloud</strong> (paid plan only): <code>https://webdav.pcloud.com/</code> (US) or
				<code>https://ewebdav.pcloud.com/</code> (EU). Username = pCloud email. Password = your
				pCloud password (if 2FA is on, you must use an app-specific password from
				pCloud → Settings → Security → App passwords).
			</p>
		</div>
	</details>
