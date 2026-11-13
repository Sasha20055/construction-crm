// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDatabase, request, users } from './helpers';

type Row = {
  id: string;
  version: number;
  status: string;
  site_id: string;
  author_id: string;
  assignee_id: string;
  deleted_at: string | null;
};
let db: PGlite;
let site: Row, privateSite: Row, taskA: Row, taskB: Row;
const call = (user: string | null, sql: string, args: unknown[] = []) =>
  request<Row>(db, user, sql, args);
const transition = (user: string, task: Row, status: string, comment: string | null = null) =>
  call(user, 'select * from public.transition_task($1,$2,$3,$4)', [
    task.id,
    task.version,
    status,
    comment,
  ]);

beforeAll(async () => {
  db = await createDatabase();
  await db.exec('begin');
  [site] = await call(users.manager, "select * from public.create_site('Общий объект','Адрес 1')");
  [privateSite] = await call(
    users.manager,
    "select * from public.create_site('Другой объект','Адрес 2')",
  );
  [taskA] = await call(users.manager, "select * from public.create_task($1,'Задача A','',$2)", [
    site.id,
    users.executorA,
  ]);
  [taskB] = await call(users.manager, "select * from public.create_task($1,'Задача B','',$2)", [
    site.id,
    users.executorB,
  ]);
  await call(users.manager, "select * from public.create_task($1,'Скрытая задача','',$2)", [
    privateSite.id,
    users.executorB,
  ]);
  await db.exec('commit');
});
beforeEach(async () => {
  await db.exec('begin');
});
afterEach(async () => {
  await db.exec('rollback');
});
afterAll(async () => {
  await db?.close();
});

describe('RLS visibility and least privilege', () => {
  it('trusted service provisioning can validate and update profiles without task write access', async () => {
    await db.exec('set local role service_role');
    await db.query('update public.profiles set display_name=$1 where id=$2', [
      '  Updated name  ',
      users.manager,
    ]);
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select has_table_privilege(current_user,'public.tasks','UPDATE') as allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
    await db.exec('reset role');
  });
  it('AUTH-01: anonymous cannot select data or execute commands', async () => {
    await expect(call(null, 'select * from public.tasks')).rejects.toThrow(/permission denied/);
    await expect(call(null, "select * from public.create_site('X','Y')")).rejects.toThrow(
      /permission denied/,
    );
  });
  it('TASK-02: executors see only their own tasks on a shared site', async () => {
    expect((await call(users.executorA, 'select * from public.tasks')).map((r) => r.id)).toEqual([
      taskA.id,
    ]);
    expect(
      await call(users.executorA, 'select * from public.tasks where id=$1', [taskB.id]),
    ).toEqual([]);
    expect((await call(users.executorB, 'select * from public.tasks')).length).toBe(2);
    expect((await call(users.managerB, 'select * from public.tasks')).length).toBe(3);
  });
  it('OBJ-02: hides unrelated sites and foreign history, including joins', async () => {
    expect(
      (await call(users.executorA, 'select * from public.construction_sites')).map((r) => r.id),
    ).toEqual([site.id]);
    expect(
      await call(users.executorA, 'select * from public.task_status_events where task_id=$1', [
        taskB.id,
      ]),
    ).toEqual([]);
    expect(
      (
        await call(
          users.executorA,
          'select t.* from public.construction_sites s join public.tasks t on t.site_id=s.id',
        )
      ).length,
    ).toBe(1);
  });
  it('ROLE-01: profiles are scoped and roles cannot be changed', async () => {
    const profiles = await call(users.executorA, 'select id from public.profiles');
    expect(profiles.map((r) => r.id).sort()).toEqual([users.manager, users.executorA].sort());
    await expect(
      call(users.executorA, "update public.profiles set role='manager' where id=$1", [
        users.executorA,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      call(users.executorA, "select * from public.create_site('X','Y')"),
    ).rejects.toThrow(/FORBIDDEN/);
  });
  it('unknown authenticated profile has no access', async () => {
    expect(await call(users.noProfile, 'select * from public.tasks')).toEqual([]);
    await expect(transition(users.noProfile, taskA, 'in_progress')).rejects.toThrow(/FORBIDDEN/);
  });
  it.each(['tasks', 'construction_sites', 'profiles', 'task_status_events'])(
    'direct DELETE of %s is forbidden',
    async (table) => {
      await expect(call(users.manager, `delete from public.${table}`)).rejects.toThrow(
        /permission denied/,
      );
    },
  );
  it('direct PATCH/INSERT cannot bypass commands', async () => {
    await expect(
      call(users.manager, "update public.tasks set status='accepted' where id=$1", [taskA.id]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      call(
        users.manager,
        "insert into public.task_status_events(task_id,actor_id,to_status,task_version) values($1,$2,'accepted',42)",
        [taskA.id, users.manager],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      call(users.manager, "update public.task_status_events set comment='подделка'"),
    ).rejects.toThrow(/permission denied/);
  });
  it('executor cannot CRUD or reassign', async () => {
    await expect(
      call(users.executorA, 'select * from public.delete_task($1,$2)', [taskA.id, 1]),
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(
      call(users.executorA, "select * from public.create_task($1,'X','',$2)", [
        site.id,
        users.executorA,
      ]),
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(
      call(users.executorA, "select * from public.update_task($1,1,$2,'X','',$3)", [
        taskA.id,
        site.id,
        users.executorB,
      ]),
    ).rejects.toThrow(/FORBIDDEN/);
  });
  it('privileged command role cannot log in, create functions, promote users or edit audit', async () => {
    const result = await db.query<{
      can_login: boolean;
      can_bypass: boolean;
      can_create: boolean;
      can_promote: boolean;
      can_edit_audit: boolean;
    }>(`select
      (select rolcanlogin from pg_roles where rolname='crm_backend') as can_login,
      (select rolbypassrls from pg_roles where rolname='crm_backend') as can_bypass,
      has_schema_privilege('crm_backend','public','CREATE') as can_create,
      has_table_privilege('crm_backend','public.profiles','UPDATE') as can_promote,
      has_table_privilege('crm_backend','public.task_status_events','UPDATE') as can_edit_audit`);
    expect(Object.values(result.rows[0])).toEqual([false, false, false, false, false]);
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select has_table_privilege('service_role','public.task_status_events','INSERT') as allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
  });
});

describe('workflow and immutable audit', () => {
  it('FLOW-01/HIST-01: full workflow with real actors and exactly one event per transition', async () => {
    let [task] = await transition(users.executorA, taskA, 'in_progress');
    [task] = await transition(users.executorA, task, 'in_review');
    [task] = await transition(users.manager, task, 'rework', '  Исправить швы  ');
    [task] = await transition(users.executorA, task, 'in_progress');
    [task] = await transition(users.executorA, task, 'in_review');
    [task] = await transition(users.managerB, task, 'accepted');
    expect(task.status).toBe('accepted');
    const events = await request<{
      from_status: string | null;
      to_status: string;
      actor_id: string;
      comment: string | null;
      task_version: number;
    }>(
      db,
      users.executorA,
      'select * from public.task_status_events where task_id=$1 order by task_version',
      [task.id],
    );
    expect(events.map((e) => e.to_status)).toEqual([
      'new',
      'in_progress',
      'in_review',
      'rework',
      'in_progress',
      'in_review',
      'accepted',
    ]);
    expect(events[0].from_status).toBeNull();
    expect(events[3].comment).toBe('Исправить швы');
    expect(events.map((e) => e.actor_id)).toEqual([
      users.manager,
      users.executorA,
      users.executorA,
      users.manager,
      users.executorA,
      users.executorA,
      users.managerB,
    ]);
    expect(events.map((e) => e.task_version)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  const statuses = ['new', 'in_progress', 'in_review', 'accepted', 'rework'];
  for (const role of ['manager', 'executorA', 'executorB'] as const) {
    for (const from of statuses) {
      for (const to of statuses) {
        const allowed =
          role === 'manager'
            ? from === 'in_review' && ['accepted', 'rework'].includes(to)
            : role === 'executorA' &&
              ((['new', 'rework'].includes(from) && to === 'in_progress') ||
                (from === 'in_progress' && to === 'in_review'));
        it(`FLOW-01: ${role} ${from} → ${to}: ${allowed ? 'allowed' : 'denied'}`, async () => {
          // A trusted owner sets up each starting state without weakening API grants.
          await db.exec(
            'alter table public.tasks disable trigger guard_task; alter table public.tasks disable trigger audit_task',
          );
          await db.query('update public.tasks set status=$1 where id=$2', [from, taskA.id]);
          await db.exec(
            'alter table public.tasks enable trigger guard_task; alter table public.tasks enable trigger audit_task',
          );
          if (allowed)
            expect((await transition(users[role], taskA, to, 'Комментарий'))[0].status).toBe(to);
          else
            await expect(transition(users[role], taskA, to, 'Комментарий')).rejects.toThrow(
              /INVALID_TRANSITION|NOT_AVAILABLE/,
            );
        });
      }
    }
  }
  it.each([null, '', '   ', '\n\t', '\r\n', '\u00a0'])(
    'FLOW-02: rejects empty return comment %j',
    async (comment) => {
      let [task] = await transition(users.executorA, taskA, 'in_progress');
      [task] = await transition(users.executorA, task, 'in_review');
      await expect(transition(users.manager, task, 'rework', comment)).rejects.toThrow(
        /COMMENT_REQUIRED/,
      );
      expect(
        (await call(users.manager, 'select * from public.tasks where id=$1', [task.id]))[0].status,
      ).toBe('in_review');
      expect(
        (
          await call(users.manager, 'select * from public.task_status_events where task_id=$1', [
            task.id,
          ])
        ).length,
      ).toBe(3);
    },
  );
  it('CONC-01: stale version cannot duplicate an event or overwrite state', async () => {
    await transition(users.executorA, taskA, 'in_progress');
    await expect(transition(users.executorA, taskA, 'in_progress')).rejects.toThrow(
      /VERSION_CONFLICT/,
    );
    expect(
      (
        await call(users.executorA, 'select * from public.task_status_events where task_id=$1', [
          taskA.id,
        ])
      ).length,
    ).toBe(2);
  });
  it('trigger validates future privileged writes too', async () => {
    await db.exec('savepoint trigger_probe; set local role crm_backend');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [users.executorA]);
    await expect(
      db.query("update public.tasks set status='accepted' where id=$1", [taskA.id]),
    ).rejects.toThrow(/INVALID_TRANSITION/);
    await db.exec(
      'rollback to savepoint trigger_probe; release savepoint trigger_probe; reset role',
    );
  });
});

describe('CRUD constraints and deletion', () => {
  it('creates server-owned fields, rejects wrong assignee and empty inputs', async () => {
    expect(taskA.author_id).toBe(users.manager);
    expect(taskA.status).toBe('new');
    await expect(
      call(users.manager, "select * from public.create_task($1,'X','',$2)", [
        site.id,
        users.manager,
      ]),
    ).rejects.toThrow(/INVALID_ASSIGNEE/);
    await expect(call(users.manager, "select * from public.create_site('  ','Y')")).rejects.toThrow(
      /check constraint/,
    );
  });
  it('reassignment transfers access and preserves status/history', async () => {
    const [working] = await transition(users.executorA, taskA, 'in_progress');
    const [moved] = await call(
      users.manager,
      "select * from public.update_task($1,$2,$3,'Переназначена','',$4)",
      [working.id, working.version, privateSite.id, users.executorB],
    );
    expect(moved.status).toBe('in_progress');
    expect(
      await call(users.executorA, 'select * from public.tasks where id=$1', [moved.id]),
    ).toEqual([]);
    expect(
      await call(users.executorA, 'select * from public.task_status_events where task_id=$1', [
        moved.id,
      ]),
    ).toEqual([]);
    expect(
      (
        await call(users.executorB, 'select * from public.task_status_events where task_id=$1', [
          moved.id,
        ])
      ).length,
    ).toBe(2);
    await expect(transition(users.executorA, moved, 'in_review')).rejects.toThrow(/NOT_AVAILABLE/);
  });
  it('updates site with version guard', async () => {
    const [edited] = await call(
      users.managerB,
      "select * from public.update_site($1,1,'Новое имя','Адрес')",
      [site.id],
    );
    expect(edited.version).toBe(2);
    await expect(
      call(users.manager, "select * from public.update_site($1,1,'Потерянное изменение','Адрес')", [
        site.id,
      ]),
    ).rejects.toThrow(/VERSION_CONFLICT/);
  });
  it('DEL-01: site deletion hides children/history without destroying audit', async () => {
    await call(users.manager, 'select * from public.delete_site($1,1)', [site.id]);
    expect(
      await call(users.manager, 'select * from public.construction_sites where id=$1', [site.id]),
    ).toEqual([]);
    expect(await call(users.executorA, 'select * from public.tasks')).toEqual([]);
    expect(
      await call(users.manager, 'select * from public.task_status_events where task_id=$1', [
        taskA.id,
      ]),
    ).toEqual([]);
    expect(
      (await db.query('select * from public.task_status_events where task_id=$1', [taskA.id])).rows
        .length,
    ).toBe(1);
    await expect(
      call(users.manager, "select * from public.create_task($1,'X','',$2)", [
        site.id,
        users.executorA,
      ]),
    ).rejects.toThrow(/NOT_AVAILABLE/);
    await expect(transition(users.executorA, taskA, 'in_progress')).rejects.toThrow(
      /NOT_AVAILABLE/,
    );
  });
  it('task deletion is versioned and cannot be repeated', async () => {
    await call(users.manager, 'select * from public.delete_task($1,1)', [taskA.id]);
    expect(
      await call(users.executorA, 'select * from public.tasks where id=$1', [taskA.id]),
    ).toEqual([]);
    await expect(
      call(users.manager, 'select * from public.delete_task($1,2)', [taskA.id]),
    ).rejects.toThrow(/NOT_AVAILABLE/);
  });
});
