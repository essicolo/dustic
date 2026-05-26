<script lang="ts">
	import { offline } from '$lib/stores/offline';
	import Icon from './Icon.svelte';
	import { _ } from '$lib/i18n';

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
			<h3 class="font-bold">{$_('components.storageWarning.title')}</h3>
			<p>
				{$_('components.storageWarning.body', { values: { percent: usagePercent.toFixed(0), mb: ($offline.storageUsed / 1024 / 1024).toFixed(0) } })}
			</p>
		</div>
		<div class="flex gap-2">
			<button on:click={clearOldest} class="btn btn-sm" aria-label={$_('components.storageWarning.clearOldestAria')}>
				{$_('components.storageWarning.clearOldest')}
			</button>
		</div>
	</div>
{/if}
