// Runs against actual Supabase Auth + PostgREST. No service key is used by this test.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.API_TEST_PASSWORD;
const emails = [
  process.env.API_MANAGER_EMAIL,
  process.env.API_EXECUTOR_A_EMAIL,
  process.env.API_EXECUTOR_B_EMAIL,
];
const configured = Boolean(url && key && password && emails.every(Boolean));
const make = () =>
  createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
let manager, a, b, site, task;
const checked = (result) => {
  assert.equal(result.error, null);
  return Array.isArray(result.data) ? result.data[0] : result.data;
};
before(async () => {
  if (!configured) return;
  [manager, a, b] = [make(), make(), make()];
  for (const [index, client] of [manager, a, b].entries())
    checked(await client.auth.signInWithPassword({ email: emails[index], password }));
  const assignee = (await a.auth.getUser()).data.user.id;
  site = checked(
    await manager.rpc('create_site', {
      p_name: `API test ${crypto.randomUUID()}`,
      p_address: 'Test fixture',
    }),
  );
  task = checked(
    await manager.rpc('create_task', {
      p_site_id: site.id,
      p_title: 'API security fixture',
      p_description: '',
      p_assignee_id: assignee,
    }),
  );
});
after(async () => {
  if (!configured) return;
  try {
    if (site)
      checked(
        await manager.rpc('delete_site', { p_id: site.id, p_expected_version: site.version }),
      );
  } finally {
    await Promise.all(
      [manager, a, b].filter(Boolean).map((c) => c.auth.signOut({ scope: 'local' })),
    );
  }
});
test('actual Auth signup is disabled', { skip: !configured }, async () => {
  const anonymous = make();
  const result = await anonymous.auth.signUp({
    email: `blocked-${crypto.randomUUID()}@example.test`,
    password: crypto.randomUUID(),
  });
  assert.ok(result.error, 'signup unexpectedly enabled');
  assert.match(result.error.message, /signup|sign.?up|registration/i);
});
test(
  'foreign records, nested tasks and history cannot be read',
  { skip: !configured },
  async () => {
    const result = await b.from('tasks').select('*').eq('id', task.id);
    assert.equal(result.error, null);
    assert.deepEqual(result.data, []);
    assert.deepEqual(
      (await b.from('task_status_events').select('*').eq('task_id', task.id)).data,
      [],
    );
    const nested = await b.from('construction_sites').select('*,tasks(*)').eq('id', site.id);
    assert.equal(nested.error, null);
    assert.deepEqual(nested.data, []);
    assert.equal((await manager.from('tasks').select('id').eq('id', task.id)).data.length, 1);
  },
);
test('direct status PATCH and history writes are denied', { skip: !configured }, async () => {
  assert.ok((await a.from('tasks').update({ status: 'accepted' }).eq('id', task.id)).error);
  assert.ok(
    (await manager.from('task_status_events').update({ comment: 'forged' }).eq('task_id', task.id))
      .error,
  );
  assert.ok((await manager.from('task_status_events').delete().eq('task_id', task.id)).error);
  assert.ok(
    (
      await manager.from('task_status_events').insert({
        task_id: task.id,
        actor_id: task.author_id,
        to_status: 'accepted',
        task_version: 999,
      })
    ).error,
  );
});
test(
  'concurrent requests: one success, one version conflict, one audit event',
  { skip: !configured },
  async () => {
    const args = {
      p_id: task.id,
      p_expected_version: task.version,
      p_target_status: 'in_progress',
    };
    const results = await Promise.all([
      a.rpc('transition_task', args),
      a.rpc('transition_task', args),
    ]);
    assert.equal(results.filter((r) => !r.error).length, 1);
    assert.equal(results.find((r) => r.error).error.code, '40001');
    const events = await a.from('task_status_events').select('*').eq('task_id', task.id);
    assert.equal(events.error, null);
    assert.equal(events.data.length, 2);
  },
);

test(
  'creation request keys survive real HTTP retries without duplicate audit',
  { skip: !configured },
  async () => {
    const assignee = (await a.auth.getUser()).data.user.id;
    const args = {
      p_site_id: site.id,
      p_title: 'HTTP retry fixture',
      p_description: '',
      p_assignee_id: assignee,
      p_request_id: crypto.randomUUID(),
    };
    const created = checked(await manager.rpc('create_task', args));
    const retry = checked(await manager.rpc('create_task', args));
    assert.equal(created.id, retry.id);
    const mismatch = await manager.rpc('create_task', { ...args, p_title: 'Changed payload' });
    assert.equal(mismatch.error?.code, '22023');
    const count = await manager
      .from('task_status_events')
      .select('id', { count: 'exact' })
      .eq('task_id', created.id);
    assert.equal(count.error, null);
    assert.equal(count.count, 1);
  },
);
test(
  'diagnostic ingestion is authenticated and private storage is not exposed',
  { skip: !configured },
  async () => {
    const args = {
      p_id: crypto.randomUUID(),
      p_source: 'render',
      p_code: 'UNEXPECTED',
      p_route: '/tasks/:id',
      p_release: '1.0.0',
    };
    assert.equal((await manager.rpc('report_client_error', args)).error, null);
    assert.ok(
      (await make().rpc('report_client_error', { ...args, p_id: crypto.randomUUID() })).error,
    );
    assert.ok((await manager.schema('private').from('client_errors').select('id')).error);
  },
);
