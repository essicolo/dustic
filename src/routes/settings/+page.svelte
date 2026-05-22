<script lang="ts">
	import AutoplayRuleEditor from '$lib/components/Settings/AutoplayRuleEditor.svelte';
	import { settings } from '$lib/stores/settings';
	import Icon from '$lib/components/Icon.svelte';
	import type { AudioQuality } from '$lib/types';
	import ThemePicker from '$lib/components/ThemePicker.svelte';
	import { _, setAppLocale, SUPPORTED_LOCALES, type SupportedLocale } from '$lib/i18n';

	function handleQualityChange(quality: AudioQuality) {
		settings.setAudioQuality(quality);
	}

	async function handleLanguageChange(event: Event) {
		const value = (event.target as HTMLSelectElement).value as SupportedLocale;
		settings.setLanguage(value);
		await setAppLocale(value);
	}

	$: currentLang = ($settings.language ?? 'en') as SupportedLocale;
</script>

<!-- Language -->
<div class="card bg-base-200 mb-6">
	<div class="card-body">
		<h3 class="card-title mb-4">
			<Icon icon="solar:global-bold" width="24" />
			{$_('settings.language.title')}
		</h3>
		<p class="text-sm text-base-content/70 mb-4">
			{$_('settings.language.description')}
		</p>
		<select
			class="select select-bordered max-w-xs"
			value={currentLang}
			on:change={handleLanguageChange}
		>
			{#each SUPPORTED_LOCALES as code}
				<option value={code}>{$_(`settings.language.options.${code}`)}</option>
			{/each}
		</select>
	</div>
</div>

<!-- Appearance / Theme -->
<div class="card bg-base-200 mb-6">
	<div class="card-body">
		<h3 class="card-title mb-4">
			<Icon icon="solar:pallete-2-bold" width="24" />
			{$_('settings.appearance.title')}
		</h3>
		<p class="text-sm text-base-content/70 mb-4">
			{$_('settings.appearance.description')}
		</p>
		<ThemePicker mode="settings" />
	</div>
</div>

<!-- Audio Quality Settings -->
<div class="card bg-base-200 mb-6">
	<div class="card-body">
		<h3 class="card-title mb-4">
			<Icon icon="solar:music-library-2-bold" width="24" />
			{$_('settings.audio.title')}
		</h3>
		<p class="text-sm text-base-content/70 mb-4">
			{$_('settings.audio.description')}
			<span class="opacity-70">{$_('settings.audio.scopeNote')}</span>
		</p>

		<div class="form-control gap-3">
			<!-- Lowest Quality -->
			<label class="label cursor-pointer border rounded-lg p-4 hover:bg-base-300 transition-colors"
				class:bg-base-300={$settings.audioQuality === 'lowest'}
				class:border-primary={$settings.audioQuality === 'lowest'}
			>
				<div class="flex-1">
					<div class="flex items-center gap-2 mb-1">
						<Icon icon="solar:smartphone-2-bold" width="20" />
						<span class="label-text font-semibold">{$_('settings.audio.lowest.label')}</span>
						<span class="badge badge-sm">{$_('settings.audio.lowest.badge')}</span>
					</div>
					<p class="text-xs text-base-content/60">
						{$_('settings.audio.lowest.description')}
					</p>
				</div>
				<input
					type="radio"
					name="audio-quality"
					class="radio radio-primary"
					checked={$settings.audioQuality === 'lowest'}
					on:change={() => handleQualityChange('lowest')}
				/>
			</label>

			<!-- Medium Quality -->
			<label class="label cursor-pointer border rounded-lg p-4 hover:bg-base-300 transition-colors"
				class:bg-base-300={$settings.audioQuality === 'medium'}
				class:border-primary={$settings.audioQuality === 'medium'}
			>
				<div class="flex-1">
					<div class="flex items-center gap-2 mb-1">
						<Icon icon="solar:headphones-round-sound-bold" width="20" />
						<span class="label-text font-semibold">{$_('settings.audio.medium.label')}</span>
						<span class="badge badge-sm badge-primary">{$_('settings.audio.medium.badge')}</span>
					</div>
					<p class="text-xs text-base-content/60">
						{$_('settings.audio.medium.description')}
					</p>
				</div>
				<input
					type="radio"
					name="audio-quality"
					class="radio radio-primary"
					checked={$settings.audioQuality === 'medium'}
					on:change={() => handleQualityChange('medium')}
				/>
			</label>

			<!-- Best Quality -->
			<label class="label cursor-pointer border rounded-lg p-4 hover:bg-base-300 transition-colors"
				class:bg-base-300={$settings.audioQuality === 'best'}
				class:border-primary={$settings.audioQuality === 'best'}
			>
				<div class="flex-1">
					<div class="flex items-center gap-2 mb-1">
						<Icon icon="solar:music-note-bold" width="20" />
						<span class="label-text font-semibold">{$_('settings.audio.best.label')}</span>
						<span class="badge badge-sm">{$_('settings.audio.best.badge')}</span>
					</div>
					<p class="text-xs text-base-content/60">
						{$_('settings.audio.best.description')}
					</p>
				</div>
				<input
					type="radio"
					name="audio-quality"
					class="radio radio-primary"
					checked={$settings.audioQuality === 'best'}
					on:change={() => handleQualityChange('best')}
				/>
			</label>
		</div>

		<div class="alert alert-info mt-4">
			<Icon icon="solar:info-circle-bold" width="20" />
			<div class="text-sm">
				<strong>{$_('settings.audio.note.strong')}</strong> {$_('settings.audio.note.body')}
			</div>
		</div>
	</div>
</div>

<!-- Autoplay Settings -->
<div class="card bg-base-200">
	<div class="card-body">
		<AutoplayRuleEditor />
	</div>
</div>
