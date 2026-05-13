<script lang="ts">
	import AutoplayRuleEditor from '$lib/components/Settings/AutoplayRuleEditor.svelte';
	import { settings } from '$lib/stores/settings';
	import Icon from '$lib/components/Icon.svelte';
	import { base } from '$app/paths';
	import type { AudioQuality } from '$lib/types';
	import ThemePicker from '$lib/components/ThemePicker.svelte';

	function handleQualityChange(quality: AudioQuality) {
		settings.setAudioQuality(quality);
	}
</script>

<!-- Appearance / Theme -->
	<div class="card bg-base-200 mb-6">
		<div class="card-body">
			<h3 class="card-title mb-4">
				<Icon icon="solar:pallete-2-bold" width="24" />
				Appearance
			</h3>
			<p class="text-sm text-base-content/70 mb-4">
				Pick a theme. "Minimal" keeps the pure monochrome look; the others apply soft corners,
				warmer surfaces, and an accent color used for likes, the play button, and the progress bar.
			</p>
			<ThemePicker mode="settings" />
		</div>
	</div>

	<!-- Audio Quality Settings -->
	<div class="card bg-base-200 mb-6">
		<div class="card-body">
			<h3 class="card-title mb-4">
				<Icon icon="solar:music-library-2-bold" width="24" />
				Audio Quality
			</h3>
			<p class="text-sm text-base-content/70 mb-4">
				Choose the audio quality for streaming and downloads.
				<span class="opacity-70">Applies to Internet Archive only — FunkWhale and your folders use whatever the file provides.</span>
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
							<span class="label-text font-semibold">Lowest Quality</span>
							<span class="badge badge-sm">64-128kbps</span>
						</div>
						<p class="text-xs text-base-content/60">
							Smallest file sizes. Best for mobile data or slow connections. Formats: 64kbps MP3, 128kbps MP3, Ogg Vorbis.
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
							<span class="label-text font-semibold">Medium Quality (Recommended)</span>
							<span class="badge badge-sm badge-primary">128-192kbps</span>
						</div>
						<p class="text-xs text-base-content/60">
							Good balance of quality and size. Formats: VBR MP3, 128kbps MP3, Ogg Vorbis.
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
							<span class="label-text font-semibold">Best Quality</span>
							<span class="badge badge-sm">FLAC/320kbps</span>
						</div>
						<p class="text-xs text-base-content/60">
							Highest quality available. Larger file sizes. Formats: FLAC (lossless), 320kbps MP3, VBR MP3.
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
					<strong>Note:</strong> Quality applies to both streaming and offline downloads. Not all items have all formats available - the app will use the best match.
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
