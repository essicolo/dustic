# Dustic

A minimalist music player that streams audio directly from the Internet Archive. Browse, search, and play dusty recordings from one of the world's largest digital libraries.

## Features

- **Stream from Internet Archive**: Access millions of audio recordings directly
- **Smart Search**: Search across multiple audio collections with filters
- **Rule-based Autoplay**: Configurable intelligent playlist continuation
- **Library Management**: Favorites, playlists, and listening history
- **User-controlled Data**: Manual JSON export/import for profile management
- **Minimalist Design**: Clean black and white interface
- **No Backend Required**: Fully client-side application

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

## Deploying to GitHub Pages

### Automatic Deployment (Recommended)

This repository is configured for automatic deployment to GitHub Pages via GitHub Actions.

1. **Enable GitHub Pages**:
   - Go to repository Settings > Pages
   - Under "Source", select "GitHub Actions"

2. **Push to main branch**:
   - Any push to the `main` branch triggers automatic build and deployment
   - The site will be available at `https://yourusername.github.io/dustic`

3. **Configure base path** (if using project pages):
   - Update `svelte.config.js`:
     ```javascript
     const config = {
       kit: {
         adapter: adapter({
           pages: 'build',
           assets: 'build',
           fallback: null,
           precompress: false,
           strict: true
         }),
         paths: {
           base: process.env.NODE_ENV === 'production' ? '/dustic' : ''
         }
       }
     };
     ```

### Manual Deployment

1. **Build the application**:
```bash
npm run build
```

2. **Deploy the `build` directory**:
   - Use GitHub's `gh-pages` branch
   - Or use the `build` folder with any static hosting service

3. **Using gh-pages package** (optional):
```bash
npm install -D gh-pages
npx gh-pages -d build
```

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
