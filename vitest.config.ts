import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
	plugins: [svelte({ hot: !process.env.VITEST })],
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: ['./src/tests/setup.ts'],
		server: {
			deps: {
				// svelte-i18n pulls in intl-messageformat, whose ESM entry
				// imports extensionless paths that node cannot resolve but a
				// bundler can. Inlining it lets components that use $_ be
				// rendered in tests at all.
				inline: [/svelte-i18n/, /intl-messageformat/, /@formatjs/]
			}
		},
		exclude: ['e2e/**', 'node_modules/**']
	},
	resolve: {
		// Without the browser condition, Svelte resolves to its server build
		// and render() throws lifecycle_function_unavailable — which is why
		// component logic had to be extracted to plain modules to be tested.
		conditions: ['browser'],
		alias: {
			$lib: resolve('./src/lib'),
			$app: resolve('./node_modules/@sveltejs/kit/src/runtime/app')
		}
	}
});
