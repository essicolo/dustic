#!/usr/bin/env node

/**
 * Post-build script for GitHub Pages SPA routing
 *
 * GitHub Pages serves 404.html for any route that doesn't have a physical file.
 * For SPA routing to work, we need 404.html to be a copy of index.html,
 * so the app loads and client-side routing can take over.
 */

import { copyFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const buildDir = resolve('./build');
const indexPath = resolve(buildDir, 'index.html');
const notFoundPath = resolve(buildDir, '404.html');

if (!existsSync(indexPath)) {
	console.error('❌ index.html not found in build directory');
	process.exit(1);
}

try {
	copyFileSync(indexPath, notFoundPath);
	console.log('✅ Created 404.html for GitHub Pages SPA routing');
} catch (error) {
	console.error('❌ Failed to create 404.html:', error);
	process.exit(1);
}
