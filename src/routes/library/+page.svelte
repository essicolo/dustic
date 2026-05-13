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
				<div class="flex items-start gap-3">
					<Icon icon="mdi:folder-music-outline" width="24" class="opacity-50 flex-shrink-0" />
					<div class="flex-1">
						<p class="text-sm text-base-content/70 leading-relaxed">
							<strong class="text-base-content/90">Internet Archive and FunkWhale work out of the box</strong> — no setup needed.
							Connect a folder here to add your own audio: music, audiobooks, courses, podcasts.
							Works with Koofr, Nextcloud, pCloud, or any cloud that supports WebDAV.
						</p>
						<div class="mt-4">
							<a href="{base}/settings/libraries" class="btn btn-primary btn-sm gap-1">
								<Icon icon="mdi:plus" width="18" />
								Connect a folder
							</a>
						</div>
					</div>
				</div>
			</div>
		{:else}
			<div class="space-y-2">
				{#each audioSources as src (src.id)}
					<a
						href="{base}/library/webdav/{src.id}"
						class="card bg-base-200 hover:bg-base-300 transition-colors p-3 flex flex-row items-center gap-3"
					>
						<Icon icon="mdi:folder-music" width="32" class={src.enabled ? 'flex-shrink-0' : 'flex-shrink-0 opacity-40'} />
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2">
								<span class="font-medium truncate" class:opacity-60={!src.enabled}>{src.name}</span>
								{#if !src.enabled}
									<span class="badge badge-ghost badge-sm">disabled</span>
								{/if}
							</div>
							<div class="text-xs opacity-60 truncate">
								{hostFromUrl(src.url)}{src.rootPath && src.rootPath !== '/' ? ` · ${src.rootPath}` : ''}
							</div>
						</div>
						<Icon icon="mdi:chevron-right" width="20" class="flex-shrink-0 opacity-50" />
					</a>
				{/each}
			</div>
		{/if}
	</section>
</div>
