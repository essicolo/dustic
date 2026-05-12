<script lang="ts">
	import { onMount } from 'svelte';
	import { checkForUpdates, setCurrentVersion, reloadApp } from '$lib/utils/version';
	import Icon from '$lib/components/Icon.svelte';

	let showUpdatePrompt = false;
	let checking = false;

	onMount(() => {
		// Check for updates on mount
		checkVersion();

		// Check every 5 minutes
		const interval = setInterval(checkVersion, 5 * 60 * 1000);

		return () => clearInterval(interval);
	});

	async function checkVersion() {
		if (checking) return;

		// Check if snoozed (Issue #13 - persistent snooze)
		const snoozeUntil = localStorage.getItem('update_snooze_until');
		if (snoozeUntil && Date.now() < parseInt(snoozeUntil)) {
			return; // Still snoozed
		}

		localStorage.removeItem('update_snooze_until');
		checking = true;

		try {
			// Fetch current version from server
			const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-cache' });
			if (!response.ok) {
				checking = false;
				return;
			}

			const data = await response.json();
			const storedVersion = localStorage.getItem('app_version');

			// First time user - just set the version without showing update
			if (!storedVersion) {
				setCurrentVersion(data.version);
				checking = false;
				return;
			}

			// Check if version changed
			if (storedVersion !== data.version) {
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

		try {
			// Fetch latest version and set it
			const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-cache' });
			const data = await response.json();
			console.log('Updating to version:', data.version, 'App version:', data.appVersion);
			setCurrentVersion(data.version);

			// Reload app with cleared caches
			await reloadApp();
		} catch (error) {
			console.error('Update failed:', error);
			// Retry by just reloading
			window.location.reload();
		}
	}

	function dismissUpdate() {
		showUpdatePrompt = false;

		// Snooze for 1 hour (Issue #13 - persistent across sessions)
		const snoozeUntil = Date.now() + 60 * 60 * 1000;
		localStorage.setItem('update_snooze_until', snoozeUntil.toString());
	}
</script>

{#if showUpdatePrompt}
	<div class="toast toast-top toast-center z-50 mt-16">
		<div class="alert alert-info shadow-lg flex-col sm:flex-row">
			<div class="flex items-center gap-2">
				<Icon icon="solar:refresh-circle-bold" width="24" />
				<div>
					<h3 class="font-bold">Update Available</h3>
					<p class="text-sm">A new version of Inde is available</p>
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
