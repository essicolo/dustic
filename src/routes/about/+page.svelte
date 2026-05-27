<script lang="ts">
	// Legacy redirect: /about moved into Settings → About tab in May 2026.
	// Kept here for stale bookmarks and external links; the file is tiny
	// because all the actual content lives in /settings/about.
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';

	onMount(() => {
		void goto(`${base}/settings/about`, { replaceState: true });
	});
</script>
