<script lang="ts">
	import Icon from './Icon.svelte';
	import { _ } from '$lib/i18n';

	export let error: string;
	export let onRetry: (() => void) | null = null;
	export let onDismiss: (() => void) | null = null;
</script>

<div class="alert alert-error shadow-lg" role="alert">
	<div class="flex items-start gap-2 w-full">
		<Icon icon="solar:danger-triangle-bold" width="24" />
		<div class="flex-1">
			<p>{error}</p>
		</div>
		<div class="flex gap-2">
			{#if onRetry}
				<button on:click={onRetry} class="btn btn-sm btn-ghost" aria-label={$_('components.errorAlert.retryAria')}>
					<Icon icon="solar:refresh-bold" width="16" />
					{$_('components.errorAlert.retry')}
				</button>
			{/if}
			{#if onDismiss}
				<button on:click={onDismiss} class="btn btn-sm btn-ghost" aria-label={$_('components.errorAlert.dismissAria')}>
					<Icon icon="solar:close-bold" width="16" />
				</button>
			{/if}
		</div>
	</div>
</div>
