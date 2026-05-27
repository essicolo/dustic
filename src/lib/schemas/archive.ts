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

export const FavoriteEntrySchema = z.object({
	id: z.string(),
	type: z.enum(['track', 'album']),
	addedAt: z.number()
});

export const UserProfileSchema = z.object({
	schemaVersion: z.number(),
	exported: z.number(),
	settings: z.object({
		volume: z.number(),
		repeat: z.enum(['off', 'one', 'all']),
		audioQuality: z.enum(['lowest', 'medium', 'best']),
		funkwhaleInstances: z.array(z.object({
			url: z.string(),
			name: z.string(),
			enabled: z.boolean()
		})).optional()
	}).passthrough(),
	favorites: z.array(FavoriteEntrySchema),
	playlists: z.record(z.any()),
	history: z.array(z.any()),
	autoplayRules: z.array(z.any()),
	lastPlayedTrack: z.any().optional(), // Track object
	lastPlayedPosition: z.number().optional()
});

export type IAFile = z.infer<typeof IAFileSchema>;
export type IAMetadataResponse = z.infer<typeof IAMetadataResponseSchema>;
export type IASearchResponse = z.infer<typeof IASearchResponseSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
