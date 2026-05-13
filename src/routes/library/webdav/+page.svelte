<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';

	// /library/webdav existed in earlier iterations. The library hub now lists
	// audio sources directly, so this route just redirects.
	onMount(() => {
		goto(`${base}/library`, { replaceState: true });
	});
</script>
