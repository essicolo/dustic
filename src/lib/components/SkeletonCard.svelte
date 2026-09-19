<script lang="ts">
	export let layout: 'grid' | 'list' = 'grid';
</script>

{#if layout === 'grid'}
	<!-- Grid skeleton -->
	<div class="card bg-base-200 animate-pulse">
		<div class="card-body p-3">
			<!-- Thumbnail skeleton -->
			<div class="w-full aspect-square bg-base-300 rounded mb-3"></div>
			<!-- Title skeleton -->
			<div class="h-4 bg-base-300 rounded w-3/4 mb-2"></div>
			<!-- Artist skeleton -->
			<div class="h-3 bg-base-300 rounded w-1/2"></div>
		</div>
	</div>
{:else}
	<!-- List skeleton. Mirrors the real row: the same 56px thumbnail, so results do not jump when they land. -->
	<div class="flex items-center gap-3 animate-pulse">
		<div class="w-14 h-14 my-2 ml-2 bg-base-300 rounded flex-shrink-0"></div>
		<div class="flex-1 min-w-0 py-2">
			<div class="h-4 bg-base-300 rounded w-3/4 mb-2"></div>
			<div class="h-3 bg-base-300 rounded w-1/2"></div>
		</div>
		<div class="flex items-center gap-2 pr-2">
			<div class="w-8 h-8 bg-base-300 rounded-full"></div>
			<div class="w-8 h-8 bg-base-300 rounded-full"></div>
		</div>
	</div>
{/if}
