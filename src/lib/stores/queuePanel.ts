import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'inde-queue-panel-open';

function createQueuePanelStore() {
	const initial = browser ? localStorage.getItem(STORAGE_KEY) === 'true' : false;
	const { subscribe, set, update } = writable<boolean>(initial);

	return {
		subscribe,
		toggle() {
			update((open) => {
				const next = !open;
				if (browser) localStorage.setItem(STORAGE_KEY, String(next));
				return next;
			});
		},
		close() {
			set(false);
			if (browser) localStorage.setItem(STORAGE_KEY, 'false');
		},
		open() {
			set(true);
			if (browser) localStorage.setItem(STORAGE_KEY, 'true');
		}
	};
}

export const queuePanelOpen = createQueuePanelStore();
