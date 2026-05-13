<script lang="ts">
	import { settings } from '$lib/stores/settings';
	import { sourceStatus } from '$lib/stores/sourceStatus';
	import { DEFAULT_FUNKWHALE_INSTANCES } from '$lib/utils/constants';
	import { base } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';

	let panelOpen = false;

	$: iaEnabled = $settings.iaEnabled !== false;
	$: fwInstances = ($settings.funkwhaleInstances || DEFAULT_FUNKWHALE_INSTANCES).filter((i) => i.enabled);
	$: folders = ($settings.webdavLibraries || []).filter((l) => l.enabled);

	// Aggregate status: green if at least one enabled source of that type is online,
	// gray if disabled / none configured, amber otherwise.
	$: iaDot = !iaEnabled ? 'off' : $sourceStatus.ia === 'online' ? 'on' : $sourceStatus.ia === 'offline' ? 'warn' : 'idle';
	$: fwDot = fwInstances.length === 0
		? 'off'
		: fwInstances.some((i) => $sourceStatus.fw[i.url] === 'online')
			? 'on'
			: fwInstances.every((i) => $sourceStatus.fw[i.url] === 'offline')
				? 'warn'
				: 'idle';
	$: foldersDot = folders.length === 0 ? 'off' : 'on';

	function dotClass(state: string): string {
		switch (state) {
			case 'on':
				return 'bg-success';
			case 'warn':
				return 'bg-warning';
			case 'idle':
				return 'bg-base-content/30';
			default:
				return 'bg-base-content/15';
		}
	}
</script>

<button
	class="btn btn-ghost btn-sm w-full justify-start gap-2 normal-case font-medium"
	on:click={() => (panelOpen = true)}
	aria-label="View sources"
>
	<Icon icon="solar:database-bold-duotone" width="18" />
	<span>Sources</span>
	<span class="ml-auto flex items-center gap-1">
		<span class="w-2 h-2 rounded-full {dotClass(iaDot)}" title="Internet Archive"></span>
		<span class="w-2 h-2 rounded-full {dotClass(fwDot)}" title="FunkWhale"></span>
		<span class="w-2 h-2 rounded-full {dotClass(foldersDot)}" title="Your folders"></span>
	</span>
</button>

{#if panelOpen}
	<div
		class="modal modal-open"
		on:click|self={() => (panelOpen = false)}
		on:keydown={(e) => e.key === 'Escape' && (panelOpen = false)}
		role="dialog"
		tabindex="-1"
	>
		<div class="modal-box max-w-sm">
			<div class="flex items-center justify-between mb-4">
				<h3 class="text-lg font-semibold">Sources</h3>
				<button
					class="btn btn-ghost btn-sm btn-circle"
					on:click={() => (panelOpen = false)}
					aria-label="Close"
				>
					<Icon icon="solar:close-circle-bold" width="18" />
				</button>
			</div>

			<div class="space-y-3 text-sm">
				<!-- IA -->
				<div class="flex items-center gap-3">
					<span class="w-2.5 h-2.5 rounded-full flex-shrink-0 {dotClass(iaDot)}"></span>
					<img src="{base}/internet-archive-icon.svg" alt="" class="w-4 h-4 opacity-70" />
					<span class="flex-1">Internet Archive</span>
					<span class="text-xs opacity-60">
						{iaEnabled ? ($sourceStatus.ia === 'online' ? 'online' : $sourceStatus.ia === 'offline' ? 'offline' : '—') : 'disabled'}
					</span>
				</div>

				<!-- FW instances -->
				{#if fwInstances.length === 0}
					<div class="flex items-center gap-3 opacity-60">
						<span class="w-2.5 h-2.5 rounded-full flex-shrink-0 {dotClass('off')}"></span>
						<img src="{base}/funkwhale-icon.svg" alt="" class="w-4 h-4 opacity-70" />
						<span class="flex-1">FunkWhale</span>
						<span class="text-xs">none</span>
					</div>
				{:else}
					{#each fwInstances as instance}
						<div class="flex items-center gap-3">
							<span class="w-2.5 h-2.5 rounded-full flex-shrink-0 {dotClass($sourceStatus.fw[instance.url] === 'online' ? 'on' : $sourceStatus.fw[instance.url] === 'offline' ? 'warn' : 'idle')}"></span>
							<img src="{base}/funkwhale-icon.svg" alt="" class="w-4 h-4 opacity-70" />
							<span class="flex-1 truncate" title={instance.url}>{instance.name}</span>
							<span class="text-xs opacity-60">
								{$sourceStatus.fw[instance.url] || '—'}
							</span>
						</div>
					{/each}
				{/if}

				<!-- Your folders -->
				{#if folders.length === 0}
					<div class="flex items-center gap-3 opacity-60">
						<span class="w-2.5 h-2.5 rounded-full flex-shrink-0 {dotClass('off')}"></span>
						<Icon icon="mdi:folder-music" width="16" />
						<span class="flex-1">Your folders</span>
						<span class="text-xs">none</span>
					</div>
				{:else}
					{#each folders as folder}
						<div class="flex items-center gap-3">
							<span class="w-2.5 h-2.5 rounded-full flex-shrink-0 {dotClass('on')}"></span>
							<Icon icon="mdi:folder-music" width="16" />
							<span class="flex-1 truncate" title={folder.url}>{folder.name}</span>
						</div>
					{/each}
				{/if}
			</div>

			<div class="modal-action mt-6">
				<a
					href="{base}/settings/libraries"
					class="btn btn-sm"
					on:click={() => (panelOpen = false)}
				>
					Manage sources
				</a>
			</div>
		</div>
	</div>
{/if}
