import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';

export const users = {
  manager: '10000000-0000-4000-8000-000000000001',
  executorA: '10000000-0000-4000-8000-000000000002',
  executorB: '10000000-0000-4000-8000-000000000003',
  managerB: '10000000-0000-4000-8000-000000000004',
  noProfile: '10000000-0000-4000-8000-000000000005',
};
export async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema public,auth to authenticated,anon;
    -- Bootstrap postgres cannot be demoted. Membership inherits object ownership, not SUPERUSER.
    -- Thus owner-transfer checks run under a non-superuser, like Supabase migrations.
    create role migration_owner nologin createrole;
    grant postgres to migration_owner with inherit true, set true;
    set role migration_owner;
  `);
  const migrations = new URL('../../migrations/', import.meta.url);
  for (const name of (await readdir(migrations)).filter((name) => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(name, migrations), 'utf8'));
  }
  await db.exec('reset role');
  for (const [name, id] of Object.entries(users)) {
    await db.query('insert into auth.users values($1,$2)', [id, `${name}@example.test`]);
    if (name !== 'noProfile')
      await db.query('insert into public.profiles values($1,$2,$3)', [
        id,
        name,
        name.startsWith('manager') ? 'manager' : 'executor',
      ]);
  }
  return db;
}

// Each call is isolated by a savepoint, so a denied statement doesn't poison the test transaction.
export async function request<T>(
  db: PGlite,
  user: string | null,
  sql: string,
  params: unknown[] = [],
) {
  await db.exec('savepoint api_request');
  try {
    await db.exec(`set local role ${user ? 'authenticated' : 'anon'}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user ?? '']);
    const result = await db.query<T>(sql, params);
    await db.exec('reset role; release savepoint api_request');
    await db.query("select set_config('request.jwt.claim.sub','',true)");
    return result.rows;
  } catch (error) {
    await db.exec('rollback to savepoint api_request; release savepoint api_request; reset role');
    throw error;
  }
}
