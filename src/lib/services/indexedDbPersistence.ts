// IndexedDB persistence layer for iOS PWA reliability
// iOS Safari can sometimes clear localStorage in standalone PWA mode,
// so we use IndexedDB as a more reliable storage mechanism

import { browser } from '$app/environment';
import type { UserProfile } from '$lib/types';

const DB_NAME = 'dustic-profile-db';
const DB_VERSION = 1;
const STORE_NAME = 'profile';
const PROFILE_KEY = 'user-profile';

/**
 * Open IndexedDB connection
 */
function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (!browser) {
			reject(new Error('Not in browser environment'));
			return;
		}

		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);

		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;

			// Create object store if it doesn't exist
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME);
			}
		};
	});
}

/**
 * Save profile to IndexedDB
 */
export async function saveToIndexedDB(profile: UserProfile): Promise<void> {
	if (!browser) return;

	try {
		const db = await openDB();
		const transaction = db.transaction(STORE_NAME, 'readwrite');
		const store = transaction.objectStore(STORE_NAME);

		// Store the profile with timestamp
		const data = {
			profile,
			timestamp: Date.now()
		};

		store.put(data, PROFILE_KEY);

		return new Promise((resolve, reject) => {
			transaction.oncomplete = () => {
				db.close();
				resolve();
			};
			transaction.onerror = () => {
				db.close();
				reject(transaction.error);
			};
		});
	} catch (error) {
		console.error('Failed to save to IndexedDB:', error);
		throw error;
	}
}

/**
 * Load profile from IndexedDB
 */
export async function loadFromIndexedDB(): Promise<UserProfile | null> {
	if (!browser) return null;

	try {
		const db = await openDB();
		const transaction = db.transaction(STORE_NAME, 'readonly');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.get(PROFILE_KEY);

		return new Promise((resolve, reject) => {
			request.onsuccess = () => {
				db.close();
				const data = request.result;
				if (data && data.profile) {
					resolve(data.profile);
				} else {
					resolve(null);
				}
			};
			request.onerror = () => {
				db.close();
				reject(request.error);
			};
		});
	} catch (error) {
		console.error('Failed to load from IndexedDB:', error);
		return null;
	}
}

/**
 * Clear profile from IndexedDB
 */
export async function clearIndexedDB(): Promise<void> {
	if (!browser) return;

	try {
		const db = await openDB();
		const transaction = db.transaction(STORE_NAME, 'readwrite');
		const store = transaction.objectStore(STORE_NAME);
		store.delete(PROFILE_KEY);

		return new Promise((resolve, reject) => {
			transaction.oncomplete = () => {
				db.close();
				resolve();
			};
			transaction.onerror = () => {
				db.close();
				reject(transaction.error);
			};
		});
	} catch (error) {
		console.error('Failed to clear IndexedDB:', error);
	}
}
