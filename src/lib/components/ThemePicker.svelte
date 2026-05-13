<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { theme } from '$lib/stores/theme';
	import { THEME_LIST, type ThemeId, type Theme } from '$lib/themes';
	import Icon from '$lib/components/Icon.svelte';

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

	// Inline mock card preview using each theme's preview palette.
	function mockCardStyle(t: Theme): string {
		return [
			`background:${t.preview.bg}`,
			`color:${t.preview.fg}`,
			`border-radius:${t.meta['--card-radius']}`,
			`box-shadow:${t.meta['--shadow']}`
		].join(';');
	}

	function mockAccentStyle(t: Theme): string {
		return `background:${t.preview.accent};color:${t.preview.accentFg}`;
	}

	function mockMutedStyle(t: Theme): string {
		return `color:${t.preview.muted}`;
	}
</script>

{#if mode === 'first-launch'}
	<div class="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
		<div class="bg-base-100 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
			<h2 class="text-2xl font-bold mb-2">Welcome to Dustic</h2>
			<p class="text-base-content/70 mb-6">
				Pick a style to get started — you can change this anytime in Settings.
			</p>

			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
				{#each THEME_LIST as t}
					<button
						class="text-left p-4 transition-all border-2 hover:scale-[1.02]"
						style="{mockCardStyle(t)};border-color:{selected === t.id ? t.preview.accent : 'transparent'};"
						on:click={() => preview(t.id)}
					>
						<div class="flex items-center justify-between mb-3">
							<span class="font-semibold text-base">{t.name}</span>
							{#if selected === t.id}
								<Icon icon="solar:check-circle-bold" width="20" />
							{/if}
						</div>
						<div class="text-xs leading-relaxed mb-3" style={mockMutedStyle(t)}>
							{t.description}
						</div>
						<div class="flex items-center gap-2">
							<span
								class="inline-block px-2 py-1 text-xs font-medium"
								style="{mockAccentStyle(t)};border-radius:calc({t.meta['--card-radius']} / 2);"
							>
								Play
							</span>
							<span style={mockMutedStyle(t)} class="text-xs">
								Artist · Song
							</span>
						</div>
					</button>
				{/each}
			</div>

			<div class="flex justify-end">
				<button class="btn btn-primary" on:click={confirm}>
					Continue with {THEME_LIST.find((t) => t.id === selected)?.name}
				</button>
			</div>
		</div>
	</div>
{:else}
	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
		{#each THEME_LIST as t}
			<button
				class="text-left p-4 transition-all border-2 hover:scale-[1.02]"
				style="{mockCardStyle(t)};border-color:{selected === t.id ? t.preview.accent : 'transparent'};"
				on:click={() => preview(t.id)}
			>
				<div class="flex items-center justify-between mb-3">
					<span class="font-semibold text-base">{t.name}</span>
					{#if selected === t.id}
						<Icon icon="solar:check-circle-bold" width="20" />
					{/if}
				</div>
				<div class="text-xs leading-relaxed mb-3" style={mockMutedStyle(t)}>
					{t.description}
				</div>
				<div class="flex items-center gap-2">
					<span
						class="inline-block px-2 py-1 text-xs font-medium"
						style="{mockAccentStyle(t)};border-radius:calc({t.meta['--card-radius']} / 2);"
					>
						Play
					</span>
					<span style={mockMutedStyle(t)} class="text-xs">
						Artist · Song
					</span>
				</div>
			</button>
		{/each}
	</div>
{/if}
