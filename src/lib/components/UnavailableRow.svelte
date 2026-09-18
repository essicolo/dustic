<script lang="ts">
	// A saved item the archive will no longer serve.
	//
	// The alternative was what the app did before: catch the failure, return
	// null, and filter it out — so something the listener had deliberately
	// favourited disappeared from their own library with no explanation
	// anywhere but the console. Their library is their data; an entry going
	// quiet is not a reason to delete it behind their back.
	//
	// Nothing is removed automatically. A darkened item is withheld rather
	// than deleted and can come back, so the choice to forget it stays with
	// the person who saved it.
	import Icon from './Icon.svelte';
	import CoverFallback from './CoverFallback.svelte';
	import { _ } from '$lib/i18n';
	import { createEventDispatcher } from 'svelte';

	/** The saved identifier, shown when no title was ever stored. */
	export let identifier: string;
	/** Whatever title we have; often only the identifier. */
	export let title: string = '';
	/** Restricted (withheld, may return) rather than removed outright. */
	export let restricted = false;

	const dispatch = createEventDispatcher<{ remove: { identifier: string } }>();
</script>

<div class="flex items-center gap-3 opacity-60">
	<CoverFallback seed={identifier} className="w-14 h-14 my-2 ml-2 flex-shrink-0 rounded" />

	<div class="min-w-0 flex-1 py-2">
		<div class="truncate font-medium line-through decoration-base-content/40">
			{title || identifier}
		</div>
		<div class="flex items-center gap-1.5 text-sm text-base-content/70">
			<Icon icon="solar:danger-triangle-linear" width="14" class="flex-shrink-0" />
			<span class="truncate">
				{restricted ? $_('errors.itemRestricted') : $_('errors.itemUnavailable')}
			</span>
		</div>
	</div>

	<button
		class="btn btn-ghost btn-sm btn-circle mr-2 flex-shrink-0"
		title={$_('library.removeUnavailable')}
		aria-label={$_('library.removeUnavailable')}
		on:click={() => dispatch('remove', { identifier })}
	>
		<Icon icon="solar:trash-bin-trash-linear" width="18" />
	</button>
</div>
