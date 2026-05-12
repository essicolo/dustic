<script lang="ts">
	import AutoplayRuleEditor from '$lib/components/Settings/AutoplayRuleEditor.svelte';
	import { settings } from '$lib/stores/settings';
	import Icon from '$lib/components/Icon.svelte';
	import { base } from '$app/paths';
	import type { AudioQuality } from '$lib/types';
	import { DEFAULT_FUNKWHALE_INSTANCES } from '$lib/utils/constants';

	function handleQualityChange(quality: AudioQuality) {
		settings.setAudioQuality(quality);
	}

	// FunkWhale instance management
	let newInstanceUrl = '';
	let newInstanceName = '';
	let addInstanceError = '';

	$: funkwhaleInstances = $settings.funkwhaleInstances || DEFAULT_FUNKWHALE_INSTANCES;

	function addInstance() {
		addInstanceError = '';
		const url = newInstanceUrl.trim();
		const name = newInstanceName.trim();

		if (!url) {
			addInstanceError = 'URL is required';
			return;
		}

		try {
			new URL(url);
		} catch {
			addInstanceError = 'Invalid URL';
			return;
		}

		settings.addFunkwhaleInstance(url, name || new URL(url).host);
		newInstanceUrl = '';
		newInstanceName = '';
	}
</script>

<div class="p-8 max-w-4xl">
	<h2 class="text-3xl font-bold mb-6">Settings</h2>

	<!-- Navigation Tabs -->
	<div class="tabs tabs-boxed mb-6">
		<a href="{base}/settings" class="tab tab-active">Preferences</a>
		<a href="{base}/settings/profile" class="tab">Profile Data</a>
		<a href="{base}/settings/libraries" class="tab">WebDAV Libraries</a>
	</div>

	<!-- Audio Quality Settings -->
	<div class="card bg-base-200 mb-6">
		<div class="card-body">
			<h3 class="card-title mb-4">
				<Icon icon="solar:music-library-2-bold" width="24" />
				Audio Quality
			</h3>
			<p class="text-sm text-base-content/70 mb-4">
				Choose the audio quality for streaming and downloads. Archive.org files have different quality levels available.
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

	<!-- FunkWhale Instances -->
	<div class="card bg-base-200 mb-6">
		<div class="card-body">
			<h3 class="card-title mb-4">
				<img src="/funkwhale-icon.svg" alt="FunkWhale" class="w-6 h-6" />
				FunkWhale Sources
			</h3>
			<p class="text-sm text-base-content/70 mb-4">
				Connect to public FunkWhale instances to search their music libraries alongside Internet Archive. Results from all enabled instances appear in your search.
			</p>

			<!-- Current instances -->
			<div class="space-y-2 mb-4">
				{#each funkwhaleInstances as instance}
					<div class="flex items-center gap-3 p-3 border rounded-lg"
						class:border-primary={instance.enabled}
						class:opacity-50={!instance.enabled}
					>
						<input
							type="checkbox"
							class="toggle toggle-primary toggle-sm"
							checked={instance.enabled}
							on:change={() => settings.toggleFunkwhaleInstance(instance.url)}
						/>
						<div class="flex-1 min-w-0">
							<div class="font-semibold text-sm truncate">{instance.name}</div>
							<div class="text-xs text-base-content/50 truncate">{instance.url}</div>
						</div>
						<button
							class="btn btn-ghost btn-xs btn-square"
							title="Remove instance"
							on:click={() => settings.removeFunkwhaleInstance(instance.url)}
						>
							<Icon icon="solar:close-circle-bold" width="16" />
						</button>
					</div>
				{/each}

				{#if funkwhaleInstances.length === 0}
					<p class="text-sm text-base-content/50 italic">No FunkWhale instances configured.</p>
				{/if}
			</div>

			<!-- Add new instance -->
			<div class="border-t border-base-content/10 pt-4">
				<h4 class="text-sm font-semibold mb-2">Add Instance</h4>
				<div class="flex flex-col sm:flex-row gap-2">
					<input
						type="url"
						bind:value={newInstanceUrl}
						placeholder="https://funkwhale.example.com"
						class="input input-bordered input-sm flex-1"
						on:keydown={(e) => e.key === 'Enter' && addInstance()}
					/>
					<input
						type="text"
						bind:value={newInstanceName}
						placeholder="Display name (optional)"
						class="input input-bordered input-sm w-full sm:w-40"
						on:keydown={(e) => e.key === 'Enter' && addInstance()}
					/>
					<button class="btn btn-primary btn-sm" on:click={addInstance}>
						Add
					</button>
				</div>
				{#if addInstanceError}
					<p class="text-error text-xs mt-1">{addInstanceError}</p>
				{/if}
			</div>
		</div>
	</div>

	<!-- Autoplay Settings -->
	<div class="card bg-base-200">
		<div class="card-body">
			<AutoplayRuleEditor />
		</div>
	</div>
</div>
