<script lang="ts">
	import { base } from '$app/paths';
	import { sourceStatus } from '$lib/stores/sourceStatus';
	import type { SourceState } from '$lib/stores/sourceStatus';

	function dotStyle(state: SourceState): string {
		if (state === 'online') return 'background-color: #22c55e';
		if (state === 'offline') return 'background-color: #ef4444';
		return 'background-color: #9ca3af';
	}

	function label(state: SourceState): string {
		if (state === 'online') return 'online';
		if (state === 'offline') return 'offline';
		return 'checking...';
	}

	$: iaState = $sourceStatus.ia;
	$: fwEntries = Object.entries($sourceStatus.fw);
</script>

<div class="flex items-center gap-3 text-xs opacity-80">
	<!-- Internet Archive -->
	<div class="flex items-center gap-1" title="Internet Archive: {label(iaState)}">
		<span class="w-2 h-2 rounded-full inline-block" style="{dotStyle(iaState)}"></span>
		<img src="{base}/internet-archive-icon.svg" alt="IA" class="w-3.5 h-3.5 opacity-70" />
	</div>

	<!-- FunkWhale instances -->
	{#each fwEntries as [url, state]}
		{@const host = new URL(url).host}
		<div class="flex items-center gap-1" title="{host}: {label(state)}">
			<span class="w-2 h-2 rounded-full inline-block" style="{dotStyle(state)}"></span>
			<img src="{base}/funkwhale-icon.svg" alt="FW" class="w-3.5 h-3.5 opacity-70" />
		</div>
	{/each}
</div>
