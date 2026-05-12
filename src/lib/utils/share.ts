import type { Track } from '$lib/types';
import { browser } from '$app/environment';

export async function shareTrack(track: Track): Promise<{ success: boolean; message: string }> {
	// Build share URL based on source
	let url: string;
	if (track.identifier.startsWith('fw:')) {
		// FunkWhale track - link to the item page with fw: identifier
		url = `https://inde.cc/item/${encodeURIComponent(track.identifier)}`;
	} else {
		// IA track - extract base identifier and track index
		const [baseIdentifier, trackIndex] = track.identifier.split('#');
		url = trackIndex
			? `https://inde.cc/item/${baseIdentifier}?track=${trackIndex}`
			: `https://inde.cc/item/${baseIdentifier}`;
	}
	const title = `${track.title} - ${track.artist}`;

	// Try Web Share API first (works on mobile)
	if (browser && navigator.share) {
		try {
			await navigator.share({
				title,
				text: `Listen to ${title} on Inde`,
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
