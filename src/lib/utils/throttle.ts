/**
 * Execute promises in batches with delay between batches to avoid rate limiting
 */
export async function batchExecute<T>(
	tasks: (() => Promise<T>)[],
	batchSize: number = 3,
	delayMs: number = 500
): Promise<T[]> {
	const results: T[] = [];

	for (let i = 0; i < tasks.length; i += batchSize) {
		const batch = tasks.slice(i, i + batchSize);
		const batchResults = await Promise.all(batch.map((task) => task()));
		results.push(...batchResults);

		// Add delay between batches (except for the last batch)
		if (i + batchSize < tasks.length) {
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}

	return results;
}

/**
 * Execute promises sequentially with delay between each
 */
export async function sequentialExecute<T>(
	tasks: (() => Promise<T>)[],
	delayMs: number = 200
): Promise<T[]> {
	const results: T[] = [];

	for (let i = 0; i < tasks.length; i++) {
		results.push(await tasks[i]());

		// Add delay between requests (except for the last one)
		if (i < tasks.length - 1) {
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}

	return results;
}
