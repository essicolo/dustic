import { writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json to get app version
const packageJsonPath = join(__dirname, '../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const appVersion = packageJson.version;

// Create version info with timestamp for cache busting
const version = {
	version: Date.now().toString(),
	appVersion: appVersion,
	buildTime: new Date().toISOString()
};

// Write version.json for update checking
const outputPath = join(__dirname, '../static/version.json');
writeFileSync(outputPath, JSON.stringify(version, null, 2));

// Write TypeScript version file for importing in components
const tsOutputPath = join(__dirname, '../src/lib/version.ts');
const tsContent = `// Auto-generated version file - DO NOT EDIT MANUALLY
// This file is generated during build from package.json
export const APP_VERSION = '${appVersion}';
`;
writeFileSync(tsOutputPath, tsContent);

console.log('Generated version files:', { appVersion, buildTime: version.buildTime });
