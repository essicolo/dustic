// Retry logic with exponential backoff

export interface RetryOptions {
	maxAttempts?: number;
	initialDelay?: number; // milliseconds
	maxDelay?: number; // milliseconds
	backoffMultiplier?: number;
	retryableStatuses?: number[]; // HTTP status codes that should trigger retry
	timeoutMs?: number; // per-attempt timeout for fetchWithRetry
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
	maxAttempts: 3,
	initialDelay: 1000,
	maxDelay: 10000,
	backoffMultiplier: 2,
	retryableStatuses: [408, 429, 500, 502, 503, 504],
	timeoutMs: 15000
};

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay for exponential backoff
 */
function calculateDelay(attempt: number, options: Required<RetryOptions>): number {
	const delay = options.initialDelay * Math.pow(options.backoffMultiplier, attempt - 1);
	return Math.min(delay, options.maxDelay);
}

/**
 * Check if an error is retryable
 */
function isRetryable(error: any, options: Required<RetryOptions>): boolean {
	// Network errors
	if (error instanceof TypeError && error.message.includes('fetch')) {
		return true;
	}

	// HTTP errors with retryable status codes
	if (error.status && options.retryableStatuses.includes(error.status)) {
		return true;
	}

	return false;
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
	fn: () => Promise<T>,
	options: RetryOptions = {}
): Promise<T> {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	let lastError: any;

	for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;

			// Don't retry if this is the last attempt or error is not retryable
			if (attempt === opts.maxAttempts || !isRetryable(error, opts)) {
				throw error;
			}

			// Calculate delay and wait
			const delay = calculateDelay(attempt, opts);
			console.warn(
				`Request failed (attempt ${attempt}/${opts.maxAttempts}), retrying in ${delay}ms...`,
				error
			);
			await sleep(delay);
		}
	}

	throw lastError;
}

/**
 * Wrapper for fetch with retry logic
 */
export async function fetchWithRetry(
	url: string,
	options?: RequestInit,
	retryOptions?: RetryOptions
): Promise<Response> {
	const timeoutMs = retryOptions?.timeoutMs ?? DEFAULT_OPTIONS.timeoutMs;
	return retry(async () => {
		// Bound each attempt so a hung connection can't stall the UI for
		// minutes (the browser default). Timeouts abort and are not
		// retried — isRetryable doesn't match TimeoutError — keeping the
		// worst case at one timeout window. A caller-provided signal
		// takes precedence.
		const signal =
			options?.signal ??
			(typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined);
		const response = await fetch(url, { ...options, signal });

		// Throw on HTTP errors to trigger retry
		if (!response.ok) {
			const error: any = new Error(`HTTP ${response.status}: ${response.statusText}`);
			error.status = response.status;
			error.response = response;
			throw error;
		}

		return response;
	}, retryOptions);
}
