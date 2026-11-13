import { spawnSync } from 'node:child_process';
if (!['http://127.0.0.1:54321', 'http://localhost:54321'].includes(process.env.VITE_SUPABASE_URL)) {
  throw new Error('Live UI tests are restricted to local Supabase. Run setup:local first.');
}
const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], {
  stdio: 'inherit',
  env: { ...process.env, CRM_LIVE_SUPABASE: '1' },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
