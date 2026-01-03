<script lang="ts">
	import { onMount } from 'svelte';
	import { checkForUpdates, setCurrentVersion, reloadApp } from '$lib/utils/version';
	import Icon from '$lib/components/Icon.svelte';

	let showUpdatePrompt = false;
	let checking = false;

	onMount(async () => {
		// Check for updates on mount
		await checkVersion();

		// Check every 5 minutes
		const interval = setInterval(checkVersion, 5 * 60 * 1000);

		return () => clearInterval(interval);
	});

	async function checkVersion() {
		if (checking) return;
		checking = true;

		try {
			const hasUpdate = await checkForUpdates();
			if (hasUpdate) {
				showUpdatePrompt = true;
			}
		} catch (error) {
			console.error('Update check failed:', error);
		} finally {
			checking = false;
		}
	}

	async function handleUpdate() {
		showUpdatePrompt = false;

		// Fetch latest version
		const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-cache' });
		const data = await response.json();
		setCurrentVersion(data.version);

		// Reload app
		await reloadApp();
	}

	function dismissUpdate() {
		showUpdatePrompt = false;
	}
</script>

{#if showUpdatePrompt}
	<div class="toast toast-top toast-center z-50 mt-16">
		<div class="alert alert-info shadow-lg flex-col sm:flex-row">
			<div class="flex items-center gap-2">
				<Icon icon="solar:refresh-circle-bold" width="24" />
				<div>
					<h3 class="font-bold">Update Available</h3>
					<p class="text-sm">A new version of Dustic is available</p>
				</div>
			</div>
			<div class="flex gap-2">
				<button on:click={handleUpdate} class="btn btn-sm btn-primary">
					Update Now
				</button>
				<button on:click={dismissUpdate} class="btn btn-sm btn-ghost">
					Later
				</button>
			</div>
		</div>
	</div>
{/if}
