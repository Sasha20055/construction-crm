import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  return result;
}
function checked(command, args, options = {}) {
  const result = run(command, args, options);
  if (result.status !== 0) {
    let reason = (result.stderr ?? '').trim().slice(-2000);
    for (const [name, value] of Object.entries(options.env ?? process.env)) {
      if (/KEY|PASSWORD|TOKEN|SECRET/.test(name) && value && value.length > 6)
        reason = reason.replaceAll(value, '[redacted]');
    }
    throw new Error(
      `${command} ${args.join(' ')} failed. ${reason || 'Check Docker Desktop and retry.'}`,
    );
  }
  return result.stdout;
}
const excluded = 'realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor';
try {
  checked('docker', ['info', '--format', '{{.ServerVersion}}']);
  console.log('Starting local Supabase (first run downloads container images)…');
  // Capture CLI output: successful `supabase start` prints privileged local keys.
  checked(process.execPath, ['backend/scripts/cli.mjs', 'start', '-x', excluded]);
  checked(process.execPath, ['backend/scripts/cli.mjs', 'migration', 'up', '--local']);
  const status = JSON.parse(
    checked(process.execPath, ['backend/scripts/cli.mjs', 'status', '-o', 'json']),
  );
  const value = (name) => status[name] ?? status[name.toLowerCase()];
  const url = value('API_URL');
  const publicKey = value('ANON_KEY') ?? value('PUBLISHABLE_KEY');
  const serviceKey = value('SERVICE_ROLE_KEY') ?? value('SECRET_KEY');
  if (!url || !publicKey || !serviceKey)
    throw new Error('Supabase CLI did not return local API settings.');
  let env = '';
  try {
    env = await readFile('.env.local', 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const existingUrl = env.match(/^VITE_SUPABASE_URL=(.*)$/m)?.[1]?.trim();
  if (existingUrl && !['http://127.0.0.1:54321', 'http://localhost:54321'].includes(existingUrl))
    throw new Error(
      'Existing .env.local points to another project; move it aside before local setup.',
    );
  env = env.replace(/^VITE_SUPABASE_(URL|PUBLISHABLE_KEY)=.*\r?\n?/gm, '');
  env += `\nVITE_SUPABASE_URL=${url}\nVITE_SUPABASE_PUBLISHABLE_KEY=${publicKey}\n`;
  await writeFile('.env.local', env, { mode: 0o600 });
  await chmod('.env.local', 0o600);
  let credentials;
  try {
    credentials = JSON.parse(await readFile('demo-credentials.json', 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const password = credentials?.password ?? randomBytes(24).toString('base64url');
  // Persist before provisioning: a partial run must reuse the same account password next time.
  await writeFile(
    'demo-credentials.json',
    JSON.stringify(
      {
        password,
        accounts: [
          'manager@crm.example.test',
          'executor.a@crm.example.test',
          'executor.b@crm.example.test',
        ],
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  await chmod('demo-credentials.json', 0o600);
  // Service key lives only in the child environment; only the public key goes into .env.local.
  checked(process.execPath, ['backend/scripts/seed-demo.mjs'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SUPABASE_URL: url,
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_PUBLISHABLE_KEY: publicKey,
      SUPABASE_SERVICE_ROLE_KEY: serviceKey,
      DEMO_PASSWORD: password,
    },
  });
  console.log('Local Supabase and demo data are ready. Run npm run dev.');
  console.log(
    'Local-only credentials: demo-credentials.json (ignored by Git). No password is printed.',
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Local setup failed.');
  process.exitCode = 1;
}
