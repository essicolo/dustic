// Zod validation schemas for Internet Archive data (Issue #2 - JSON validation)
import { z } from 'zod';

export const IAFileSchema = z.object({
	name: z.string(),
	format: z.string(),
	size: z.string().optional(),
	length: z.string().optional()
}).passthrough();

export const IAMetadataResponseSchema = z.object({
	metadata: z.object({
		identifier: z.string(),
		title: z.string().optional(),
		creator: z.union([z.string(), z.array(z.string())]).optional(),
		date: z.string().optional(),
		subject: z.union([z.string(), z.array(z.string())]).optional(),
		collection: z.union([z.string(), z.array(z.string())]).optional()
	}).passthrough(),
	files: z.array(IAFileSchema)
});

export const IASearchResponseSchema = z.object({
	response: z.object({
		docs: z.array(z.object({
			identifier: z.string(),
			title: z.union([z.string(), z.array(z.string())]).optional(),
			creator: z.union([z.string(), z.array(z.string())]).optional(),
			date: z.string().optional(),
			subject: z.union([z.string(), z.array(z.string())]).optional(),
			format: z.union([z.string(), z.array(z.string())]).optional(),
			collection: z.union([z.string(), z.array(z.string())]).optional(),
			downloads: z.number().optional()
		}).passthrough()),
		numFound: z.number(),
		start: z.number()
	})
});

// ---------------------------------------------------------------------------
// User profile
//
// The profile is read by every installed copy of the app, including stale
// PWA builds and other devices syncing over WebDAV. Validation is therefore
// deliberately *tolerant*: a malformed or unknown entry is dropped (or kept
// verbatim when it is merely unknown), never allowed to fail the whole
// profile. A failed parse used to make the app start from an empty profile
// and then auto-save that over the real one.
// ---------------------------------------------------------------------------

/**
 * `type` is an open string so favorite kinds added by newer versions survive
 * a round-trip through this one (the UI only shows the kinds it knows).
 * passthrough() keeps any extra fields those kinds carry.
 */
export const FavoriteEntrySchema = z
	.object({
		id: z.string(),
		type: z.string(),
		addedAt: z.number().catch(0)
	})
	.passthrough();

// WebDAV folders marked as favorites (separate field until the favorites
// list is unified in a future schema version).
export const FavoriteFolderSchema = z
	.object({
		id: z.string(),
		libraryId: z.string(),
		path: z.string(),
		name: z.string(),
		addedAt: z.number().catch(0)
	})
	.passthrough();

/** Array whose invalid entries are dropped one by one instead of failing the array. */
function lenientArray<T extends z.ZodTypeAny>(item: T) {
	return z
		.array(z.unknown())
		.catch([])
		.transform((arr) =>
			arr.flatMap((entry) => {
				const r = item.safeParse(entry);
				return r.success ? [r.data as z.infer<T>] : [];
			})
		);
}

const DEFAULT_SETTINGS = { volume: 0.7, repeat: 'off' as const, audioQuality: 'medium' as const };

export const UserProfileSchema = z
	.object({
		schemaVersion: z.number().catch(1),
		exported: z.number().catch(0),
		settings: z
			.object({
				volume: z.number().catch(DEFAULT_SETTINGS.volume),
				repeat: z.enum(['off', 'one', 'all']).catch(DEFAULT_SETTINGS.repeat),
				audioQuality: z.enum(['lowest', 'medium', 'best']).catch(DEFAULT_SETTINGS.audioQuality),
				funkwhaleInstances: lenientArray(
					z.object({
						url: z.string(),
						name: z.string(),
						enabled: z.boolean()
					})
				).optional()
			})
			.passthrough()
			.catch(DEFAULT_SETTINGS),
		favorites: lenientArray(FavoriteEntrySchema),
		favoriteFolders: lenientArray(FavoriteFolderSchema).optional(),
		playlists: z.record(z.any()).catch({}),
		history: z.array(z.any()).catch([]),
		autoplayRules: z.array(z.any()).catch([]),
		lastPlayedTrack: z.any().optional(), // Track object
		lastPlayedPosition: z.number().optional().catch(undefined)
	})
	// Unknown top-level fields (added by newer versions) are kept as-is.
	.passthrough();

export type UserProfile = z.infer<typeof UserProfileSchema>;

export type IAFile = z.infer<typeof IAFileSchema>;
export type IAMetadataResponse = z.infer<typeof IAMetadataResponseSchema>;
export type IASearchResponse = z.infer<typeof IASearchResponseSchema>;
