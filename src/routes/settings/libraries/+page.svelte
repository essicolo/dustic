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
				testMessage = 'Connexion réussie!';
			} else {
				testStatus = 'error';
				testMessage = result.error || 'Connexion échouée';
			}
		} catch (err) {
			testStatus = 'error';
			testMessage = err instanceof Error ? err.message : 'Erreur inconnue';
		}
		setTimeout(() => {
			testStatus = 'idle';
			testMessage = '';
		}, 4000);
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
		if (!confirm(`Supprimer la bibliothèque "${lib.name}" ?`)) return;
		settings.removeWebDAVLibrary(lib.id);
		refresh();
	}

	function handleToggle(lib: WebDAVLibrary) {
		settings.toggleWebDAVLibrary(lib.id);
		refresh();
	}
</script>

<svelte:head>
	<title>Bibliothèques WebDAV — Inde</title>
</svelte:head>

<div class="container mx-auto max-w-3xl p-4">
	<div class="mb-6 flex items-center gap-3">
		<a href="{base}/settings" class="btn btn-ghost btn-sm">
			<Icon icon="mdi:arrow-left" width="20" />
		</a>
		<h1 class="text-2xl font-bold">Bibliothèques WebDAV</h1>
	</div>

	<p class="mb-4 text-sm opacity-70">
		Ajoutez vos propres dossiers de musique stockés sur Koofr, Nextcloud, pCloud (plan
		payant), ou tout serveur compatible WebDAV. Les fichiers audio (mp3, flac, ogg, opus,
		m4a) seront lisibles dans Inde et peuvent être téléchargés pour la lecture hors ligne.
	</p>

	<!-- Existing libraries list -->
	{#if libraries.length > 0}
		<h2 class="mt-6 mb-2 text-lg font-semibold">Bibliothèques configurées</h2>
		<ul class="space-y-2">
			{#each libraries as lib (lib.id)}
				<li class="card bg-base-200 p-3">
					<div class="flex items-center gap-3">
						<div class="flex-1 min-w-0">
							<div class="font-medium truncate">{lib.name}</div>
							<div class="text-xs opacity-60 truncate">{lib.url}{lib.rootPath}</div>
						</div>
						<a href="{base}/library/webdav/{lib.id}" class="btn btn-sm btn-primary">
							Parcourir
						</a>
						<button
							class="btn btn-sm btn-ghost"
							class:btn-success={lib.enabled}
							on:click={() => handleToggle(lib)}
							title={lib.enabled ? 'Désactiver' : 'Activer'}
						>
							<Icon icon={lib.enabled ? 'mdi:check' : 'mdi:close'} width="18" />
						</button>
						<button class="btn btn-sm btn-ghost" on:click={() => handleEdit(lib)} title="Modifier">
							<Icon icon="mdi:pencil" width="18" />
						</button>
						<button class="btn btn-sm btn-ghost text-error" on:click={() => handleRemove(lib)} title="Supprimer">
							<Icon icon="mdi:trash-can" width="18" />
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	<!-- Add/edit form -->
	<h2 class="mt-8 mb-2 text-lg font-semibold">
		{editingId ? 'Modifier la bibliothèque' : 'Ajouter une bibliothèque'}
	</h2>
	<form on:submit|preventDefault={handleSave} class="card bg-base-200 p-4 space-y-3">
		<label class="form-control">
			<span class="label-text">Nom</span>
			<input
				type="text"
				placeholder="Mon Koofr"
				class="input input-bordered"
				bind:value={form.name}
				required
			/>
		</label>

		<label class="form-control">
			<span class="label-text">URL WebDAV</span>
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
				<span class="label-text">Utilisateur</span>
				<input
					type="text"
					class="input input-bordered"
					bind:value={form.username}
					autocomplete="username"
					required
				/>
			</label>

			<label class="form-control">
				<span class="label-text">Mot de passe</span>
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
			<span class="label-text">Dossier racine (optionnel)</span>
			<input
				type="text"
				placeholder="/Music"
				class="input input-bordered"
				bind:value={form.rootPath}
			/>
			<span class="label-text-alt opacity-60">
				Sous-chemin à l'intérieur de l'espace WebDAV. Laisser "/" pour la racine.
			</span>
		</label>

		<div class="flex flex-wrap gap-2">
			<button type="submit" class="btn btn-primary">
				{editingId ? 'Enregistrer' : 'Ajouter'}
			</button>
			<button type="button" class="btn btn-ghost" on:click={handleTest} disabled={testStatus === 'testing'}>
				{testStatus === 'testing' ? 'Test...' : 'Tester la connexion'}
			</button>
			{#if editingId}
				<button type="button" class="btn btn-ghost" on:click={handleCancelEdit}>Annuler</button>
			{/if}
		</div>

		{#if testStatus === 'success'}
			<div class="alert alert-success py-2 text-sm">{testMessage}</div>
		{:else if testStatus === 'error'}
			<div class="alert alert-error py-2 text-sm">{testMessage}</div>
		{/if}
	</form>

	<details class="mt-6">
		<summary class="cursor-pointer text-sm opacity-70">Aide: URLs WebDAV courantes</summary>
		<div class="mt-2 text-sm opacity-70 space-y-1">
			<p><strong>Koofr</strong>: <code>https://app.koofr.net/dav/Koofr</code> (mot de passe applicatif requis)</p>
			<p><strong>Nextcloud</strong>: <code>https://votre-domaine/remote.php/dav/files/USERNAME/</code></p>
			<p><strong>pCloud (plan payant)</strong>: <code>https://webdav.pcloud.com</code></p>
		</div>
	</details>
</div>
