import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const version = {
	version: Date.now().toString(),
	buildTime: new Date().toISOString()
};

const outputPath = join(__dirname, '../static/version.json');
writeFileSync(outputPath, JSON.stringify(version, null, 2));

console.log('Generated version.json:', version);
