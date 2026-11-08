<script lang="ts">
	import { library } from '$lib/stores/library';
	import { settings } from '$lib/stores/settings';
	import { base } from '$app/paths';
	import Icon from '@iconify/svelte';
	import type { WebDAVLibrary } from '$lib/types';
	import { _ } from '$lib/i18n';

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
	<h2 class="text-3xl font-bold mb-6">{$_('library.title')}</h2>

	<!-- Three links to three places. They were three identical bg-base-200
	     boxes, each holding a title and one line of text, which is a list
	     wearing costumes: 124px of vertical space per row to carry about
	     twenty characters. A ruled list says the same thing in a third of
	     the height and reads as the index it is. -->
	<nav class="mb-10 border-y border-base-300 divide-y divide-base-300">
		{#each [ { href: `${base}/library/favorites`, icon: 'solar:heart-bold', label: $_('home.favorites'), detail: $_('library.favoritesItems', { values: { count: $library.favorites.length } }) }, { href: `${base}/history`, icon: 'solar:history-bold', label: $_('history.title'), detail: $_('library.historySubtitle') }, { href: `${base}/library/playlists`, icon: 'solar:list-heart-bold', label: $_('home.playlists'), detail: $_('library.playlistCount', { values: { count: playlistCount } }) } ] as entry (entry.href)}
			<a
				href={entry.href}
				class="group flex items-center gap-4 px-2 py-4 transition-colors hover:bg-base-200"
			>
				<Icon icon={entry.icon} width="20" class="flex-shrink-0 text-base-content/70" />
				<span class="min-w-0 flex-1">
					<span class="block font-medium">{entry.label}</span>
					<span class="block truncate text-sm text-base-content/60">{entry.detail}</span>
				</span>
				<Icon
					icon="solar:alt-arrow-right-linear"
					width="18"
					class="flex-shrink-0 text-base-content/30 transition-colors group-hover:text-base-content/70"
				/>
			</a>
		{/each}
	</nav>

	<!-- Your folders -->
	<section>
		<div class="flex items-center justify-between mb-3">
			<h3 class="text-xl font-semibold">{$_('library.folders.title')}</h3>
			<a
				href="{base}/settings/libraries"
				class="btn btn-sm btn-ghost gap-1"
				title={$_('library.folders.connectTitle')}
			>
				<Icon icon="mdi:plus" width="18" />
				{$_('library.folders.addFolder')}
			</a>
		</div>

		{#if audioSources.length === 0}
			<div class="card bg-base-200 p-6">
				<div class="flex items-start gap-3">
					<Icon icon="mdi:folder-music-outline" width="24" class="opacity-50 flex-shrink-0" />
					<div class="flex-1">
						<p class="text-sm text-base-content/70 leading-relaxed">
							<strong class="text-base-content/90">{$_('library.folders.introStrong')}</strong>{$_('library.folders.introRest')}
						</p>
						<div class="mt-4">
							<a href="{base}/settings/libraries" class="btn btn-primary btn-sm gap-1">
								<Icon icon="mdi:plus" width="18" />
								{$_('library.folders.connectFolder')}
							</a>
						</div>
					</div>
				</div>
			</div>
		{:else}
			<!-- Same ruled-list treatment as the index above, so the page has
			     one way of presenting "a row you can click". -->
			<div class="border-y border-base-300 divide-y divide-base-300">
				{#each audioSources as src (src.id)}
					<a
						href="{base}/library/webdav/{src.id}"
						class="group flex items-center gap-4 px-2 py-3 transition-colors hover:bg-base-200"
					>
						<Icon icon="mdi:folder-music" width="24" class={src.enabled ? 'flex-shrink-0 text-base-content/70' : 'flex-shrink-0 opacity-40'} />
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2">
								<span class="font-medium truncate" class:opacity-60={!src.enabled}>{src.name}</span>
								{#if !src.enabled}
									<span class="badge badge-ghost badge-sm">{$_('library.folders.disabled')}</span>
								{/if}
							</div>
							<div class="text-xs opacity-60 truncate">
								{hostFromUrl(src.url)}{src.rootPath && src.rootPath !== '/' ? ` · ${src.rootPath}` : ''}
							</div>
						</div>
						<Icon
							icon="solar:alt-arrow-right-linear"
							width="18"
							class="flex-shrink-0 text-base-content/30 transition-colors group-hover:text-base-content/70"
						/>
					</a>
				{/each}
			</div>
		{/if}
	</section>
</div>
