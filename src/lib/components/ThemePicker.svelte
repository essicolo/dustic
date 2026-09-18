<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { theme } from '$lib/stores/theme';
	import { THEME_LIST, THEME_RADIUS, type ThemeId, type Theme } from '$lib/themes';
	import Icon from '$lib/components/Icon.svelte';
	import { _ } from '$lib/i18n';

	export let mode: 'first-launch' | 'settings' = 'first-launch';

	const dispatch = createEventDispatcher();

	let selected: ThemeId = $theme;

	function preview(id: ThemeId) {
		selected = id;
		theme.set(id);
	}

	function confirm() {
		theme.markPickerSeen();
		dispatch('done');
	}

	// Preview swatches use inline `style=` because each tile has to render in
	// *its own* palette, not the currently-applied one. Values come from a
	// typed THEMES table — no user input is interpolated.
	const tileStyle = (t: Theme) =>
		`background:${t.preview.bg};color:${t.preview.fg};border-radius:${THEME_RADIUS}`;
	const surfaceStyle = (t: Theme) =>
		`background:${t.preview.surface};border-radius:${THEME_RADIUS}`;
	const accentStyle = (t: Theme) =>
		`background:${t.preview.accent};color:${t.preview.accentFg};border-radius:${THEME_RADIUS}`;
	const mutedStyle = (t: Theme) => `color:${t.preview.muted}`;

	$: selectedName = $_(THEME_LIST.find((t) => t.id === selected)?.nameKey ?? '');
</script>

{#snippet tile(t: Theme)}
	<button
		type="button"
		class="flex h-full flex-col gap-3 p-4 text-left border-2 transition-transform hover:scale-[1.01] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
		style="{tileStyle(t)};border-color:{selected === t.id ? t.preview.accent : 'transparent'};"
		on:click={() => preview(t.id)}
		aria-label={$_('components.themePicker.useTheme', { values: { name: $_(t.nameKey) } })}
		aria-pressed={selected === t.id}
	>
		<div class="flex items-center justify-between">
			<span class="font-semibold text-base">{$_(t.nameKey)}</span>
			{#if selected === t.id}
				<Icon icon="solar:check-circle-bold" width="20" />
			{/if}
		</div>

		<!-- Miniature of the interface: a surface, a title, a play control. -->
		<div class="flex items-center gap-3 p-3" style={surfaceStyle(t)}>
			<span
				class="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
				style={accentStyle(t)}
			>
				<Icon icon="solar:play-bold" width="14" />
			</span>
			<span class="min-w-0 flex-1">
				<span class="block truncate text-sm font-medium">
					{$_('components.themePicker.trackSwatch')}
				</span>
				<span class="block truncate text-xs" style={mutedStyle(t)}>
					{$_('components.themePicker.artistSongSwatch')}
				</span>
			</span>
		</div>

		<span class="text-xs leading-relaxed mt-auto" style={mutedStyle(t)}>
			{$_(t.descriptionKey)}
		</span>
	</button>
{/snippet}

{#if mode === 'first-launch'}
	<div class="fixed inset-0 z-modal bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
		<div class="bg-base-100 rounded-lg max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
			<h2 class="text-2xl font-bold mb-2">{$_('components.themePicker.welcome')}</h2>
			<p class="text-base-content/70 mb-2">
				{$_('components.themePicker.pickStyle')}
			</p>
			<p class="text-sm text-base-content/50 mb-6">
				{$_('components.themePicker.noAccountHint')}
			</p>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 items-stretch">
				{#each THEME_LIST as t (t.id)}
					{@render tile(t)}
				{/each}
			</div>

			<div class="flex justify-end">
				<button class="btn btn-primary" on:click={confirm}>
					{$_('components.themePicker.continueWith', { values: { name: selectedName } })}
				</button>
			</div>
		</div>
	</div>
{:else}
	<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl items-stretch">
		{#each THEME_LIST as t (t.id)}
			{@render tile(t)}
		{/each}
	</div>
{/if}
