# AI Rules — dustic

Persistent project guidance for this app. Keep this file concise; it is the source of truth for stack and library choices.

## Tech Stack

- **Svelte 5 + SvelteKit** — the entire UI is built with Svelte components (`.svelte` files); use Svelte 5 runes (`$state`, `$derived`, `$effect`) for reactivity, not legacy stores in new components.
- **TypeScript** — all source files are `.ts` / `.svelte` with TS; run `npm run check` (svelte-check) to verify.
- **Vite** — build tool and dev server; SvelteKit is configured in `svelte.config.js` with the Cloudflare adapter (`@sveltejs/adapter-cloudflare`).
- **Tailwind CSS + daisyUI** — all styling goes through Tailwind utility classes plus daisyUI components; two custom monochrome themes (`light`/`dark`) are declared in `tailwind.config.js` and switched via `data-theme`.
- **svelte-i18n** — all user-facing strings go through `$_(...)`; locales live in `src/lib/i18n/locales/` (currently `en`, `fr`). Never hardcode UI strings.
- **@iconify/svelte + Iconify JSON icon sets** — icons are rendered with the `Icon` component (`src/lib/components/Icon.svelte`) using `@iconify-json/mdi` and `@iconify-json/solar`; do not add other icon libraries.
- **Client-side storage** — IndexedDB (via `src/lib/services/indexedDbPersistence.ts`, with `fake-indexeddb` in tests) for audio/offline data; Web Storage for lightweight state; a service worker (`src/service-worker.ts`) for offline support.
- **Testing** — Vitest (+ happy-dom/jsdom, @testing-library/svelte) for unit/component tests in `src/tests/`; Playwright for E2E (`test:e2e`).
- **Server-side** — SvelteKit server routes under `src/routes/api/` and `src/lib/server/`; the app deploys to Cloudflare (adapter-cloudflare, workers types).

## Library & Convention Rules

- **UI components:** Build with Svelte 5 + Tailwind + daisyUI classes. Put reusable components in `src/lib/components/`, pages/routes in `src/routes/`. Use the existing `Icon.svelte` wrapper for all icons — never install lucide-react or other icon packages.
- **State management:** Prefer Svelte 5 runes in components. Cross-component app state lives in the existing store modules under `src/lib/stores/` (player, queue, library, settings, theme, etc.) — reuse those rather than creating new global state mechanisms.
- **Data fetching / music sources:** All source integrations (Internet Archive, Funkwhale, WebDAV) go through the existing service modules in `src/lib/services/`. Do not add new HTTP client libraries; use `fetch`.
- **Validation:** Use **zod** (already a dependency) for schema validation — see `src/lib/schemas/`.
- **Audio metadata:** Use **music-metadata** for reading tags; do not add other tag-parsing libraries.
- **Internationalization:** Use **svelte-i18n** only. Add new strings to both `en.json` and `fr.json`.
- **Styling:** Tailwind CSS only (plus the configured daisyUI themes). Follow the brand rules in `tailwind.config.js`: sharp corners (`rounded-*` resolves to one token), named z-index layers (`overlay`, `nav`, `popover`, `modal`, `toast`), Inter for UI text and Lora (`font-display`) for display type. Never add a second CSS framework.
- **Do not** introduce React, Next.js, shadcn/ui, or other frameworks — this is a SvelteKit app.
