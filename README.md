# Dustic

A vibe-coded, minimalist music player progressive web app that streams audio directly from the Internet Archive. Browse, search, and play dusty recordings from one of the world's largest digital libraries.

## Features

- **Stream from Internet Archive**: Access millions of audio recordings directly
- **Smart Search**: Search across multiple audio collections with filters
- **Rule-based Autoplay**: Configurable intelligent playlist continuation
- **Library Management**: Favorites, playlists, and listening history
- **Offline Support**: Download tracks for offline playback
- **User-controlled Data**: Manual JSON export/import for profile management
- **Progressive Web App**: Installable on mobile and desktop
- **Minimalist Design**: Clean black and white interface
- **No Backend Required**: Fully client-side application
- **Automated Testing**: Unit tests for critical functionality

## Tech Stack

- SvelteKit with TypeScript
- TailwindCSS + DaisyUI
- Internet Archive API
- Static site generation (adapter-static)

## Local Development

### Prerequisites

- Node.js 18+ and npm

### Setup

1. Clone the repository:
```bash
git clone https://github.com/essicolo/dustic.git
cd dustic
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser to `http://localhost:5173`

### Development Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run check` - Run TypeScript and Svelte checks
- `npm test` - Run unit tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:ui` - Run tests with browser UI

### Running Tests

Dustic includes a comprehensive test suite for critical functionality:

```bash
# Run all tests once
npm test

# Watch mode (auto-runs on file changes)
npm run test:watch

# Browser UI for debugging
npm run test:ui
```

See `src/tests/README.md` for detailed testing documentation.

## Deploying to GitHub Pages

**Dustic is specifically designed for GitHub Pages deployment.** The app uses SPA routing with a 404.html fallback to enable direct navigation and page refreshes.

### Automatic Deployment (Recommended)

This repository includes a GitHub Actions workflow for automatic deployment.

1. **Enable GitHub Pages**:
   - Go to repository Settings > Pages
   - Under "Source", select "GitHub Actions"

2. **Deploy**:
   - Merge your changes to the `main` branch
   - The workflow runs automatically and deploys to GitHub Pages
   - Check the "Actions" tab to monitor deployment progress
   - Site will be available at `https://essicolo.github.io/dustic`

The workflow is pre-configured with the correct base path for project pages.

**How SPA Routing Works:**
- The build process creates both `index.html` and `404.html` (identical copies)
- GitHub Pages serves `404.html` for any missing route
- This allows direct navigation to `/library`, `/search`, etc.
- Client-side routing takes over once the app loads

### Manual Deployment

If you prefer manual deployment:

```bash
# Build with base path
BASE_PATH='/dustic' npm run build

# Deploy using gh-pages
npm install -D gh-pages
npx gh-pages -d build
```

**Note:** Other hosting platforms (Netlify, Vercel, etc.) require different routing configurations. This app is optimized for GitHub Pages.

## Custom Domain (Optional)

To use a custom domain like `dustic.ca`:

1. Add a `CNAME` file to the `static` directory:
```bash
echo "dustic.ca" > static/CNAME
```

2. Configure DNS:
   - Add an `A` record pointing to GitHub Pages IPs:
     - `185.199.108.153`
     - `185.199.109.153`
     - `185.199.110.153`
     - `185.199.111.153`
   - Or add a `CNAME` record pointing to `yourusername.github.io`

3. Update GitHub repository settings:
   - Go to Settings > Pages
   - Enter your custom domain
   - Enable "Enforce HTTPS"

## User Data Management

Dustic does not use localStorage or cookies. All user data (favorites, playlists, history, settings) is managed through manual JSON export/import:

1. **Export Profile**: Download your profile as a JSON file
2. **Import Profile**: Upload a previously saved JSON file
3. **Warning on Exit**: Browser warns if you have unsaved changes

This gives you full control over your data and allows easy backup or transfer between devices.

## Internet Archive API

This application uses the Internet Archive's public API. Rate limits apply per IP address:

- Search requests come from the user's browser
- No server-side proxying
- Each user has their own rate limit quota

## Contributing

Contributions welcome. Please open an issue first to discuss proposed changes.

## Feedback

Report bugs or request features at: https://github.com/essicolo/dustic/issues

## License

GPL-3
