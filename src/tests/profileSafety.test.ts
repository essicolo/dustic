import { describe, it, expect, beforeEach, vi } from 'vitest';
import { normalizeProfile, STORAGE_SCHEMA_VERSION } from '$lib/services/profileNormalize';

const base = {
	schemaVersion: 2,
	exported: 1,
	favorites: [{ id: 'a', type: 'track', addedAt: 1 }],
	playlists: {},
	history: [],
	autoplayRules: [],
	settings: { volume: 0.5, repeat: 'off', audioQuality: 'medium' }
};

describe('normalizeProfile (tolerant validation)', () => {
	it('drops a malformed favorite instead of failing the profile', () => {
		const p = normalizeProfile({ ...base, favorites: [...base.favorites, { type: 'track' }, 42] });
		expect(p.favorites.map((f) => f.id)).toEqual(['a']);
	});

	it('keeps favorite kinds and fields it does not know', () => {
		const future = { id: 'wd:L:x', type: 'folder', addedAt: 2, ref: { path: '/Rock' } };
		const p = normalizeProfile({ ...base, favorites: [...base.favorites, future] });
		expect(p.favorites).toContainEqual(future);
	});

	it('keeps unknown top-level fields', () => {
		const p = normalizeProfile({ ...base, somethingNew: { x: 1 } }) as any;
		expect(p.somethingNew).toEqual({ x: 1 });
	});

	it('falls back to defaults for invalid settings values', () => {
		const p = normalizeProfile({ ...base, settings: { volume: 'loud', repeat: 'never', audioQuality: 'best' } });
		expect(p.settings.volume).toBe(0.7);
		expect(p.settings.repeat).toBe('off');
		expect(p.settings.audioQuality).toBe('best');
	});

	it('survives wrongly-typed collections', () => {
		const p = normalizeProfile({ ...base, playlists: 'oops', history: null, favorites: 'nope' });
		expect(p.playlists).toEqual({});
		expect(p.history).toEqual([]);
		expect(p.favorites).toEqual([]);
	});

	it('migrates v1 string favorites', () => {
		const p = normalizeProfile({ ...base, schemaVersion: 1, favorites: ['x', 'y'] });
		expect(p.favorites.map((f) => [f.id, f.type])).toEqual([['x', 'track'], ['y', 'track']]);
		expect(p.schemaVersion).toBe(STORAGE_SCHEMA_VERSION);
	});

	it('does not downgrade the version of a newer profile', () => {
		const p = normalizeProfile({ ...base, schemaVersion: STORAGE_SCHEMA_VERSION + 1 });
		expect(p.schemaVersion).toBe(STORAGE_SCHEMA_VERSION + 1);
	});

	it('throws only for non-objects', () => {
		expect(() => normalizeProfile(null)).toThrow();
		expect(() => normalizeProfile([1])).toThrow();
	});
});

describe('persistence safety', () => {
	let store: Record<string, string>;

	beforeEach(() => {
		vi.resetModules();
		vi.useFakeTimers();
		store = {};
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => (k in store ? store[k] : null),
			setItem: (k: string, v: string) => {
				store[k] = String(v);
			},
			removeItem: (k: string) => {
				delete store[k];
			}
		});
		vi.doMock('$lib/services/indexedDbPersistence', () => ({
			saveToIndexedDB: vi.fn(async () => {}),
			loadFromIndexedDB: vi.fn(async () => null),
			clearIndexedDB: vi.fn(async () => {})
		}));
	});

	it('never auto-saves over a profile written by a newer version', async () => {
		const newer = JSON.stringify({ ...base, schemaVersion: STORAGE_SCHEMA_VERSION + 1, futureField: 1 });
		store['dustic-profile'] = newer;
		const persistence = await import('$lib/services/persistence');

		const loaded = persistence.loadFromStorageSync();
		expect(loaded?.favorites[0].id).toBe('a');
		expect(persistence.isProfileReadOnly()).toBe(true);

		persistence.scheduleAutoSave({ ...loaded!, favorites: [] });
		await vi.runAllTimersAsync();
		expect(store['dustic-profile']).toBe(newer);
	});

	it('refuses to import (save) a newer profile', async () => {
		const persistence = await import('$lib/services/persistence');
		await expect(
			persistence.saveToStorage({ ...(base as any), schemaVersion: STORAGE_SCHEMA_VERSION + 1 })
		).rejects.toMatchObject({ name: 'ProfileTooNewError' });
	});

	it('keeps a raw backup of an unreadable profile before anything overwrites it', async () => {
		store['dustic-profile'] = '{not json';
		const persistence = await import('$lib/services/persistence');
		expect(persistence.loadFromStorageSync()).toBeNull();
		expect(store['dustic-profile-backup']).toBe('{not json');
	});
});
