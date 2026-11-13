// Test-only transport adapter. Auth HTTP is simulated; all CRUD/RLS/workflow SQL is real PostgreSQL.
// This file is never imported by frontend/src/ or shipped in the production bundle.
import type { BrowserContext } from '@playwright/test';
import { createDatabase, request, users } from '../../backend/tests/database/helpers';

export async function createBackend() {
  const db = await createDatabase();
  let queue: Promise<unknown> = Promise.resolve();
  const query = <T>(user: string | null, sql: string, args: unknown[] = []): Promise<T[]> => {
    const result = queue.then(async () => {
      await db.exec('begin');
      try {
        const rows = await request<T>(db, user, sql, args);
        await db.exec('commit');
        return rows;
      } catch (error) {
        await db.exec('rollback');
        throw error;
      }
    });
    queue = result.catch(() => undefined);
    return result;
  };
  const [site] = await query<{ id: string }>(
    users.manager,
    "select * from public.create_site('ЖК Северный парк','Москва, ул. Строителей, 12')",
  );
  const [task] = await query<{ id: string }>(
    users.manager,
    "select * from public.create_task($1,'Проверить армирование','Проверить узлы перед заливкой бетона.',$2)",
    [site.id, users.executorA],
  );
  const [other] = await query<{ id: string }>(
    users.manager,
    "select * from public.create_task($1,'Чужая задача B','Не должна быть видна исполнителю A.',$2)",
    [site.id, users.executorB],
  );
  const accounts = new Map(
    Object.entries(users).map(([name, id]) => [`${name.toLowerCase()}@example.test`, id]),
  );
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-expose-headers': 'content-range',
  };
  function authUser(id: string, email: string) {
    return {
      id,
      email,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    };
  }
  async function install(context: BrowserContext) {
    await context.route('http://127.0.0.1:54321/**', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const fulfill = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
        route.fulfill({
          status,
          headers: { ...cors, ...extra },
          contentType: 'application/json',
          body: JSON.stringify(data),
        });
      if (req.method() === 'OPTIONS') {
        await fulfill({});
        return;
      }
      if (url.pathname === '/auth/v1/token') {
        const body = req.postDataJSON() as { email?: string; password?: string };
        const id = accounts.get(body.email ?? '');
        if (!id || body.password !== 'test-password') {
          await fulfill(
            { error: 'invalid_grant', error_description: 'Invalid login credentials' },
            400,
          );
          return;
        }
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const jwt = [
          Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
          Buffer.from(
            JSON.stringify({ sub: id, aud: 'authenticated', role: 'authenticated', exp }),
          ).toString('base64url'),
          'test-signature',
        ].join('.');
        await fulfill({
          access_token: jwt,
          refresh_token: 'test-refresh',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: exp,
          user: authUser(id, body.email!),
        });
        return;
      }
      if (url.pathname === '/auth/v1/logout') {
        await fulfill({});
        return;
      }
      let userId: string | null = null;
      try {
        userId = JSON.parse(
          Buffer.from(
            (req.headers().authorization ?? '').split('.')[1] ?? '',
            'base64url',
          ).toString(),
        ).sub;
      } catch {
        /* anonymous */
      }
      if (url.pathname === '/auth/v1/user') {
        await fulfill(authUser(userId ?? '', 'test@example.test'));
        return;
      }
      try {
        const rpc = url.pathname.split('/rest/v1/rpc/')[1];
        if (rpc) {
          const names: Record<string, string[]> = {
            create_site: ['p_name', 'p_address', 'p_request_id'],
            update_site: ['p_id', 'p_expected_version', 'p_name', 'p_address'],
            delete_site: ['p_id', 'p_expected_version'],
            create_task: ['p_site_id', 'p_title', 'p_description', 'p_assignee_id', 'p_request_id'],
            update_task: [
              'p_id',
              'p_expected_version',
              'p_site_id',
              'p_title',
              'p_description',
              'p_assignee_id',
            ],
            delete_task: ['p_id', 'p_expected_version'],
            report_client_error: ['p_id', 'p_source', 'p_code', 'p_route', 'p_release'],
            transition_task: ['p_id', 'p_expected_version', 'p_target_status', 'p_comment'],
          };
          if (!names[rpc]) throw new Error('Unsupported test RPC');
          const body = req.postDataJSON() as Record<string, unknown>;
          const args = names[rpc].map((k) => body[k] ?? null);
          const rows = await query(
            userId,
            `select * from public.${rpc}(${args.map((_, i) => `$${i + 1}`).join(',')})`,
            args,
          );
          await fulfill(rows[0]);
          return;
        }
        const table = url.pathname.split('/rest/v1/')[1];
        if (!['profiles', 'tasks', 'construction_sites', 'task_status_events'].includes(table))
          throw new Error('Unsupported test table');
        const columns = new Set([
          'id',
          'role',
          'site_id',
          'assignee_id',
          'task_id',
          'status',
          'created_at',
          'display_name',
          'task_version',
        ]);
        const params: unknown[] = [];
        const filters: string[] = [];
        for (const [key, value] of url.searchParams)
          if (columns.has(key) && value.startsWith('eq.')) {
            params.push(value.slice(3));
            filters.push(`"${key}"=$${params.length}`);
          } else if (columns.has(key) && value.startsWith('in.(')) {
            params.push(value.slice(4, -1).split(','));
            filters.push(`"${key}"=any($${params.length}::uuid[])`);
          } else if (columns.has(key) && value.startsWith('ilike.')) {
            params.push(value.slice(6));
            filters.push(`"${key}" ilike $${params.length}`);
          }
        let sql = `select * from public.${table}${filters.length ? ' where ' + filters.join(' and ') : ''}`;
        const order = url.searchParams
          .get('order')
          ?.split(',')
          .map((part) => {
            const [col, direction] = part.split('.');
            if (!columns.has(col)) throw new Error('Unsupported test order');
            return `"${col}" ${direction === 'desc' ? 'desc' : 'asc'}`;
          });
        if (order) sql += ' order by ' + order.join(',');
        const all = await query(userId, sql, params);
        const offset = Number(url.searchParams.get('offset') ?? 0),
          limit = Math.min(1000, Number(url.searchParams.get('limit') ?? 1000));
        if (offset > 0 && offset >= all.length) {
          await fulfill({ code: 'PGRST103', message: 'Requested range not satisfiable' }, 416);
          return;
        }
        const rows = all.slice(offset, offset + limit);
        if (req.headers().accept?.includes('application/vnd.pgrst.object+json')) {
          if (rows.length !== 1)
            await fulfill(
              { code: 'PGRST116', message: 'Not available', details: '', hint: '' },
              406,
            );
          else await fulfill(rows[0]);
        } else
          await fulfill(rows, 200, {
            'content-range': rows.length
              ? `${offset}-${offset + rows.length - 1}/${all.length}`
              : `*/${all.length}`,
          });
      } catch (error) {
        const value = error as { code?: string; message?: string };
        await fulfill(
          {
            code: value.code ?? 'XX000',
            message: value.message ?? 'Test backend failed',
            details: '',
            hint: '',
          },
          value.code === '42501' ? 403 : 400,
        );
      }
    });
  }
  return {
    install,
    query,
    site,
    task,
    other,
    provisionExecutors: async (count: number) => {
      await queue;
      await db.exec('begin');
      await db.query(
        "with inserted as (insert into auth.users(id) select gen_random_uuid() from generate_series(1,$1) returning id) insert into public.profiles(id,display_name,role) select id,'Executor ' || row_number() over(order by id),'executor' from inserted",
        [count],
      );
      await db.exec('commit');
    },
    close: async () => {
      await queue;
      await db.close();
    },
  };
}
