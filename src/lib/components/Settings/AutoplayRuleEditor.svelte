<script lang="ts">
	import { autoplayStore } from '$lib/stores/autoplay';
	import { settings } from '$lib/stores/settings';
	import { _ } from '$lib/i18n';

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
