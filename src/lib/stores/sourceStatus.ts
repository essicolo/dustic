// Source availability status store
// Periodically pings IA and FunkWhale to detect which sources are online

import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { DEFAULT_FUNKWHALE_INSTANCES } from '$lib/utils/constants';

export type SourceState = 'unknown' | 'online' | 'offline';

export interface SourceStatus {
	ia: SourceState;
	fw: Record<string, SourceState>; // keyed by instance URL
}

const initial: SourceStatus = {
	ia: 'unknown',
	fw: {}
};

function createSourceStatusStore() {
	const { subscribe, update } = writable<SourceStatus>(initial);
	let intervalId: ReturnType<typeof setInterval> | null = null;

	async function pingIA(): Promise<boolean> {
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 8000);
			const res = await fetch(
				'https://archive.org/advancedsearch.php?q=mediatype:audio&rows=1&output=json',
				{ signal: controller.signal }
			);
			clearTimeout(timeout);
			return res.ok;
		} catch {
			return false;
		}
	}

	async function pingFW(baseUrl: string): Promise<boolean> {
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 8000);
			const res = await fetch(`${baseUrl}/api/v2/tracks/?page_size=1`, {
				signal: controller.signal
			});
			clearTimeout(timeout);
			return res.ok;
		} catch {
			return false;
		}
	}

	async function checkAll() {
		const instances = DEFAULT_FUNKWHALE_INSTANCES.filter(i => i.enabled);

		const [iaOk, ...fwResults] = await Promise.all([
			pingIA(),
			...instances.map(i => pingFW(i.url))
		]);

		update(s => {
			const fw: Record<string, SourceState> = {};
			instances.forEach((inst, idx) => {
				fw[inst.url] = fwResults[idx] ? 'online' : 'offline';
			});
			return { ia: iaOk ? 'online' : 'offline', fw };
		});
	}

	function start() {
		if (!browser) return;
		checkAll();
		// Re-check every 2 minutes
		intervalId = setInterval(checkAll, 2 * 60 * 1000);
	}

	function stop() {
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
	}

	return { subscribe, start, stop, checkAll };
}

export const sourceStatus = createSourceStatusStore();
