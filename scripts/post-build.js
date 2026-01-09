#!/usr/bin/env node

/**
 * Post-build script
 *
 * For Cloudflare Pages: Copies Functions to build output
 * For GitHub Pages: Creates 404.html from index.html for SPA routing
 */

import { copyFileSync, existsSync, cpSync } from 'fs';
import { resolve } from 'path';

const buildDir = resolve('./build');
const cloudflareDir = resolve('./.svelte-kit/cloudflare');
const indexPath = resolve(buildDir, 'index.html');
const notFoundPath = resolve(buildDir, '404.html');

// Check if using Cloudflare adapter (no index.html in build dir)
if (!existsSync(indexPath)) {
	console.log('✅ Using Cloudflare Pages');

	// Copy functions directory to Cloudflare build output
	const functionsSource = resolve('./functions');
	const functionsTarget = resolve(cloudflareDir, 'functions');

	try {
		cpSync(functionsSource, functionsTarget, { recursive: true });
		console.log('✅ Copied Cloudflare Functions to build output');
	} catch (error) {
		console.error('❌ Failed to copy Functions:', error);
		process.exit(1);
	}

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
