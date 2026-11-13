import { spawnSync } from 'node:child_process';

// Exercise a production bundle with fixture Auth/API, never the user's cloud project.
const env = {
  ...process.env,
  CRM_PAGES_TEST: '1',
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'e2e-public-key',
};
for (const [command, args] of [
  ['npm', ['run', 'build:pages']],
  [process.execPath, ['node_modules/@playwright/test/cli.js', 'test']],
]) {
  const result = spawnSync(command, args, { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
