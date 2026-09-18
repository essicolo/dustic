<script lang="ts">
	// Mounted once, in the root layout. Replaces the per-page toast markup
	// that was copied across four routes.
	import { notifications } from '$lib/stores/notifications';
	import Icon from './Icon.svelte';
	import { _ } from '$lib/i18n';
	import { fly } from 'svelte/transition';
	import { browser } from '$app/environment';

	const reduceMotion =
		browser && window.matchMedia
			? window.matchMedia('(prefers-reduced-motion: reduce)').matches
			: false;
	$: enter = reduceMotion ? { duration: 0 } : { y: 8, duration: 200 };
</script>

{#if $notifications.length > 0}
	<div class="toast toast-top toast-center z-toast" role="status" aria-live="polite">
		{#each $notifications as n (n.id)}
			<div
				class="alert {n.kind === 'error' ? 'alert-error' : 'alert-success'} shadow-lg"
				in:fly={enter}
			>
				<Icon
					icon={n.kind === 'error' ? 'solar:danger-triangle-bold' : 'solar:check-circle-bold'}
					width="20"
				/>
				<span>{$_(n.messageKey, { values: n.values })}</span>
				<button
					class="btn btn-ghost btn-xs btn-circle"
					on:click={() => notifications.dismiss(n.id)}
					aria-label={$_('common.close')}
				>
					<Icon icon="solar:close-circle-bold" width="16" />
				</button>
			</div>
		{/each}
	</div>
{/if}
