import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '$lib/utils/throttle';

describe('debounce', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('invokes once after the wait, with the latest arguments', () => {
		const fn = vi.fn();
		const d = debounce(fn, 200);

		d('first');
		vi.advanceTimersByTime(100);
		d('second');
		vi.advanceTimersByTime(200);

		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledWith('second');
	});

	it('cancel() drops the pending invocation', () => {
		const fn = vi.fn();
		const d = debounce(fn, 200);

		d();
		d.cancel();
		vi.advanceTimersByTime(500);

		expect(fn).not.toHaveBeenCalled();
	});

	it('can be invoked again after cancel', () => {
		const fn = vi.fn();
		const d = debounce(fn, 200);

		d();
		d.cancel();
		d();
		vi.advanceTimersByTime(200);

		expect(fn).toHaveBeenCalledTimes(1);
	});
});
