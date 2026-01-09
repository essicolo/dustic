<script lang="ts">
	import Icon from './Icon.svelte';

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
				<button on:click={onRetry} class="btn btn-sm btn-ghost" aria-label="Retry failed operation">
					<Icon icon="solar:refresh-bold" width="16" />
					Retry
				</button>
			{/if}
			{#if onDismiss}
				<button on:click={onDismiss} class="btn btn-sm btn-ghost" aria-label="Dismiss error">
					<Icon icon="solar:close-bold" width="16" />
				</button>
			{/if}
		</div>
	</div>
</div>
