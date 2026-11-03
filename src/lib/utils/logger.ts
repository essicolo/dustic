// Console logging gated to development builds. Services used to call
// console.log directly, which meant every search, metadata fetch and track
// resolution printed to the production console. import.meta.env.DEV is
// statically replaced at build time, so these calls are stripped from
// production bundles entirely.

export function devLog(...args: unknown[]): void {
	if (import.meta.env.DEV) {
		console.log(...args);
	}
}
