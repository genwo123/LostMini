import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  try {
    const config = await readFile(join(__dirname, '../vite.config.js'), 'utf-8');
    const portMatch = config.match(/const PORT = (\d+);/);
    if (!portMatch) throw new Error('PORT not found in vite.config.js');
    const port = portMatch[1];
    
    console.log(`Starting cloudflared tunnel for port ${port}...`);
    execSync(`cloudflared tunnel --url http://localhost:${port}`, { stdio: 'inherit' });
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main(); 