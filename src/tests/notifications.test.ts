import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { notifications } from '$lib/stores/notifications';

describe('notifications', () => {
	beforeEach(() => {
		notifications.clear();
		vi.useFakeTimers();
	});
	afterEach(() => vi.useRealTimers());

	it('holds i18n keys, not translated text', () => {
		// The message has to be rendered in whatever language is active when
		// it is shown, not the one active when it was raised.
		notifications.error('errors.itemUnavailable');
		const [n] = get(notifications);
		expect(n.messageKey).toBe('errors.itemUnavailable');
		expect(n.kind).toBe('error');
	});

	it('keeps several messages at once', () => {
		notifications.info('a');
		notifications.error('b');
		expect(get(notifications).map((n) => n.messageKey)).toEqual(['a', 'b']);
	});

	it('dismisses each message on its own timer', () => {
		// A second message must not cut the first one short, and the first
		// expiring must not take the second with it.
		notifications.info('first');
		vi.advanceTimersByTime(3000);
		notifications.info('second');

		vi.advanceTimersByTime(1500); // first is now past its 4s
		expect(get(notifications).map((n) => n.messageKey)).toEqual(['second']);

		vi.advanceTimersByTime(3000);
		expect(get(notifications)).toEqual([]);
	});

	it('can be dismissed by hand, and expiry afterwards is harmless', () => {
		const id = notifications.info('manual');
		notifications.dismiss(id);
		expect(get(notifications)).toEqual([]);

		// The pending timer still fires; dismissing twice must not throw or
		// remove someone else's message.
		notifications.info('other');
		vi.advanceTimersByTime(4000);
		expect(get(notifications)).toEqual([]);
	});

	it('gives every message a distinct id', () => {
		notifications.info('a');
		notifications.info('a');
		const ids = get(notifications).map((n) => n.id);
		expect(new Set(ids).size).toBe(2);
	});

	it('carries interpolation values', () => {
		notifications.info('item.addedToast', { count: 12 });
		expect(get(notifications)[0].values).toEqual({ count: 12 });
	});
});
