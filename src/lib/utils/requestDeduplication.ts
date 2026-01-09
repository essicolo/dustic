// Request deduplication utility (Issue #7 - prevents duplicate requests)

interface PendingRequest<T> {
	promise: Promise<T>;
	timestamp: number;
}

class RequestDeduplicator {
	private pending = new Map<string, PendingRequest<any>>();
	private readonly TTL = 5000; // 5 seconds

	async dedupe<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
		// Clean up stale entries
		const now = Date.now();
		for (const [k, req] of this.pending.entries()) {
			if (now - req.timestamp > this.TTL) {
				this.pending.delete(k);
			}
		}

		// Return existing promise if available
		const existing = this.pending.get(key);
		if (existing) {
			return existing.promise as Promise<T>;
		}

		// Create new request
		const promise = fetcher();
		this.pending.set(key, { promise, timestamp: now });

		try {
			const result = await promise;
			return result;
		} finally {
			this.pending.delete(key);
		}
	}
}

export const requestDeduplicator = new RequestDeduplicator();
