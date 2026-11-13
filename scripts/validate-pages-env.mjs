const url = process.env.VITE_SUPABASE_URL ?? '';
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
let validUrl = false;
try {
  const parsed = new URL(url);
  validUrl =
    parsed.protocol === 'https:' &&
    parsed.hostname.endsWith('.supabase.co') &&
    parsed.pathname === '/';
} catch {
  /* Missing/malformed repository variable. */
}
let publicKey = key.startsWith('sb_publishable_') && key.length > 20;
if (!publicKey && key.startsWith('eyJ')) {
  try {
    publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon';
  } catch {
    /* Not a legacy anon JWT. */
  }
}
if (!validUrl || !publicKey) {
  console.error(
    'Set repository Variables VITE_SUPABASE_URL (https://<project>.supabase.co) and VITE_SUPABASE_PUBLISHABLE_KEY (sb_publishable_… or legacy anon key). Secret keys are not accepted.',
  );
  process.exitCode = 1;
} else console.log('Public Supabase configuration: OK');
