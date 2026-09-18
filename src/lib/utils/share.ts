import type { Track } from '$lib/types';
import { browser } from '$app/environment';
import { base } from '$app/paths';

/**
 * Where a shared link should point.
 *
 * Built from the origin the app is actually being served from, not a
 * hardcoded dustic.app: a link copied out of a local dev server, a preview
 * deployment or a self-hosted instance has to come back to *that* instance.
 * `base` is included so the app keeps working when it is not mounted at the
 * root of its domain.
 */
function appOrigin(): string {
	if (browser) return `${window.location.origin}${base}`;
	// No window during SSR; shares are user-initiated so this is a formality.
	return base;
}

export function buildShareUrl(identifier: string, origin = appOrigin()): string {
	if (identifier.startsWith('fw:')) {
		// FunkWhale track — link to the item page with the fw: identifier
		return `${origin}/item/${encodeURIComponent(identifier)}`;
	}
	// IA track — extract base identifier and track index
	const [baseIdentifier, trackIndex] = identifier.split('#');
	return trackIndex
		? `${origin}/item/${baseIdentifier}?track=${trackIndex}`
		: `${origin}/item/${baseIdentifier}`;
}

export interface ShareResult {
	success: boolean;
	/**
	 * An i18n key, translated by whichever component shows the toast. The
	 * messages used to be English literals returned from here, which meant
	 * the French UI reported "Link copied to clipboard". Returning a key
	 * keeps this module free of the i18n runtime and testable on its own.
	 */
	messageKey: string;
	/** Interpolation values for `messageKey`, when it takes any. */
	values?: Record<string, string>;
}

export async function shareTrack(track: Track): Promise<ShareResult> {
	const url = buildShareUrl(track.identifier);
	const title = `${track.title} - ${track.artist}`;

	// Try Web Share API first (works on mobile)
	if (browser && navigator.share) {
		try {
			await navigator.share({ title, text: title, url });
			return { success: true, messageKey: 'share.shared' };
		} catch (error) {
			// User cancelled or share failed
			if (error instanceof Error && error.name === 'AbortError') {
				return { success: false, messageKey: 'share.cancelled' };
			}
			// Fall through to clipboard
		}
	}

	// Fallback to clipboard
	if (browser && navigator.clipboard) {
		try {
			await navigator.clipboard.writeText(url);
			return { success: true, messageKey: 'share.copied' };
		} catch (error) {
			console.error('Failed to copy to clipboard:', error);
			return { success: false, messageKey: 'share.copyFailed' };
		}
	}

	return { success: false, messageKey: 'share.unsupported' };
}
