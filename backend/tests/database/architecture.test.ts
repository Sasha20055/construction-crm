// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDatabase, request, users } from './helpers';
let db: PGlite;
beforeAll(async () => {
  db = await createDatabase();
});
beforeEach(async () => {
  await db.exec('begin');
});
afterEach(async () => {
  await db.exec('rollback');
});
afterAll(async () => {
  await db.close();
});
const call = <T = { id: string; version: number }>(
  sql: string,
  args: unknown[] = [],
  user = users.manager,
) => request<T>(db, user, sql, args);

it('creation retries return one site and one task with exactly one initial event', async () => {
  const siteKey = crypto.randomUUID(),
    taskKey = crypto.randomUUID();
  const [site] = await call("select * from public.create_site('Site','Address',$1)", [siteKey]);
  const [retry] = await call("select * from public.create_site('Site','Address',$1)", [siteKey]);
  expect(retry.id).toBe(site.id);
  const args = [site.id, users.executorA, taskKey];
  const [task] = await call("select * from public.create_task($1,'Task','',$2,$3)", args);
  expect((await call("select * from public.create_task($1,'Task','',$2,$3)", args))[0].id).toBe(
    task.id,
  );
  expect(
    await call('select id from public.task_status_events where task_id=$1', [task.id]),
  ).toHaveLength(1);
});
it('keys cannot change payload or command, and are isolated by actor', async () => {
  const key = crypto.randomUUID();
  const [site] = await call("select * from public.create_site('Site','Address',$1)", [key]);
  await expect(
    call("select * from public.create_site('Changed','Address',$1)", [key]),
  ).rejects.toThrow('REQUEST_MISMATCH');
  await expect(
    call("select * from public.create_task($1,'Task','',$2,$3)", [site.id, users.executorA, key]),
  ).rejects.toThrow('REQUEST_MISMATCH');
  const [other] = await call(
    "select * from public.create_site('Site','Address',$1)",
    [key],
    users.managerB,
  );
  expect(other.id).not.toBe(site.id);
  await expect(
    call("select * from public.create_site('Site','Address',$1)", [key], users.executorA),
  ).rejects.toThrow('FORBIDDEN');
});
it('failed creations roll back keys; retries cannot reveal soft-deleted records', async () => {
  const key = crypto.randomUUID();
  await expect(call("select * from public.create_site('','Address',$1)", [key])).rejects.toThrow();
  expect((await db.query('select * from private.creation_requests')).rows).toHaveLength(0);
  const [site] = await call("select * from public.create_site('Site','Address',$1)", [key]);
  const taskKey = crypto.randomUUID();
  await call("select * from public.create_task($1,'Task','',$2,$3)", [
    site.id,
    users.executorA,
    taskKey,
  ]);
  await call('select * from public.delete_site($1,1)', [site.id]);
  await expect(
    call("select * from public.create_site('Site','Address',$1)", [key]),
  ).rejects.toThrow('NOT_AVAILABLE');
  await expect(
    call("select * from public.create_task($1,'Task','',$2,$3)", [
      site.id,
      users.executorA,
      taskKey,
    ]),
  ).rejects.toThrow('NOT_AVAILABLE');
});
it('diagnostics are bounded, authenticated, validated and unreadable by clients', async () => {
  for (let i = 0; i < 25; i++)
    await call("select public.report_client_error($1,'render','UNEXPECTED','/tasks/:id','1.0.0')", [
      crypto.randomUUID(),
    ]);
  expect((await db.query('select * from private.client_errors')).rows).toHaveLength(20);
  await expect(call('select * from private.client_errors')).rejects.toThrow('permission denied');
  await expect(call('select * from private.creation_requests')).rejects.toThrow(
    'permission denied',
  );
  await expect(
    call(
      "select public.report_client_error($1,'render','SECRET MESSAGE','/tasks/:id','1.0.0')",
      [crypto.randomUUID()],
      users.executorA,
    ),
  ).rejects.toThrow();
  await expect(
    request(
      db,
      null,
      "select public.report_client_error($1,'render','UNEXPECTED','/sites','1.0.0')",
      [crypto.randomUUID()],
    ),
  ).rejects.toThrow('permission denied');
});
