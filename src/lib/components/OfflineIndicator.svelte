<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';

	let isOnline = true;

	onMount(() => {
		isOnline = navigator.onLine;

		const handleOnline = () => (isOnline = true);
		const handleOffline = () => (isOnline = false);

		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	});
</script>

{#if !isOnline}
	<div class="toast toast-bottom toast-center z-50" role="status" aria-live="polite">
		<div class="alert alert-warning shadow-lg">
			<Icon icon="solar:wifi-off-bold" width="24" />
			<span>You are offline. Only downloaded tracks are available.</span>
		</div>
	</div>
{/if}
