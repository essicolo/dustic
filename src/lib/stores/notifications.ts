// Transient user-facing messages.
//
// Added because failures had nowhere to go: clicking play on an item the
// archive has since removed threw out of an un-caught async handler, so the
// button simply did nothing and the only trace was a stack in the console.
// Components hold i18n *keys* rather than translated text, so the message is
// rendered in whatever language is active when it is shown.

import { writable } from 'svelte/store';

export type NotificationKind = 'info' | 'error';

export interface Notification {
	id: number;
	kind: NotificationKind;
	messageKey: string;
	values?: Record<string, string | number>;
}

const DISMISS_AFTER = 4000;

function createNotificationStore() {
	const { subscribe, update } = writable<Notification[]>([]);
	let nextId = 0;

	function dismiss(id: number) {
		update((all) => all.filter((n) => n.id !== id));
	}

	function push(kind: NotificationKind, messageKey: string, values?: Notification['values']) {
		const id = nextId++;
		update((all) => [...all, { id, kind, messageKey, values }]);
		// Timers are per-message so a second message does not cut the first
		// one short, and dismissing by id is idempotent.
		setTimeout(() => dismiss(id), DISMISS_AFTER);
		return id;
	}

	return {
		subscribe,
		dismiss,
		info: (messageKey: string, values?: Notification['values']) => push('info', messageKey, values),
		error: (messageKey: string, values?: Notification['values']) => push('error', messageKey, values),
		clear: () => update(() => [])
	};
}

export const notifications = createNotificationStore();
