// Client-side encryption for sensitive fields (WebDAV password).
// Uses AES-GCM with a device-bound key stored in a separate IndexedDB database.
// This prevents casual exposure from inspecting localStorage or profile exports.
import { browser } from '$app/environment';

const KEY_DB_NAME = 'dustic-keystore';
const KEY_DB_VERSION = 1;
const KEY_STORE_NAME = 'keys';
const ENCRYPTION_KEY_ID = 'webdav-key';

// Prefix to distinguish encrypted values from plain text (migration)
const ENCRYPTED_PREFIX = 'enc:';

/**
 * Check if a value is encrypted
 */
export function isEncrypted(value: string): boolean {
	return value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Encrypt a plaintext string. Returns a prefixed base64 string.
 */
export async function encryptValue(plaintext: string): Promise<string> {
	if (!browser || !plaintext) return plaintext;

	try {
		const key = await getOrCreateKey();
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const encoded = new TextEncoder().encode(plaintext);

		const ciphertext = await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv },
			key,
			encoded
		);

		// Combine IV + ciphertext into a single buffer
		const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
		combined.set(iv);
		combined.set(new Uint8Array(ciphertext), iv.length);

		return ENCRYPTED_PREFIX + btoa(String.fromCharCode(...combined));
	} catch (error) {
		console.error('[Crypto] Encryption failed:', error);
		return plaintext;
	}
}

/**
 * Decrypt a previously encrypted string. Handles plain text gracefully (migration).
 */
export async function decryptValue(stored: string): Promise<string> {
	if (!browser || !stored) return stored;

	// Not encrypted — return as-is (handles migration from plain text)
	if (!isEncrypted(stored)) return stored;

	try {
		const key = await getOrCreateKey();
		const raw = stored.slice(ENCRYPTED_PREFIX.length);
		const combined = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));

		const iv = combined.slice(0, 12);
		const ciphertext = combined.slice(12);

		const decrypted = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv },
			key,
			ciphertext
		);

		return new TextDecoder().decode(decrypted);
	} catch (error) {
		console.error('[Crypto] Decryption failed:', error);
		return '';
	}
}

// ---------------------------------------------------------------------------
// Key management — stored in a separate IndexedDB database
// ---------------------------------------------------------------------------

let cachedKey: CryptoKey | null = null;

async function getOrCreateKey(): Promise<CryptoKey> {
	if (cachedKey) return cachedKey;

	const db = await openKeyDB();

	try {
		// Try to load existing key
		const stored = await dbGet(db, ENCRYPTION_KEY_ID);
		if (stored) {
			cachedKey = await crypto.subtle.importKey(
				'raw',
				stored,
				{ name: 'AES-GCM' },
				false,
				['encrypt', 'decrypt']
			);
			return cachedKey;
		}

		// Generate new key
		const key = await crypto.subtle.generateKey(
			{ name: 'AES-GCM', length: 256 },
			true, // extractable so we can store the raw bytes
			['encrypt', 'decrypt']
		);

		// Export and store the raw key bytes
		const rawKey = await crypto.subtle.exportKey('raw', key);
		await dbPut(db, ENCRYPTION_KEY_ID, new Uint8Array(rawKey));

		// Re-import as non-extractable for runtime use
		cachedKey = await crypto.subtle.importKey(
			'raw',
			rawKey,
			{ name: 'AES-GCM' },
			false,
			['encrypt', 'decrypt']
		);
		return cachedKey;
	} finally {
		db.close();
	}
}

function openKeyDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(KEY_DB_NAME, KEY_DB_VERSION);
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;
			if (!db.objectStoreNames.contains(KEY_STORE_NAME)) {
				db.createObjectStore(KEY_STORE_NAME);
			}
		};
	});
}

function dbGet(db: IDBDatabase, key: string): Promise<Uint8Array | null> {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(KEY_STORE_NAME, 'readonly');
		const request = tx.objectStore(KEY_STORE_NAME).get(key);
		request.onsuccess = () => resolve(request.result ?? null);
		request.onerror = () => reject(request.error);
	});
}

function dbPut(db: IDBDatabase, key: string, value: Uint8Array): Promise<void> {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(KEY_STORE_NAME, 'readwrite');
		tx.objectStore(KEY_STORE_NAME).put(value, key);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}
