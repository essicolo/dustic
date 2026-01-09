<script lang="ts">
	import { offline } from '$lib/stores/offline';
	import Icon from './Icon.svelte';

	let showWarning = false;
	let usagePercent = 0;

	$: {
		if ($offline.storageQuota > 0) {
			usagePercent = ($offline.storageUsed / $offline.storageQuota) * 100;
			showWarning = usagePercent >= 80;
		}
	}

	async function clearOldest() {
		const tracks = $offline.offlineTracks.sort((a, b) => a.downloadedAt - b.downloadedAt);
		if (tracks.length > 0) {
			await offline.deleteTrack(tracks[0].track.identifier);
		}
	}
</script>

{#if showWarning}
	<div class="alert alert-warning shadow-lg" role="alert">
		<Icon icon="solar:danger-triangle-bold" width="24" />
		<div>
			<h3 class="font-bold">Storage Almost Full</h3>
			<p>
				You're using {usagePercent.toFixed(0)}% of available storage ({(
					$offline.storageUsed /
					1024 /
					1024
				).toFixed(0)}MB).
			</p>
		</div>
		<div class="flex gap-2">
			<button on:click={clearOldest} class="btn btn-sm" aria-label="Clear oldest downloaded track">
				Clear Oldest
			</button>
		</div>
	</div>
{/if}
