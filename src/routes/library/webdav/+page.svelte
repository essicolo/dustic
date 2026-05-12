<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { settings } from '$lib/stores/settings';
	import type { WebDAVLibrary } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';

	let libraries: WebDAVLibrary[] = [];

	onMount(() => {
		libraries = settings.getWebDAVLibraries().filter((l) => l.enabled);
	});
</script>

<svelte:head>
	<title>WebDAV libraries — Dustic</title>
</svelte:head>

<div class="container mx-auto max-w-3xl p-4">
	<h1 class="text-2xl font-bold mb-4">My WebDAV libraries</h1>

	{#if libraries.length === 0}
		<div class="card bg-base-200 p-6 text-center">
			<p class="mb-3 opacity-70">No WebDAV library configured yet.</p>
			<a href="{base}/settings/libraries" class="btn btn-primary">Add a library</a>
		</div>
	{:else}
		<ul class="space-y-2">
			{#each libraries as lib (lib.id)}
				<li>
					<a href="{base}/library/webdav/{lib.id}" class="card bg-base-200 hover:bg-base-300 p-4 flex items-center gap-3">
						<Icon icon="mdi:folder-music" width="32" />
						<div class="flex-1 min-w-0">
							<div class="font-medium truncate">{lib.name}</div>
							<div class="text-xs opacity-60 truncate">{lib.url}{lib.rootPath}</div>
						</div>
						<Icon icon="mdi:chevron-right" width="20" />
					</a>
				</li>
			{/each}
		</ul>
		<div class="mt-4 text-right">
			<a href="{base}/settings/libraries" class="btn btn-ghost btn-sm">Manage libraries</a>
		</div>
	{/if}
</div>
