// Simple in-memory cache with TTL support

interface CacheEntry<T> {
	data: T;
	timestamp: number;
	ttl: number; // Time to live in milliseconds
}

class Cache {
	private cache = new Map<string, CacheEntry<any>>();
	private accessOrder: string[] = []; // LRU tracking (Issue #8)
	private readonly maxSize: number;

	constructor(maxSize: number = 100) {
		this.maxSize = maxSize;
	}

	/**
	 * Get cached value if it exists and hasn't expired
	 */
	get<T>(key: string): T | null {
		const entry = this.cache.get(key);
		if (!entry) return null;

		const now = Date.now();
		if (now - entry.timestamp > entry.ttl) {
			// Expired - remove it
			this.cache.delete(key);
			this.removeFromAccessOrder(key);
			return null;
		}

		// Update access order for LRU
		this.updateAccessOrder(key);
		return entry.data as T;
	}

	/**
	 * Set a value in the cache with TTL
	 */
	set<T>(key: string, data: T, ttl: number = 5 * 60 * 1000): void {
		// Evict if at capacity
		if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
			this.evictLRU();
		}

		this.cache.set(key, {
			data,
			timestamp: Date.now(),
			ttl
		});
		this.updateAccessOrder(key);
	}

	/**
	 * Evict least recently used entry
	 */
	private evictLRU(): void {
		if (this.accessOrder.length > 0) {
			const lruKey = this.accessOrder.shift()!;
			this.cache.delete(lruKey);
		}
	}

	/**
	 * Update access order (move to end)
	 */
	private updateAccessOrder(key: string): void {
		this.removeFromAccessOrder(key);
		this.accessOrder.push(key);
	}

	/**
	 * Remove from access order
	 */
	private removeFromAccessOrder(key: string): void {
		const index = this.accessOrder.indexOf(key);
		if (index !== -1) {
			this.accessOrder.splice(index, 1);
		}
	}

	/**
	 * Clear a specific key
	 */
	delete(key: string): void {
		this.cache.delete(key);
	}

	/**
	 * Clear all cached data
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Clear expired entries
	 */
	cleanup(): void {
		const now = Date.now();
		for (const [key, entry] of this.cache.entries()) {
			if (now - entry.timestamp > entry.ttl) {
				this.cache.delete(key);
			}
		}
	}

	/**
	 * Get cache statistics
	 */
	getStats(): { size: number; keys: string[] } {
		return {
			size: this.cache.size,
			keys: Array.from(this.cache.keys())
		};
	}
}

// Singleton instance with bounded size (Issue #8)
export const cache = new Cache(500);

// Cleanup expired entries every 5 minutes
if (typeof window !== 'undefined') {
	setInterval(() => cache.cleanup(), 5 * 60 * 1000);
}

/**
 * Helper to wrap async functions with caching
 */
export async function withCache<T>(
	key: string,
	fetchFn: () => Promise<T>,
	ttl: number = 5 * 60 * 1000
): Promise<T> {
	// Try to get from cache first
	const cached = cache.get<T>(key);
	if (cached !== null) {
		return cached;
	}

	// Fetch fresh data
	const data = await fetchFn();
	cache.set(key, data, ttl);
	return data;
}
