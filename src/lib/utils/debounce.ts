// Debounce utility for delaying function execution

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 */
export function debounce<T extends (...args: any[]) => any>(
	func: T,
	wait: number = 300
): (...args: Parameters<T>) => void {
	let timeout: ReturnType<typeof setTimeout> | null = null;

	return function executedFunction(...args: Parameters<T>) {
		const later = () => {
			timeout = null;
			func(...args);
		};

		if (timeout !== null) {
			clearTimeout(timeout);
		}

		timeout = setTimeout(later, wait);
	};
}

/**
 * Creates a throttled function that only invokes func at most once per every wait milliseconds
 */
export function throttle<T extends (...args: any[]) => any>(
	func: T,
	wait: number = 300
): (...args: Parameters<T>) => void {
	let lastTime = 0;
	let timeout: ReturnType<typeof setTimeout> | null = null;

	return function executedFunction(...args: Parameters<T>) {
		const now = Date.now();
		const timeSinceLastCall = now - lastTime;

		if (timeSinceLastCall >= wait) {
			lastTime = now;
			func(...args);
		} else {
			if (timeout !== null) {
				clearTimeout(timeout);
			}

			timeout = setTimeout(() => {
				lastTime = Date.now();
				func(...args);
			}, wait - timeSinceLastCall);
		}
	};
}
