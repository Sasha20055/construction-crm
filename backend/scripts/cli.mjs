// Supabase CLI requires <workdir>/supabase. Keep authored backend code independent of that layout.
import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runtime = join(root, '.local');
const destination = join(runtime, 'supabase');
await mkdir(destination, { recursive: true });
// Copy only authored inputs; keep CLI cache, project links and branch state between calls.
for (const [source, target] of [
  ['config.toml', 'config.toml'],
  ['migrations', 'migrations'],
  ['tests/sql', 'tests'],
  ['seed.sql', 'seed.sql'],
]) {
  await cp(join(root, 'backend', source), join(destination, target), { recursive: true });
}
const result = spawnSync(
  join(root, 'node_modules/.bin/supabase'),
  [...process.argv.slice(2), '--workdir', runtime],
  {
    cwd: root,
    stdio: 'inherit',
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
