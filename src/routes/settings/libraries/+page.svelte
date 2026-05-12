<script lang="ts">
	import { settings } from '$lib/stores/settings';
	import type { WebDAVLibrary } from '$lib/types';
	import { testLibrary } from '$lib/services/webdavLibrary';
	import { encryptValue, decryptValue } from '$lib/services/crypto';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';

	let libraries: WebDAVLibrary[] = [];

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
	<title>WebDAV libraries — Dustic</title>
</svelte:head>

<div class="container mx-auto max-w-3xl p-4">
	<div class="mb-6 flex items-center gap-3">
		<a href="{base}/settings" class="btn btn-ghost btn-sm">
			<Icon icon="mdi:arrow-left" width="20" />
		</a>
		<h1 class="text-2xl font-bold">WebDAV libraries</h1>
	</div>

	<p class="mb-4 text-sm opacity-70">
		Add your own music folders stored on Koofr, Nextcloud, pCloud (paid plan), or any
		WebDAV-compatible server. Audio files (mp3, flac, ogg, opus, m4a) become playable
		inside Dustic and can be downloaded for offline listening.
	</p>

	<!-- Existing libraries list -->
	{#if libraries.length > 0}
		<h2 class="mt-6 mb-2 text-lg font-semibold">Configured libraries</h2>
		<ul class="space-y-2">
			{#each libraries as lib (lib.id)}
				<li class="card bg-base-200 p-3">
					<div class="flex items-center gap-3">
						<div class="flex-1 min-w-0">
							<div class="font-medium truncate">{lib.name}</div>
							<div class="text-xs opacity-60 truncate">{lib.url}{lib.rootPath}</div>
						</div>
						<a href="{base}/library/webdav/{lib.id}" class="btn btn-sm btn-primary">
							Browse
						</a>
						<button
							class="btn btn-sm btn-ghost"
							class:btn-success={lib.enabled}
							on:click={() => handleToggle(lib)}
							title={lib.enabled ? 'Disable' : 'Enable'}
						>
							<Icon icon={lib.enabled ? 'mdi:check' : 'mdi:close'} width="18" />
						</button>
						<button class="btn btn-sm btn-ghost" on:click={() => handleEdit(lib)} title="Edit">
							<Icon icon="mdi:pencil" width="18" />
						</button>
						<button class="btn btn-sm btn-ghost text-error" on:click={() => handleRemove(lib)} title="Remove">
							<Icon icon="mdi:trash-can" width="18" />
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	<!-- Add/edit form -->
	<h2 class="mt-8 mb-2 text-lg font-semibold">
		{editingId ? 'Edit library' : 'Add a library'}
	</h2>
	<form on:submit|preventDefault={handleSave} class="card bg-base-200 p-4 space-y-3">
		<label class="form-control">
			<span class="label-text">Name</span>
			<input
				type="text"
				placeholder="My Koofr"
				class="input input-bordered"
				bind:value={form.name}
				required
			/>
		</label>

		<label class="form-control">
			<span class="label-text">WebDAV URL</span>
			<input
				type="url"
				placeholder="https://app.koofr.net/dav/Koofr"
				class="input input-bordered"
				bind:value={form.url}
				required
			/>
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
			<span class="label-text">Root folder (optional)</span>
			<input
				type="text"
				placeholder="/Music"
				class="input input-bordered"
				bind:value={form.rootPath}
			/>
			<span class="label-text-alt opacity-60">
				Subpath inside your WebDAV space. Leave as "/" for the root.
			</span>
		</label>

		<div class="flex flex-wrap gap-2">
			<button type="submit" class="btn btn-primary">
				{editingId ? 'Save' : 'Add'}
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

	<details class="mt-6">
		<summary class="cursor-pointer text-sm opacity-70">Help: common WebDAV URLs</summary>
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
</div>
