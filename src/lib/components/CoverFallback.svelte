<script lang="ts">
	// Drawn when an item has no artwork, which on the Internet Archive is a
	// large minority of audio.
	//
	// The alternatives were all worse: the archive's own notfound.png is the
	// same black building logo on every item, a grey music-note icon reads as
	// "broken" rather than "no cover", and a remote placeholder service means
	// a third-party request in an app that deliberately makes none.
	//
	// So the fallback is the brand mark: the dust from the logo, scattered by
	// the identifier. Geometry lives in $lib/utils/coverArt so it can be
	// tested on its own.
	import { generateMotes } from '$lib/utils/coverArt';

	/** Seeds the tile; the item identifier where one is available. */
	export let seed = '';
	export let className = '';

	$: motes = generateMotes(seed);
</script>

<div class="relative aspect-square overflow-hidden bg-base-300 {className}">
	<svg viewBox="0 0 100 100" class="h-full w-full" aria-hidden="true" focusable="false">
		<line
			x1="0"
			y1="95"
			x2="100"
			y2="95"
			class="stroke-base-content"
			stroke-width="1.2"
			opacity="0.35"
		/>
		<g class="fill-base-content">
			{#each motes as m, i (i)}
				<circle cx={m.cx} cy={m.cy} r={m.r} opacity={m.opacity} />
			{/each}
		</g>
	</svg>
</div>
