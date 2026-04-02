import type { OfflineTrack } from '$lib/services/offlineStorage';
import type { FavoriteEntry, Playlist } from '$lib/types';

/**
 * Find cached tracks not referenced by any favorite or playlist.
 */
export function findOrphanedTracks(
	cachedTracks: OfflineTrack[],
	favorites: FavoriteEntry[],
	playlists: Record<string, Playlist>
): OfflineTrack[] {
	if (cachedTracks.length === 0) return [];

	const referencedIds = new Set<string>();
	for (const fav of favorites) {
		referencedIds.add(fav.id);
		referencedIds.add(fav.id.split('#')[0]);
	}
	for (const playlist of Object.values(playlists)) {
		for (const trackId of playlist.tracks) {
			referencedIds.add(trackId);
			referencedIds.add(trackId.split('#')[0]);
		}
	}

	return cachedTracks.filter((ot) => {
		const id = ot.track.identifier;
		const baseId = id.split('#')[0];
		return !referencedIds.has(id) && !referencedIds.has(baseId);
	});
}
