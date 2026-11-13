import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
if (!['http://127.0.0.1:54321', 'http://localhost:54321'].includes(process.env.VITE_SUPABASE_URL)) {
  throw new Error('This command is restricted to local Supabase. Run npm run setup:local first.');
}
const credentials = JSON.parse(await readFile('demo-credentials.json', 'utf8'));
const result = spawnSync(process.execPath, ['--test', 'backend/tests/api/security.test.mjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    API_MANAGER_EMAIL: credentials.accounts[0],
    API_EXECUTOR_A_EMAIL: credentials.accounts[1],
    API_EXECUTOR_B_EMAIL: credentials.accounts[2],
    API_TEST_PASSWORD: credentials.password,
  },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
