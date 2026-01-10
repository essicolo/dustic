<script lang="ts">
	import { player } from '$lib/stores/player';
	import { queue } from '$lib/stores/queue';
	import { library } from '$lib/stores/library';
	import QueuePanel from '$lib/components/Queue/QueuePanel.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PlayingIndicator from '$lib/components/PlayingIndicator.svelte';
	import DownloadButton from '$lib/components/DownloadButton.svelte';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { shareTrack } from '$lib/utils/share';
	import { base } from '$app/paths';

	let audioElement: HTMLAudioElement;
	let iosAudioUnlocked = false;
	let showPlaylistSelector = false;

	$: playlists = Object.values($library.playlists).sort((a, b) => b.updated - a.updated);

	function handleAddToPlaylist(playlistId: string) {
		if ($player.currentTrack) {
			const baseId = $player.currentTrack.identifier.split('#')[0];
			library.addToPlaylist(playlistId, baseId);
			showPlaylistSelector = false;
		}
	}

	onMount(() => {
		player.setAudioElement(audioElement);

		// iOS audio unlock - must happen on first user interaction
		// This allows subsequent async play() calls to work
		const unlockAudioOnFirstTouch = () => {
			if (iosAudioUnlocked || !audioElement) return;

			// Play and immediately pause to unlock iOS audio
			// We don't need any audio source - just calling play() is enough
			const playPromise = audioElement.play();

			if (playPromise !== undefined) {
				playPromise
					.then(() => {
						audioElement.pause();
						iosAudioUnlocked = true;
						console.log('iOS audio context unlocked');
					})
					.catch((err) => {
						// Expected to fail initially, will unlock on next try
						console.log('Audio unlock pending user interaction');
					});
			}

			// Remove listeners after first attempt
			if (iosAudioUnlocked) {
				document.removeEventListener('touchend', unlockAudioOnFirstTouch);
				document.removeEventListener('click', unlockAudioOnFirstTouch);
			}
		};

		// Listen for first user interaction (iOS requires touchend or click)
		document.addEventListener('touchend', unlockAudioOnFirstTouch, { once: true });
		document.addEventListener('click', unlockAudioOnFirstTouch, { once: true });

		// Keyboard shortcuts
		window.addEventListener('keydown', handleKeyPress);
		window.addEventListener('click', handleClickOutside);
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('keydown', handleKeyPress);
			window.removeEventListener('click', handleClickOutside);
		}
	});

	function handleClickOutside(event: MouseEvent) {
		if (showPlaylistSelector) {
			const target = event.target as HTMLElement;

			const desktopSelector = document.getElementById('desktop-player-playlist-selector');
			const desktopButton = document.getElementById('desktop-player-playlist-btn');

			const mobileSelector = document.getElementById('mobile-player-playlist-selector');
			const mobileButton = document.getElementById('mobile-player-playlist-btn');

			const isDesktopClick = (desktopSelector && desktopSelector.contains(target)) || (desktopButton && desktopButton.contains(target));
			const isMobileClick = (mobileSelector && mobileSelector.contains(target)) || (mobileButton && mobileButton.contains(target));

			if (!isDesktopClick && !isMobileClick) {
				showPlaylistSelector = false;
			}
		}
	}

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

<!-- Hidden audio element - MUST always be mounted -->
<audio
	bind:this={audioElement}
	preload="auto"
	playsinline
	webkit-playsinline
></audio>

{#if $player.currentTrack}
<!-- Player Bar -->
<div class="flex flex-col gap-1 px-2 md:px-6 py-2">
	<!-- Mobile: Progress bar at top with times -->
	<div class="md:hidden w-full flex items-center gap-2">
		<span class="text-xs text-base-content/70 w-10 text-right flex-shrink-0">
			{formatTime($player.currentTime)}
		</span>
		<input
			type="range"
			min="0"
			max="100"
			value={($player.currentTime / $player.duration) * 100 || 0}
			on:input={handleSeek}
			on:change={handleSeek}
			class="range range-primary range-xs flex-1"
		/>
		<span class="text-xs text-base-content/70 w-10 flex-shrink-0">
			{formatTime($player.duration)}
		</span>
	</div>

	<!-- Main row - CSS Grid for true centering -->
	<div class="grid items-center gap-2 w-full" style="grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);">
		<!-- Left: Track info -->
		<div class="min-w-0 justify-self-start overflow-hidden w-full">
			{#if $player.currentTrack}
				<!-- Mobile: compact with thumbnail -->
				<div class="md:hidden flex items-center gap-2 min-w-0 overflow-hidden">
					<a href="/item/{$player.currentTrack.identifier.split('#')[0]}" class="flex-shrink-0">
						{#if $player.currentTrack.thumbnailUrl}
							<img
								src={$player.currentTrack.thumbnailUrl}
								alt={$player.currentTrack.title}
								class="w-10 h-10 rounded bg-base-200"
							/>
						{:else}
							<div class="w-10 h-10 rounded bg-base-200 flex items-center justify-center">
								<Icon icon="solar:music-note-bold" width="16" className="text-base-content/30" />
							</div>
						{/if}
					</a>
					<a href="/item/{$player.currentTrack.identifier.split('#')[0]}" class="min-w-0 overflow-hidden hover:text-primary transition-colors">
						<div class="text-xs font-medium truncate">{$player.currentTrack.title}</div>
					</a>
				</div>
				<!-- Desktop: full -->
				<div class="hidden md:flex items-center gap-3 min-w-0 overflow-hidden max-w-full">
					<a href="/item/{$player.currentTrack.identifier.split('#')[0]}" class="flex-shrink-0 hover:opacity-80 transition-opacity">
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
					<div class="flex-1 min-w-0">
						<a href="/item/{$player.currentTrack.identifier.split('#')[0]}" class="hover:text-primary transition-colors">
							<div class="text-base font-medium flex items-center gap-2">
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
					</div>
				</div>
			{/if}
		</div>

		<!-- Center: Player Controls -->
		<div class="flex items-center justify-center gap-1 md:gap-2">
			<!-- Shuffle - Desktop only -->
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

			<!-- Repeat - Desktop only -->
			<button
				on:click={() => player.toggleRepeat()}
				class="btn btn-ghost btn-sm btn-circle hidden md:flex"
				class:bg-base-200={$player.repeat !== 'off'}
				title={$player.repeat === 'one' ? 'Repeat One' : $player.repeat === 'all' ? 'Repeat All' : 'Repeat Off'}
			>
				<Icon icon={$player.repeat === 'one' ? 'solar:repeat-one-bold' : 'solar:repeat-bold'} width="16" />
			</button>
		</div>

		<!-- Right: Actions/Volume/Queue -->
		<div class="flex items-center gap-1 md:gap-2 justify-self-end w-full justify-end">
			<!-- Mobile: Favorite + Queue only (keep it minimal) -->
			<div class="md:hidden flex items-center gap-1">
				{#if $player.currentTrack}
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
				{/if}
			</div>

			<!-- Desktop: Download/Favorite/Playlist/Share -->
			<div class="hidden md:flex items-center gap-1">
				{#if $player.currentTrack}
					<DownloadButton track={$player.currentTrack} size="sm" />
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

				<!-- Desktop Playlist Button -->
				<div class="relative">
					<button
						id="desktop-player-playlist-btn"
						class="btn btn-ghost btn-sm btn-circle"
						title="Add to Playlist"
						on:click|stopPropagation={() => (showPlaylistSelector = !showPlaylistSelector)}
					>
						<Icon icon="solar:list-heart-minimalistic-outline" width="18" />
					</button>
					{#if showPlaylistSelector}
						<div
							id="desktop-player-playlist-selector"
							class="absolute bottom-full right-0 mb-2 w-48 bg-base-100 rounded-lg shadow-2xl z-50 border border-base-content/10 max-h-60 overflow-y-auto"
						>
							<h3 class="text-xs font-bold p-2 text-base-content/70">Add to playlist</h3>
							{#each playlists as p}
								<button
									class="w-full text-left px-3 py-2 hover:bg-base-300 text-sm truncate border-b border-base-content/5"
									on:click={(e) => { e.stopPropagation(); handleAddToPlaylist(p.id); }}
								>
									{p.name}
								</button>
							{/each}
							<a
								href="{base}/library/playlists"
								class="block px-3 py-2 text-sm text-primary hover:bg-base-300 font-bold"
								on:click={() => (showPlaylistSelector = false)}
							>
								+ New Playlist
							</a>
						</div>
					{/if}
				</div>

				<button
					on:click={handleShare}
					class="btn btn-ghost btn-sm btn-circle"
					title="Share track"
				>
					<Icon icon="solar:share-linear" width="18" />
				</button>
			</div>

			<!-- Volume Control - Desktop only -->
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

			<!-- Queue Button - Always visible -->
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
			on:change={handleSeek}
			class="range range-primary range-xs flex-1 max-w-2xl"
		/>
		<span class="text-xs text-base-content/70 w-12">
			{formatTime($player.duration)}
		</span>
	</div>
</div>
{/if}

<!-- Share Toast -->
{#if showShareToast}
	<div class="toast toast-top toast-center z-50">
		<div class="alert alert-success">
			<Icon icon="solar:check-circle-bold" width="20" />
			<span>{shareMessage}</span>
		</div>
	</div>
{/if}
