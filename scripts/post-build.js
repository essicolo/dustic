#!/usr/bin/env node

/**
 * Post-build script
 *
 * For Cloudflare Pages: No action needed (Cloudflare handles SPA routing automatically)
 * For GitHub Pages: Creates 404.html from index.html for SPA routing
 */

import { copyFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const buildDir = resolve('./build');
const indexPath = resolve(buildDir, 'index.html');
const notFoundPath = resolve(buildDir, '404.html');

// Check if using Cloudflare adapter (no index.html in build dir)
if (!existsSync(indexPath)) {
	console.log('✅ Using Cloudflare Pages (no post-build action needed)');
	process.exit(0);
}

// GitHub Pages: Copy index.html to 404.html for SPA routing
try {
	copyFileSync(indexPath, notFoundPath);
	console.log('✅ Created 404.html for GitHub Pages SPA routing');
} catch (error) {
	console.error('❌ Failed to create 404.html:', error);
	process.exit(1);
}
