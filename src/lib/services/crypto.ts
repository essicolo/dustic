// Client-side encryption for sensitive fields (WebDAV password).
// Uses AES-GCM with a device-bound key stored in localStorage.
// This prevents casual exposure from inspecting the profile data or exports.
import { browser } from '$app/environment';

const KEY_STORAGE_KEY = 'inde-encryption-key';

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
// Key management — stored in localStorage under a separate key
// ---------------------------------------------------------------------------

let cachedKey: CryptoKey | null = null;

async function getOrCreateKey(): Promise<CryptoKey> {
	if (cachedKey) return cachedKey;

	// Try to load existing key from localStorage
	const stored = localStorage.getItem(KEY_STORAGE_KEY);
	if (stored) {
		const rawKey = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
		cachedKey = await crypto.subtle.importKey(
			'raw',
			rawKey,
			{ name: 'AES-GCM' },
			false,
			['encrypt', 'decrypt']
		);
		return cachedKey;
	}

	// Generate new key
	const key = await crypto.subtle.generateKey(
		{ name: 'AES-GCM', length: 256 },
		true,
		['encrypt', 'decrypt']
	);

	// Export and persist
	const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', key));
	localStorage.setItem(KEY_STORAGE_KEY, btoa(String.fromCharCode(...rawKey)));

	// Re-import as non-extractable for runtime use
	cachedKey = await crypto.subtle.importKey(
		'raw',
		rawKey,
		{ name: 'AES-GCM' },
		false,
		['encrypt', 'decrypt']
	);
	return cachedKey;
}
