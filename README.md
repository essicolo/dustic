!["screenshot of inde.cc"](static/screenshot01.png)

# Inde

*Your music, your library, your rules.*

Inde (formerly Dustic) is a free, open-source indie music player for the post-streaming era. It streams audio from the [Internet Archive](https://archive.org/) and the [FunkWhale](https://funkwhale.audio/) network, and plays music you own on WebDAV-compatible clouds like Koofr or Nextcloud — keeping your audio profile yours, without online account, ads, or tracking.

**[Try it now on inde.cc](https://inde.cc)**

> Inde was previously hosted at `dustic.app`. The old domain redirects to `inde.cc` at the hosting level.

Inde lets you browse millions of recordings: open music, rare vinyl rips, live bootlegs, field recordings, forgotten albums, audiobooks, podcasts — alongside your own collection from your WebDAV cloud. Everything plays in your browser or as a pinned app on your phone.

## Listen

Here are a few curated entry points to get a feel for what Inde sounds like.

- [Post-rock intro](https://inde.cc/curated/post-rock-intro) — Mogwai, GY!BE, Mono and friends
- [Magazine](https://dustic.bearblog.dev/) — a monthly zine exploring the archive's hidden corners

## Why Inde?

- **No account required.** Open the app. Search. Press play.
- **Bring your own library.** Connect a WebDAV-compatible cloud (Koofr, Nextcloud, pCloud) and stream your own mp3/flac/ogg/m4a files.
- **Offline playback.** Download tracks — including from your WebDAV library — to keep listening without a connection.
- **Your data stays yours.** No cloud profile; export/import your library as a JSON file, or sync across devices with WebDAV.
- **Installable.** Works as a progressive web app on mobile and desktop.
- **Rule-based autoplay.** Set up smart queue rules to keep the music flowing.
- **Theme presets.** Pick from minimalist monochrome, warm sunset, deep forest, neon bubblegum, or midnight violet.

## For developers

Inde is built with SvelteKit, TypeScript, TailwindCSS + DaisyUI, and deploys as a static site to Cloudflare Pages (the same-origin proxy used by WebDAV libraries requires a serverless function host — pure GitHub Pages will not work for that feature).

### Local setup

```bash
git clone https://github.com/essicolo/dustic.git
cd dustic
npm install
npm run dev
# → http://localhost:5173
```

> The GitHub repository is still `essicolo/dustic`. The project was rebranded to "Inde" but the repo URL is preserved for issue history continuity.

### Commands

| Command | Description |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run check` | TypeScript and Svelte checks |
| `npm test` | Run unit tests |
| `npm run test:watch` | Tests in watch mode |
| `npm run test:ui` | Tests with browser UI |

See `src/tests/README.md` for testing documentation.

### Deployment

Inde uses `@sveltejs/adapter-cloudflare` and is designed for Cloudflare Pages. The WebDAV proxy (`src/routes/api/webdav-proxy/+server.ts`) requires a serverless function host; pure GitHub Pages would lose this feature.

#### Custom domain redirect

To migrate from the legacy `dustic.app` to `inde.cc`, set a 301 redirect at the hosting level (Cloudflare Page Rules):

```
https://dustic.app/* → https://inde.cc/$1 (301)
```

### User data

Inde stores nothing server-side. Favorites, playlists, history, theme, and settings live in-browser and can be exported/imported as JSON. WebDAV sync is available for cross-device use.

Legacy `dustic-*` storage keys (localStorage + Cache API) are migrated to `inde-*` automatically on first launch after the rebrand — no user action required.

### Internet Archive API

Search requests go directly from the user's browser to the Internet Archive's public API. No server-side proxying — each user has their own rate limit quota.

## Contributing

Contributions welcome. Please [open an issue](https://github.com/essicolo/dustic/issues) first to discuss proposed changes.

## License

GPL-3.0
