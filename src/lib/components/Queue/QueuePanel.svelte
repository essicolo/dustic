<script lang="ts">
	import { queue } from '$lib/stores/queue';
	import { queuePanelOpen } from '$lib/stores/queuePanel';
	import Icon from '$lib/components/Icon.svelte';
	import QueueContent from './QueueContent.svelte';

	$: queueCount = $queue.tracks.length;
</script>

<!-- Queue Toggle Button -->
<button on:click={() => queuePanelOpen.toggle()} class="btn btn-ghost btn-sm btn-circle relative" title="Queue">
	<Icon icon="mdi:playlist-music" width="20" />
	{#if queueCount > 0}
		<span class="badge badge-primary badge-sm absolute -top-1 -right-1">
			{queueCount}
		</span>
	{/if}
</button>

<!-- Queue Panel overlay — only below xl (at xl+, the layout renders the inline panel) -->
{#if $queuePanelOpen}
	<div class="xl:hidden fixed inset-0 z-50 flex justify-end">
		<!-- Backdrop -->
		<div
			class="absolute inset-0 bg-black/50"
			on:click={() => queuePanelOpen.close()}
			on:keydown={(e) => e.key === 'Escape' && queuePanelOpen.close()}
			role="button"
			tabindex="-1"
			aria-label="Close queue"
		></div>

		<!-- Panel -->
		<div class="relative w-full sm:w-96 bg-base-200 shadow-xl flex flex-col" style="max-height: 100vh; max-height: 100dvh;">
			<QueueContent on:close={() => queuePanelOpen.close()} />
		</div>
	</div>
{/if}
