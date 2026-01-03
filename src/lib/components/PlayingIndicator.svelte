<script lang="ts">
	export let size: 'sm' | 'md' = 'sm';

	const barCount = 3;
	$: barHeight = size === 'sm' ? '12px' : '16px';
	$: barWidth = size === 'sm' ? '2px' : '3px';
	$: gap = size === 'sm' ? '2px' : '3px';
</script>

<div class="playing-indicator" style="--bar-height: {barHeight}; --bar-width: {barWidth}; --gap: {gap}">
	{#each Array(barCount) as _, i}
		<div class="bar" style="animation-delay: {i * 0.15}s"></div>
	{/each}
</div>

<style>
	.playing-indicator {
		display: flex;
		align-items: flex-end;
		gap: var(--gap);
		height: var(--bar-height);
	}

	.bar {
		width: var(--bar-width);
		background: currentColor;
		border-radius: 2px;
		animation: bounce 0.6s ease-in-out infinite alternate;
		height: 100%;
	}

	@keyframes bounce {
		0% {
			transform: scaleY(0.3);
		}
		100% {
			transform: scaleY(1);
		}
	}
</style>
