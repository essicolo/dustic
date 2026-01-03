<script lang="ts">
	import { player } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { library } from '$lib/stores/library';
	import QueuePanel from '$lib/components/Queue/QueuePanel.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PlayingIndicator from '$lib/components/PlayingIndicator.svelte';
	import DownloadButton from '$lib/components/DownloadButton.svelte';
	import { onMount, onDestroy } from 'svelte';
	import { shareTrack } from '$lib/utils/share';

	let audioElement: HTMLAudioElement;

	onMount(() => {
		player.setAudioElement(audioElement);

		// Keyboard shortcuts
		window.addEventListener('keydown', handleKeyPress);
	});

	onDestroy(() => {
		window.removeEventListener('keydown', handleKeyPress);
	});

	function handleKeyPress(e: KeyboardEvent) {
		// Ignore if typing in input fields
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
			return;
		}

		switch (e.code) {
			case 'Space':
				e.preventDefault();
				player.togglePlay();
				break;
			case 'ArrowLeft':
				e.preventDefault();
				player.seek(Math.max(0, $player.currentTime - 5));
				break;
			case 'ArrowRight':
				e.preventDefault();
				player.seek(Math.min($player.duration, $player.currentTime + 5));
				break;
			case 'KeyN':
				if (e.ctrlKey || e.metaKey) {
					e.preventDefault();
					player.next();
				}
				break;
			case 'KeyP':
				if (e.ctrlKey || e.metaKey) {
					e.preventDefault();
					player.previous();
				}
				break;
			case 'KeyM':
				if (e.ctrlKey || e.metaKey) {
					e.preventDefault();
					player.setVolume($player.volume > 0 ? 0 : 0.7);
				}
				break;
			case 'ArrowUp':
				if (e.shiftKey) {
					e.preventDefault();
					player.setVolume(Math.min(1, $player.volume + 0.1));
				}
				break;
			case 'ArrowDown':
				if (e.shiftKey) {
					e.preventDefault();
					player.setVolume(Math.max(0, $player.volume - 0.1));
				}
				break;
		}
	}

	function formatTime(seconds: number): string {
		if (!isFinite(seconds)) return '0:00';
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function handleSeek(e: Event) {
		const input = e.target as HTMLInputElement;
		const time = ($player.duration * parseFloat(input.value)) / 100;
		player.seek(time);
	}

	function toggleFavorite() {
		if ($player.currentTrack) {
			// Always use base item ID (without chapter #index) for favorites
			const baseId = $player.currentTrack.identifier.split('#')[0];
			library.toggleFavorite(baseId);
		}
	}

	let shareMessage = '';
	let showShareToast = false;

	async function handleShare() {
		if ($player.currentTrack) {
			const result = await shareTrack($player.currentTrack);
			shareMessage = result.message;
			showShareToast = true;
			setTimeout(() => {
				showShareToast = false;
			}, 3000);
		}
	}

	$: isFavorite = $player.currentTrack ? library.isFavorite($player.currentTrack.identifier.split('#')[0]) : false;
	$: $player;
</script>

<!-- Hidden audio element -->
<audio bind:this={audioElement} preload="auto"></audio>

<!-- Player Bar -->
<div class="h-full flex flex-col gap-1 px-2 md:px-6 py-2">
	<!-- Mobile: Progress bar at top -->
	<div class="md:hidden w-full">
		<input
			type="range"
			min="0"
			max="100"
			value={($player.currentTime / $player.duration) * 100 || 0}
			on:input={handleSeek}
			class="range range-primary range-xs w-full"
		/>
	</div>

	<!-- Main row -->
	<div class="flex items-center gap-2 md:gap-4 w-full md:justify-between">
		<!-- Track Info -->
		<div class="flex-shrink-0 flex-1 md:w-64 min-w-0">
			{#if $player.currentTrack}
				<div class="flex items-center gap-2 md:gap-3 min-w-0">
					<a href="/item/{$player.currentTrack.identifier.split('#')[0]}" class="flex-shrink-0 hover:opacity-80 transition-opacity hidden md:block">
						{#if $player.currentTrack.thumbnailUrl}
							<img
								src={$player.currentTrack.thumbnailUrl}
								alt={$player.currentTrack.title}
								class="w-12 h-12 rounded bg-base-200"
							/>
						{:else}
							<div class="w-12 h-12 rounded bg-base-200 flex items-center justify-center">
								<Icon icon="solar:music-note-bold" width="20" className="text-base-content/30" />
							</div>
						{/if}
					</a>
					<a href="/item/{$player.currentTrack.identifier.split('#')[0]}" class="flex-1 min-w-0 hover:text-primary transition-colors">
						<div class="text-xs md:text-base font-medium flex items-center gap-1 md:gap-2">
							<span class="truncate">{$player.currentTrack.title}</span>
							{#if $player.isPlaying}
								<span class="flex-shrink-0">
									<PlayingIndicator size="sm" />
								</span>
							{/if}
						</div>
						<div class="text-xs text-base-content/70 truncate">
							{$player.currentTrack.artist}
						</div>
					</a>
					<button
						on:click={toggleFavorite}
						class="btn btn-ghost btn-xs btn-circle flex-shrink-0 md:hidden"
						title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
					>
						<Icon
							icon={isFavorite ? 'solar:heart-bold' : 'solar:heart-linear'}
							width="16"
							className={isFavorite ? 'text-red-500' : ''}
						/>
					</button>
				</div>
			{:else}
				<div class="text-sm text-base-content/50">No track playing</div>
			{/if}
		</div>

		<!-- Player Controls - Centered on mobile -->
		<div class="flex items-center gap-1 md:gap-2 flex-shrink-0 md:flex-1 md:justify-center">
			<!-- Shuffle - Hidden on mobile -->
			<button
				on:click={() => player.toggleShuffle()}
				class="btn btn-ghost btn-sm btn-circle hidden md:flex"
				class:bg-base-200={$player.shuffle}
				title="Shuffle"
			>
				<Icon icon="solar:shuffle-bold" width="16" />
			</button>

			<button on:click={() => player.previous()} class="btn btn-ghost btn-sm btn-circle" title="Previous">
				<Icon icon="solar:skip-previous-bold" width="16" />
			</button>

			<button
				on:click={() => player.togglePlay()}
				class="btn btn-circle btn-primary btn-md"
				disabled={!$player.currentTrack}
			>
				{#if $player.isLoading}
					<span class="loading loading-spinner loading-sm"></span>
				{:else if $player.isPlaying}
					<Icon icon="solar:pause-bold" width="20" className="text-primary-content" />
				{:else}
					<Icon icon="solar:play-bold" width="20" className="text-primary-content" />
				{/if}
			</button>

			<button on:click={() => player.next()} class="btn btn-ghost btn-sm btn-circle" title="Next">
				<Icon icon="solar:skip-next-bold" width="16" />
			</button>

			<!-- Repeat - Hidden on mobile -->
			<button
				on:click={() => player.toggleRepeat()}
				class="btn btn-ghost btn-sm btn-circle hidden md:flex"
				class:bg-base-200={$player.repeat !== 'off'}
				title={$player.repeat === 'one' ? 'Repeat One' : $player.repeat === 'all' ? 'Repeat All' : 'Repeat Off'}
			>
				<Icon icon={$player.repeat === 'one' ? 'solar:repeat-one-bold' : 'solar:repeat-bold'} width="16" />
			</button>
		</div>

		<!-- Desktop: Volume & Queue -->
		<div class="flex-shrink-0 flex items-center gap-2 md:gap-4 md:w-64 md:justify-end">
			<!-- Desktop favorite/share/download buttons -->
			<div class="hidden md:flex items-center gap-1">
				{#if $player.currentTrack}
					<div class="flex-shrink-0">
						<DownloadButton track={$player.currentTrack} size="sm" />
					</div>
				{/if}
				<button
					on:click={toggleFavorite}
					class="btn btn-ghost btn-sm btn-circle"
					title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
				>
					<Icon
						icon={isFavorite ? 'solar:heart-bold' : 'solar:heart-linear'}
						width="18"
						className={isFavorite ? 'text-red-500' : ''}
					/>
				</button>
				<button
					on:click={handleShare}
					class="btn btn-ghost btn-sm btn-circle"
					title="Share track"
				>
					<Icon icon="solar:share-linear" width="18" />
				</button>
			</div>

			<!-- Volume Control - Hidden on mobile -->
			<div class="hidden md:flex w-32 items-center gap-2">
				<button
					on:click={() => player.setVolume($player.volume > 0 ? 0 : 0.7)}
					class="btn btn-ghost btn-sm btn-circle"
					title="Mute/Unmute"
				>
					{#if $player.volume === 0}
						<Icon icon="solar:volume-cross-bold" width="20" />
					{:else if $player.volume < 0.5}
						<Icon icon="solar:volume-small-bold" width="20" />
					{:else}
						<Icon icon="solar:volume-loud-bold" width="20" />
					{/if}
				</button>
				<input
					type="range"
					min="0"
					max="100"
					value={$player.volume * 100}
					on:input={(e) => player.setVolume(parseFloat((e.target as HTMLInputElement).value) / 100)}
					class="range range-xs flex-1"
				/>
			</div>

			<!-- Queue Button -->
			<QueuePanel />
		</div>
	</div>

	<!-- Desktop: Progress bar with time stamps -->
	<div class="hidden md:flex w-full items-center gap-2 justify-center">
		<span class="text-xs text-base-content/70 w-12 text-right">
			{formatTime($player.currentTime)}
		</span>
		<input
			type="range"
			min="0"
			max="100"
			value={($player.currentTime / $player.duration) * 100 || 0}
			on:input={handleSeek}
			class="range range-primary range-xs flex-1 max-w-2xl"
		/>
		<span class="text-xs text-base-content/70 w-12">
			{formatTime($player.duration)}
		</span>
	</div>
</div>

<!-- Share Toast -->
{#if showShareToast}
	<div class="toast toast-top toast-center z-50">
		<div class="alert alert-success">
			<Icon icon="solar:check-circle-bold" width="20" />
			<span>{shareMessage}</span>
		</div>
	</div>
{/if}
