<script lang="ts">
	import { player } from '$lib/stores/player';
	import { onMount } from 'svelte';

	let audioElement: HTMLAudioElement;

	onMount(() => {
		player.setAudioElement(audioElement);
	});

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

	$: $player;
</script>

<!-- Hidden audio element -->
<audio bind:this={audioElement} preload="auto"></audio>

<!-- Player Bar -->
<div class="h-full flex items-center gap-4 px-6">
	<!-- Track Info -->
	<div class="flex-shrink-0 w-64">
		{#if $player.currentTrack}
			<div class="flex items-center gap-3">
				{#if $player.currentTrack.thumbnailUrl}
					<img
						src={$player.currentTrack.thumbnailUrl}
						alt={$player.currentTrack.title}
						class="w-12 h-12 rounded bg-base-200"
					/>
				{:else}
					<div class="w-12 h-12 rounded bg-base-200 flex items-center justify-center">
						🎵
					</div>
				{/if}
				<div class="flex-1 min-w-0">
					<div class="font-medium truncate">{$player.currentTrack.title}</div>
					<div class="text-sm text-base-content/70 truncate">
						{$player.currentTrack.artist}
					</div>
				</div>
			</div>
		{:else}
			<div class="text-base-content/50">No track playing</div>
		{/if}
	</div>

	<!-- Player Controls -->
	<div class="flex-1 flex flex-col items-center gap-2">
		<!-- Buttons -->
		<div class="flex items-center gap-4">
			<button
				on:click={() => player.toggleShuffle()}
				class="btn btn-ghost btn-sm"
				class:text-primary={$player.shuffle}
			>
				🔀
			</button>

			<button on:click={() => player.previous()} class="btn btn-ghost btn-sm">
				⏮
			</button>

			<button
				on:click={() => player.togglePlay()}
				class="btn btn-circle btn-primary"
				disabled={!$player.currentTrack}
			>
				{#if $player.isLoading}
					<span class="loading loading-spinner"></span>
				{:else if $player.isPlaying}
					⏸
				{:else}
					▶️
				{/if}
			</button>

			<button on:click={() => player.next()} class="btn btn-ghost btn-sm">
				⏭
			</button>

			<button
				on:click={() => player.toggleRepeat()}
				class="btn btn-ghost btn-sm"
				class:text-primary={$player.repeat !== 'off'}
			>
				{$player.repeat === 'one' ? '🔂' : '🔁'}
			</button>
		</div>

		<!-- Progress Bar -->
		<div class="w-full max-w-2xl flex items-center gap-2">
			<span class="text-xs text-base-content/70 w-12 text-right">
				{formatTime($player.currentTime)}
			</span>
			<input
				type="range"
				min="0"
				max="100"
				value={($player.currentTime / $player.duration) * 100 || 0}
				on:input={handleSeek}
				class="range range-primary range-xs flex-1"
			/>
			<span class="text-xs text-base-content/70 w-12">
				{formatTime($player.duration)}
			</span>
		</div>
	</div>

	<!-- Volume Control -->
	<div class="flex-shrink-0 w-32 flex items-center gap-2">
		<span>🔊</span>
		<input
			type="range"
			min="0"
			max="100"
			value={$player.volume * 100}
			on:input={(e) => player.setVolume(parseFloat((e.target as HTMLInputElement).value) / 100)}
			class="range range-xs flex-1"
		/>
	</div>
</div>
