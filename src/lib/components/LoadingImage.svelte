<script lang="ts">
	import { onMount } from 'svelte';
	import CoverFallback from './CoverFallback.svelte';

	export let src: string | undefined;
	export let alt: string;
	export let className: string = '';
	export let aspectRatio: 'square' | 'auto' = 'square';
	/** Seeds the generated fallback tile; the item identifier where available. */
	export let fallbackSeed: string = '';

	// Thumbnails proxied through weserv are requested in CORS mode. weserv
	// sends `access-control-allow-origin: *` on both hits and misses, and a
	// miss (an item with no artwork) is a 404 carrying a JSON body. Firefox's
	// Opaque Response Blocking refuses a no-cors response whose type does not
	// match its use, so those misses were logged as
	// "blocked by OpaqueResponseBlocking" on every artwork-less item. ORB does
	// not apply to CORS-mode requests, so asking for CORS removes the warning
	// while the error event still fires and the generated tile still appears.
	$: isProxied = !!src && src.startsWith('https://images.weserv.nl/');

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
			<div class="absolute inset-0 bg-base-300 animate-pulse" />
		{/if}

		<!-- Actual image -->
		<img
			bind:this={imageElement}
			{src}
			{alt}
			crossorigin={isProxied ? 'anonymous' : null}
			on:load={handleLoad}
			on:error={handleError}
			class="w-full h-full object-cover {loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300"
		/>
	{:else}
		<!-- No artwork: draw one rather than showing a "broken" icon. -->
		<CoverFallback seed={fallbackSeed || alt} className="w-full h-full" />
	{/if}
</div>
