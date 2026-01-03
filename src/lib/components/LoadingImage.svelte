<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';

	export let src: string | undefined;
	export let alt: string;
	export let className: string = '';
	export let aspectRatio: 'square' | 'auto' = 'square';

	let loaded = false;
	let error = false;
	let imageElement: HTMLImageElement;

	onMount(() => {
		if (src && imageElement) {
			// Check if image is already cached
			if (imageElement.complete && imageElement.naturalHeight !== 0) {
				loaded = true;
			}
		}
	});

	function handleLoad() {
		loaded = true;
		error = false;
	}

	function handleError() {
		error = true;
		loaded = true;
	}

	$: aspectClass = aspectRatio === 'square' ? 'aspect-square' : '';
</script>

<div class="relative {aspectClass} {className}">
	{#if src && !error}
		<!-- Skeleton loader -->
		{#if !loaded}
			<div class="absolute inset-0 bg-base-300 animate-pulse rounded" />
		{/if}

		<!-- Actual image -->
		<img
			bind:this={imageElement}
			{src}
			{alt}
			on:load={handleLoad}
			on:error={handleError}
			class="w-full h-full object-cover rounded {loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300"
		/>
	{:else}
		<!-- Fallback placeholder -->
		<div class="w-full h-full flex items-center justify-center bg-base-300 rounded">
			<Icon icon="solar:music-note-bold" width="64" className="text-base-content/30" />
		</div>
	{/if}
</div>
