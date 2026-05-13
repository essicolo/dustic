<script lang="ts">
	import { library } from '$lib/stores/library';
	import { settings } from '$lib/stores/settings';
	import { base } from '$app/paths';
	import Icon from '@iconify/svelte';
	import type { WebDAVLibrary } from '$lib/types';

	$: playlistCount = Object.keys($library.playlists).length;
	$: audioSources = ($settings.webdavLibraries || []) as WebDAVLibrary[];

	function hostFromUrl(url: string): string {
		try {
			return new URL(url).host;
		} catch {
			return url;
		}
	}
</script>

<div class="p-8">
	<h2 class="text-3xl font-bold mb-6">Library</h2>

	<!-- Favorites -->
	<section class="mb-4">
		<a
			href="{base}/library/favorites"
			class="card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer"
		>
			<div class="card-body">
				<h3 class="card-title">Favorites</h3>
				<p class="text-base-content/70">{$library.favorites.length} items</p>
			</div>
		</a>
	</section>

	<!-- History -->
	<section class="mb-4">
		<a
			href="{base}/history"
			class="card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer"
		>
			<div class="card-body">
				<h3 class="card-title">History</h3>
				<p class="text-base-content/70">Recently played</p>
			</div>
		</a>
	</section>

	<!-- Playlists -->
	<section class="mb-8">
		<a
			href="{base}/library/playlists"
			class="card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer"
		>
			<div class="card-body">
				<h3 class="card-title">Playlists</h3>
				<p class="text-base-content/70">{playlistCount} playlist{playlistCount !== 1 ? 's' : ''}</p>
			</div>
		</a>
	</section>

	<!-- Your folders -->
	<section>
		<div class="flex items-center justify-between mb-3">
			<h3 class="text-xl font-semibold">Your folders</h3>
			<a
				href="{base}/settings/libraries"
				class="btn btn-sm btn-ghost gap-1"
				title="Connect a cloud folder"
			>
				<Icon icon="mdi:plus" width="18" />
				Add folder
			</a>
		</div>

		{#if audioSources.length === 0}
			<div class="card bg-base-200 p-6">
				<p class="text-base-content/70 leading-relaxed">
					Play your own audio collection — music, audiobooks, courses, podcasts —
					alongside Internet Archive and FunkWhale. Works with Koofr, Nextcloud,
					pCloud, or any cloud that supports WebDAV.
				</p>
				<div class="mt-4">
					<a href="{base}/settings/libraries" class="btn btn-primary btn-sm gap-1">
						<Icon icon="mdi:plus" width="18" />
						Connect a folder
					</a>
				</div>
			</div>
		{:else}
			<div class="space-y-2">
				{#each audioSources as src (src.id)}
					<a
						href="{base}/library/webdav/{src.id}"
						class="card bg-base-200 hover:bg-base-300 transition-colors p-3 flex flex-row items-center gap-3"
						class:opacity-50={!src.enabled}
					>
						<Icon icon="mdi:folder-music" width="32" class="flex-shrink-0" />
						<div class="flex-1 min-w-0">
							<div class="font-medium truncate">{src.name}</div>
							<div class="text-xs opacity-60 truncate">
								{hostFromUrl(src.url)}{src.rootPath && src.rootPath !== '/' ? ` · ${src.rootPath}` : ''}
								{#if !src.enabled} · disabled{/if}
							</div>
						</div>
						<Icon icon="mdi:chevron-right" width="20" class="flex-shrink-0 opacity-50" />
					</a>
				{/each}
			</div>
		{/if}
	</section>
</div>
