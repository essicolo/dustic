import type { Track } from '$lib/types';
import { browser } from '$app/environment';

export async function shareTrack(track: Track): Promise<{ success: boolean; message: string }> {
	// Extract base identifier (remove chapter index if present)
	const baseIdentifier = track.identifier.split('#')[0];
	const url = `https://dustic.app/item/${baseIdentifier}`;
	const title = `${track.title} - ${track.artist}`;

	// Try Web Share API first (works on mobile)
	if (browser && navigator.share) {
		try {
			await navigator.share({
				title,
				text: `Listen to ${title} on Dustic`,
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
