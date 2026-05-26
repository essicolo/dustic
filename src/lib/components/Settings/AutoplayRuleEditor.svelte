<script lang="ts">
	import { autoplayStore } from '$lib/stores/autoplay';
	import {
		settings,
		resolveAutoplayContentTypes,
		resolveAutoplaySources,
		type AutoplayContentType,
		type AutoplaySource
	} from '$lib/stores/settings';
	import { _ } from '$lib/i18n';

	$: contentTypes = resolveAutoplayContentTypes($settings);
	$: enabledTypeCount = Object.values(contentTypes).filter(Boolean).length;
	$: sources = resolveAutoplaySources($settings);
	$: enabledSourceCount = Object.values(sources).filter(Boolean).length;

	function toggleContentType(type: AutoplayContentType, e: Event) {
		const input = e.target as HTMLInputElement;
		const desired = input.checked;
		const ok = settings.setAutoplayContentType(type, desired);
		if (!ok) {
			// Block the last-remaining-enabled toggle from being turned off
			// — autoplay needs at least one source. Re-check the box and
			// surface a hint via the visible "at least one" caption below.
			input.checked = true;
		}
	}

	function toggleSource(src: AutoplaySource, e: Event) {
		const input = e.target as HTMLInputElement;
		const ok = settings.setAutoplaySource(src, input.checked);
		if (!ok) input.checked = true;
	}

	function handleReset() {
		if (confirm($_('autoplay.resetConfirm'))) {
			autoplayStore.resetToDefaults();
		}
	}

	let draggedIndex: number | null = null;

	function handleDragStart(index: number) {
		draggedIndex = index;
	}

	function handleDragOver(e: DragEvent, index: number) {
		e.preventDefault();
		if (draggedIndex !== null && draggedIndex !== index) {
			autoplayStore.reorderRules(draggedIndex, index);
			draggedIndex = index;
		}
	}

	function handleDragEnd() {
		draggedIndex = null;
	}

	$: totalWeight = $autoplayStore.rules
		.filter((r) => r.enabled)
		.reduce((sum, r) => sum + r.weight, 0);
</script>

<div class="space-y-4">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h3 class="text-lg font-bold">{$_('autoplay.title')}</h3>
			<p class="text-sm text-base-content/70">
				{$_('autoplay.subtitle')}
			</p>
		</div>
		<button on:click={handleReset} class="btn btn-ghost btn-sm">
			{$_('autoplay.reset')}
		</button>
	</div>

	<!-- Global Toggle -->
	<div class="alert">
		<label class="flex items-center gap-3 cursor-pointer w-full">
			<input
				type="checkbox"
				checked={$autoplayStore.enabled}
				on:change={() => autoplayStore.toggleAutoplay()}
				class="toggle toggle-primary"
			/>
			<div class="flex-1">
				<div class="font-medium">{$_('autoplay.enableTitle')}</div>
				<div class="text-sm text-base-content/70">
					{$_('autoplay.enableHint')}
				</div>
			</div>
		</label>
	</div>

	<!-- Favorites Influence Toggle -->
	<div class="alert">
		<label class="flex items-center gap-3 cursor-pointer w-full">
			<input
				type="checkbox"
				checked={$settings.favoriteInfluencedAutoplay !== false}
				on:change={() => settings.setFavoriteInfluencedAutoplay($settings.favoriteInfluencedAutoplay === false)}
				class="toggle toggle-primary"
			/>
			<div class="flex-1">
				<div class="font-medium">{$_('autoplay.favoritesTitle')}</div>
				<div class="text-sm text-base-content/70">
					{$_('autoplay.favoritesHint')}
				</div>
			</div>
		</label>
	</div>

	<!-- Content Type Filters: cap what autoplay can pull in. Defaults to
	     music-only to avoid the IA "popular = podcasts" pit. -->
	<div class="alert flex-col items-stretch gap-2">
		<div>
			<div class="font-medium">{$_('autoplay.contentTypesTitle')}</div>
			<div class="text-sm text-base-content/70">
				{$_('autoplay.contentTypesHint')}
			</div>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
			{#each ['music', 'podcasts', 'audiobooks'] as type (type)}
				{@const isOn = contentTypes[type as AutoplayContentType]}
				{@const isLastOn = isOn && enabledTypeCount === 1}
				<label
					class="flex items-center gap-2 cursor-pointer rounded-lg p-2 hover:bg-base-300/40"
					class:opacity-50={isLastOn}
				>
					<input
						type="checkbox"
						checked={isOn}
						disabled={isLastOn}
						on:change={(e) => toggleContentType(type as AutoplayContentType, e)}
						class="checkbox checkbox-primary checkbox-sm"
					/>
					<span class="text-sm">{$_(`autoplay.contentType.${type}`)}</span>
				</label>
			{/each}
		</div>
		<div class="text-xs text-base-content/50">
			{$_('autoplay.contentTypesMinOne')}
		</div>
	</div>

	<!-- Source Filters: where autoplay is allowed to pull tracks from.
	     Toggles are no-ops when the source isn't configured (no FW
	     instances, no WebDAV libraries) — they only gate sources you've
	     actually set up. -->
	<div class="alert flex-col items-stretch gap-2">
		<div>
			<div class="font-medium">{$_('autoplay.sourcesTitle')}</div>
			<div class="text-sm text-base-content/70">
				{$_('autoplay.sourcesHint')}
			</div>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
			{#each ['ia', 'funkwhale', 'webdav'] as src (src)}
				{@const isOn = sources[src as AutoplaySource]}
				{@const isLastOn = isOn && enabledSourceCount === 1}
				<label
					class="flex items-center gap-2 cursor-pointer rounded-lg p-2 hover:bg-base-300/40"
					class:opacity-50={isLastOn}
				>
					<input
						type="checkbox"
						checked={isOn}
						disabled={isLastOn}
						on:change={(e) => toggleSource(src as AutoplaySource, e)}
						class="checkbox checkbox-primary checkbox-sm"
					/>
					<span class="text-sm">{$_(`autoplay.source.${src}`)}</span>
				</label>
			{/each}
		</div>
		<div class="text-xs text-base-content/50">
			{$_('autoplay.sourcesMinOne')}
		</div>
	</div>

	<!-- Rules List -->
	<div class="bg-base-200 rounded-lg p-4">
		<div class="space-y-2">
			{#each $autoplayStore.rules as rule, index}
				<div
					draggable="true"
					on:dragstart={() => handleDragStart(index)}
					on:dragover={(e) => handleDragOver(e, index)}
					on:dragend={handleDragEnd}
					role="button"
					tabindex="0"
					class="bg-base-100 rounded-lg p-4 hover:bg-base-300/50 transition-colors cursor-move"
					class:opacity-50={!rule.enabled}
				>
					<div class="flex items-center gap-3">
						<!-- Drag Handle -->
						<div class="text-base-content/30 cursor-move">
							<svg
								class="w-4 h-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M4 8h16M4 16h16"
								/>
							</svg>
						</div>

						<!-- Enable Toggle -->
						<input
							type="checkbox"
							checked={rule.enabled}
							on:change={() => autoplayStore.toggleRule(rule.id)}
							class="checkbox checkbox-primary checkbox-sm"
						/>

						<!-- Rule Info -->
						<div class="flex-1">
							<div class="font-medium">{$_(`autoplay.rules.${rule.id}`, { default: rule.name })}</div>
							<div class="text-xs text-base-content/50">
								{#if totalWeight > 0 && rule.enabled}
									{$_('autoplay.percentChance', { values: { n: ((rule.weight / totalWeight) * 100).toFixed(0) } })}
								{:else}
									{$_('autoplay.disabled')}
								{/if}
							</div>
						</div>

						<!-- Weight Slider -->
						{#if rule.enabled}
							<div class="flex items-center gap-2 w-48">
								<input
									type="range"
									min="0"
									max="100"
									value={rule.weight}
									on:input={(e) =>
										autoplayStore.setWeight(
											rule.id,
											parseInt((e.target as HTMLInputElement).value)
										)}
									class="range range-primary range-xs flex-1"
								/>
								<span class="text-sm text-base-content/70 w-8 text-right">{rule.weight}</span>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Info -->
	<div class="text-xs text-base-content/50 space-y-1">
		<p><strong>{$_('autoplay.howItWorks')}</strong></p>
		<ul class="list-disc list-inside space-y-1 ml-2">
			<li>{$_('autoplay.how1')}</li>
			<li>{$_('autoplay.how2')}</li>
			<li>{$_('autoplay.how3')}</li>
			<li>{$_('autoplay.how4')}</li>
			<li>{$_('autoplay.how5')}</li>
		</ul>
	</div>
</div>
