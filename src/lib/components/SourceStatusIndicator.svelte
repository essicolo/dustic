<script lang="ts">
	import { base } from '$app/paths';
	import { sourceStatus } from '$lib/stores/sourceStatus';
	import type { SourceState } from '$lib/stores/sourceStatus';

	function dotColor(state: SourceState): string {
		if (state === 'online') return 'bg-success';
		if (state === 'offline') return 'bg-error';
		return 'bg-base-content/30';
	}

	function label(state: SourceState): string {
		if (state === 'online') return 'en ligne';
		if (state === 'offline') return 'hors ligne';
		return 'vérification...';
	}

	$: iaState = $sourceStatus.ia;
	$: fwEntries = Object.entries($sourceStatus.fw);
</script>

<div class="flex items-center gap-3 text-xs opacity-80">
	<!-- Internet Archive -->
	<div class="flex items-center gap-1" title="Internet Archive: {label(iaState)}">
		<span class="w-2 h-2 rounded-full {dotColor(iaState)}"></span>
		<img src="{base}/internet-archive-icon.svg" alt="IA" class="w-3.5 h-3.5 opacity-70" />
	</div>

	<!-- FunkWhale instances -->
	{#each fwEntries as [url, state]}
		{@const host = new URL(url).host}
		<div class="flex items-center gap-1" title="{host}: {label(state)}">
			<span class="w-2 h-2 rounded-full {dotColor(state)}"></span>
			<img src="{base}/funkwhale-icon.svg" alt="FW" class="w-3.5 h-3.5 opacity-70" />
		</div>
	{/each}
</div>
