import type { Track } from '$lib/types';
import { browser } from '$app/environment';

export async function shareTrack(track: Track): Promise<{ success: boolean; message: string }> {
	const url = `https://archive.org/details/${track.identifier}`;
	const title = `${track.title} - ${track.artist}`;

	// Try Web Share API first (works on mobile)
	if (browser && navigator.share) {
		try {
			await navigator.share({
				title,
				text: `Listen to ${title} on Internet Archive`,
				url
			});
			return { success: true, message: 'Shared successfully' };
		} catch (error) {
			// User cancelled or share failed
			if (error instanceof Error && error.name === 'AbortError') {
				return { success: false, message: 'Share cancelled' };
			}
			// Fall through to clipboard
		}
	}

	// Fallback to clipboard
	if (browser && navigator.clipboard) {
		try {
			await navigator.clipboard.writeText(url);
			return { success: true, message: 'Link copied to clipboard' };
		} catch (error) {
			console.error('Failed to copy to clipboard:', error);
			return { success: false, message: 'Failed to copy link' };
		}
	}

	return { success: false, message: 'Sharing not supported' };
}
