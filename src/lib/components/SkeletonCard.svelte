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
	<!-- List skeleton -->
	<div class="card bg-base-200 animate-pulse">
		<div class="card-body p-4">
			<div class="flex items-center gap-3">
				<!-- Thumbnail skeleton -->
				<div class="w-12 h-12 bg-base-300 rounded flex-shrink-0"></div>
				<!-- Content skeleton -->
				<div class="flex-1 min-w-0">
					<div class="h-4 bg-base-300 rounded w-3/4 mb-2"></div>
					<div class="h-3 bg-base-300 rounded w-1/2"></div>
				</div>
				<!-- Actions skeleton -->
				<div class="flex items-center gap-2">
					<div class="w-8 h-8 bg-base-300 rounded-full"></div>
					<div class="w-16 h-8 bg-base-300 rounded"></div>
				</div>
			</div>
		</div>
	</div>
{/if}
