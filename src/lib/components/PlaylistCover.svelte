<script lang="ts">
	// A playlist's cover is the music in it. Internet Archive serves a
	// thumbnail for any identifier at a predictable URL, so a mosaic of the
	// first few tracks needs no extra requests beyond the images themselves
	// — and beats the generic icon-on-a-gradient tile it replaces, in an app
	// whose whole subject is cover art.
	import { getThumbnailUrl } from '$lib/services/internetArchive';
	import CoverFallback from './CoverFallback.svelte';

	/** Track identifiers, in playlist order. */
	export let identifiers: string[] = [];
	export let alt = '';
	export let className = '';

	let failed: Record<string, boolean> = {};

	// Internet Archive identifiers only: fw:/wd: tracks carry their artwork
	// on the track object instead, and have no URL that can be derived.
	$: usable = identifiers.filter((id) => id && !id.startsWith('fw:') && !id.startsWith('wd:'));

	// Four cells or one; two or three would leave a hole in the grid. The
	// cells are chosen before any load is attempted, and a cell whose image
	// fails draws a generated tile in place rather than dropping out — which
	// would otherwise collapse a 2x2 mosaic to a single image mid-load.
	$: picks = usable.length >= 4 ? usable.slice(0, 4) : usable.slice(0, 1);
</script>

<div class="relative aspect-square overflow-hidden bg-base-300 {className}">
	{#if picks.length === 0}
		<!-- Nothing to derive a cover from: an empty playlist, or one holding
		     only fw:/wd: tracks. -->
		<CoverFallback seed={identifiers[0] ?? alt} className="h-full w-full" />
	{:else}
		<div class="grid h-full w-full gap-px {picks.length === 4 ? 'grid-cols-2 grid-rows-2' : ''}">
			{#each picks as id (id)}
				{#if failed[id]}
					<CoverFallback seed={id} className="h-full w-full" />
				{:else}
					<!-- CORS mode: these are weserv URLs, and a miss is a 404 with
					     a JSON body that Firefox's Opaque Response Blocking
					     refuses in no-cors mode, logging a warning per
					     artwork-less track. ORB does not apply to CORS requests
					     and weserv sends ACAO on hits and misses alike. -->
					<img
						src={getThumbnailUrl(id)}
						{alt}
						crossorigin="anonymous"
						loading="lazy"
						decoding="async"
						class="h-full w-full object-cover"
						on:error={() => (failed = { ...failed, [id]: true })}
					/>
				{/if}
			{/each}
		</div>
	{/if}
</div>
