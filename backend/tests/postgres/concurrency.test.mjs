import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';

const clients = [];
let owner, first, second, actor, executor, site, taskA, taskB, target;
async function connection(url) {
  const client = new Client({
    connectionString: url,
    statement_timeout: 5000,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  clients.push(client);
  return client;
}
async function asUser(client, user) {
  await client.query('begin');
  await client.query('set local role authenticated');
  await client.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
}
const row = async (client, sql, args = []) => (await client.query(sql, args)).rows[0];
before(async () => {
  const status = spawnSync(process.execPath, ['backend/scripts/cli.mjs', 'status', '-o', 'json'], {
    encoding: 'utf8',
  });
  if (status.status !== 0) throw new Error('Local Supabase is required');
  const settings = JSON.parse(status.stdout);
  const url = settings.DB_URL ?? settings.db_url;
  if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname))
    throw new Error('Only a local database is allowed');
  [owner, first, second] = await Promise.all([connection(url), connection(url), connection(url)]);
  const accounts = await owner.query(
    "select p.id,p.role from public.profiles p join auth.users u using(id) where u.email in ('manager@crm.example.test','executor.a@crm.example.test')",
  );
  actor = accounts.rows.find((profile) => profile.role === 'manager')?.id;
  executor = accounts.rows.find((profile) => profile.role === 'executor')?.id;
  if (!actor || !executor) throw new Error('Run setup:local to provision test accounts');
  await asUser(owner, actor);
  site = await row(owner, "select * from public.create_site('Concurrency fixture','Test')");
  target = await row(owner, "select * from public.create_site('Concurrency target','Test')");
  taskA = await row(owner, "select * from public.create_task($1,'A','',$2)", [site.id, executor]);
  taskB = await row(owner, "select * from public.create_task($1,'B','',$2)", [site.id, executor]);
  await owner.query('commit');
});
afterEach(async () => {
  await Promise.all(clients.map((client) => client.query('rollback')));
});
after(async () => {
  await Promise.all(clients.map((client) => client.query('rollback')));
  if (owner && site) {
    await asUser(owner, actor);
    for (const item of [site, target]) {
      const current = await row(owner, 'select * from public.construction_sites where id=$1', [
        item.id,
      ]);
      if (current)
        await owner.query('select public.delete_site($1,$2)', [item.id, current.version]);
    }
    await owner.query('commit');
  }
  await Promise.all(clients.map((client) => client.end()));
});
test('different tasks on the same site can change while the first transaction stays open', async () => {
  await asUser(first, executor);
  await first.query("select public.transition_task($1,1,'in_progress')", [taskA.id]);
  await asUser(second, executor);
  await second.query("set local lock_timeout='500ms'");
  await second.query("select public.transition_task($1,1,'in_progress')", [taskB.id]);
  await second.query('rollback');
  await first.query('rollback');
});
test('deletion waits for task commands and then hides their committed result', async () => {
  await asUser(first, executor);
  await first.query("select public.transition_task($1,1,'in_progress')", [taskA.id]);
  await asUser(second, actor);
  const pending = second.query('select public.delete_site($1,1)', [site.id]);
  const observed = pending.then(
    () => 'deleted',
    () => 'failed',
  );
  await owner.query('select pg_sleep(0.1)');
  assert.equal(
    (await row(owner, 'select cardinality(pg_blocking_pids($1)) as n', [second.processID])).n,
    1,
  );
  await first.query('commit');
  await pending;
  assert.equal(await observed, 'deleted');
  await second.query('commit');
  assert.equal(
    (
      await row(
        owner,
        'select count(*)::int as n from public.tasks where site_id=$1 and deleted_at is null',
        [site.id],
      )
    ).n,
    0,
  );
});
test('moving into a deleted target is rejected after the target lock is released', async () => {
  await asUser(first, actor);
  const source = await row(first, "select * from public.create_site('Move source','Test')");
  const task = await row(first, "select * from public.create_task($1,'Moving','',$2)", [
    source.id,
    executor,
  ]);
  await first.query('commit');
  try {
    await asUser(first, actor);
    await first.query('select public.delete_site($1,1)', [target.id]);
    await asUser(second, actor);
    const pending = second.query("select public.update_task($1,1,$2,'Moved','',$3)", [
      task.id,
      target.id,
      executor,
    ]);
    const checked = assert.rejects(pending, { code: 'P0002' });
    await owner.query('select pg_sleep(0.1)');
    assert.equal(
      (await row(owner, 'select cardinality(pg_blocking_pids($1)) as n', [second.processID])).n,
      1,
    );
    await first.query('commit');
    await checked;
    await second.query('rollback');
    assert.equal(
      (await row(owner, 'select site_id from public.tasks where id=$1', [task.id])).site_id,
      source.id,
    );
  } finally {
    await first.query('rollback');
    await second.query('rollback');
    await asUser(owner, actor);
    await owner.query('select public.delete_site($1,1)', [source.id]);
    await owner.query('commit');
  }
});
test('concurrent retries create a single row and do not double-log creation', async () => {
  const key = crypto.randomUUID();
  await asUser(first, actor);
  const created = await row(first, "select * from public.create_site('Retry fixture','Test',$1)", [
    key,
  ]);
  await asUser(second, actor);
  const pending = row(second, "select * from public.create_site('Retry fixture','Test',$1)", [key]);
  await first.query('commit');
  const retry = await pending;
  await second.query('commit');
  assert.equal(created.id, retry.id);
  const taskKey = crypto.randomUUID();
  await asUser(first, actor);
  const task = await row(first, "select * from public.create_task($1,'Retry task','',$2,$3)", [
    created.id,
    executor,
    taskKey,
  ]);
  await asUser(second, actor);
  const retryTask = row(second, "select * from public.create_task($1,'Retry task','',$2,$3)", [
    created.id,
    executor,
    taskKey,
  ]);
  await first.query('commit');
  assert.equal((await retryTask).id, task.id);
  await second.query('commit');
  assert.equal(
    (
      await row(
        owner,
        'select count(*)::int as n from public.task_status_events where task_id=$1',
        [task.id],
      )
    ).n,
    1,
  );
  await asUser(owner, actor);
  await owner.query('select public.delete_site($1,1)', [created.id]);
  await owner.query('commit');
});
