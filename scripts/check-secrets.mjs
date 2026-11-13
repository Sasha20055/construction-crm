import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const failures = [];
async function scan(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) {
      await scan(path);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs|json|html)$/.test(path)) continue;
    const text = await readFile(path, 'utf8');
    if (/sb_secret_[A-Za-z0-9_-]{20,}/.test(text)) failures.push(`${path}: secret key literal`);
    if (/VITE_[A-Z_]*(?:SERVICE_ROLE|SECRET|PASSWORD)[A-Z_]*/.test(text))
      failures.push(`${path}: unsafe client environment variable`);
    for (const match of text.matchAll(
      /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/g,
    )) {
      try {
        if (
          JSON.parse(Buffer.from(match[0].split('.')[1], 'base64url').toString()).role ===
          'service_role'
        )
          failures.push(`${path}: privileged JWT literal`);
      } catch {
        /* not a JWT */
      }
    }
  }
}
await scan('frontend/src');
try {
  await scan('frontend/dist');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
for (const path of ['.env.local', 'demo-credentials.json']) {
  if (spawnSync('git', ['check-ignore', '--quiet', path]).status !== 0)
    failures.push(`${path}: must be ignored by Git`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log('Client secret and local credential checks: OK');
