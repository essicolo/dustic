<script lang="ts">
	// The mark, inline rather than as an <img>, so it can take its colors
	// from the theme. static/logo-dustic.svg is a fixed black tile, which is
	// all but invisible against the dark theme's near-black background. Here
	// the tile is base-content and the dust is base-100, which reproduces the
	// original exactly in light and inverts it in dark.
	export let size = 32;
	export let className = '';
</script>

<svg
	viewBox="0 0 120 120"
	width={size}
	height={size}
	class={className}
	role="img"
	aria-label="dustic"
>
	<rect x="0" y="0" width="120" height="120" rx="8" class="fill-base-content" />
	<line x1="0" y1="105" x2="120" y2="105" class="stroke-base-100" stroke-width="2" />
	<g class="fill-base-100">
		<circle cx="50" cy="98" r="3.5" />
		<circle cx="70" cy="100" r="3" />
		<circle cx="60" cy="92" r="2.5" />
		<circle cx="48" cy="85" r="2.5" />
		<circle cx="72" cy="83" r="2.5" />
		<circle cx="58" cy="78" r="2" />
		<circle cx="45" cy="70" r="2" />
		<circle cx="68" cy="68" r="2" />
		<circle cx="55" cy="62" r="1.8" />
		<circle cx="75" cy="55" r="1.5" />
		<circle cx="50" cy="52" r="1.5" />
		<circle cx="62" cy="45" r="1.5" />
		<circle cx="48" cy="38" r="1.2" />
		<circle cx="70" cy="35" r="1.2" />
		<circle cx="58" cy="28" r="1" />
		<circle cx="65" cy="20" r="1" />
		<circle cx="52" cy="15" r="0.8" />
		<circle cx="72" cy="10" r="0.8" />
		<circle cx="60" cy="5" r="0.6" />
	</g>
</svg>
