import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { Client } from 'pg';
const status = spawnSync(process.execPath, ['backend/scripts/cli.mjs', 'status', '-o', 'json'], {
  encoding: 'utf8',
});
if (status.status !== 0) throw new Error('Local Supabase is required');
const settings = JSON.parse(status.stdout);
const url = settings.DB_URL ?? settings.db_url;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
  throw new Error('Only a local database is allowed');
const db = new Client({ connectionString: url, statement_timeout: 30000 });
await db.connect();
const results = [];
try {
  await db.query('begin');
  const manager = crypto.randomUUID(),
    executor = crypto.randomUUID();
  await db.query('insert into auth.users(id) values($1),($2)', [manager, executor]);
  await db.query(
    "insert into public.profiles values($1,'Profile manager','manager'),($2,'Profile executor','executor')",
    [manager, executor],
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [manager]);
  const sites = await db.query(
    "insert into public.construction_sites(name,address,created_by) select 'Profile '||n,'Fixture',$1 from generate_series(1,100) n returning id",
    [manager],
  );
  await db.query(
    "insert into public.tasks(site_id,title,description,assignee_id,author_id) select s,'Profile task '||n,'',$2,$3 from unnest($1::uuid[]) s cross join generate_series(1,100) n",
    [sites.rows.map((site) => site.id), executor, manager],
  );
  await db.query(
    'analyze public.tasks; analyze public.construction_sites; analyze public.profiles; analyze public.task_status_events',
  );
  const queries = [
    ['tasks_page', 'select * from public.tasks order by created_at desc,id limit 20', []],
    ['tasks_count', 'select count(*) from public.tasks', []],
    [
      'sites_page',
      'select * from public.construction_sites order by created_at desc,id limit 20',
      [],
    ],
    ['sites_count', 'select count(*) from public.construction_sites', []],
    [
      'participant_names',
      'select * from public.profiles where id=any($1::uuid[])',
      [[manager, executor]],
    ],
    [
      'site_tasks',
      'select * from public.tasks where site_id=$1 order by created_at desc,id limit 20',
      [sites.rows[0].id],
    ],
  ];
  for (const [role, actor] of [
    ['manager', manager],
    ['executor', executor],
  ]) {
    await db.query('set local role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]);
    for (const [name, sql, args] of queries) {
      const result = await db.query(`explain (analyze,buffers,format json) ${sql}`, args);
      const plan = result.rows[0]['QUERY PLAN'][0];
      results.push({
        role,
        query: name,
        executionMs: plan['Execution Time'],
        planningMs: plan['Planning Time'],
        plan: plan.Plan,
      });
    }
    await db.query('reset role');
  }
} finally {
  await db.query('rollback');
  await db.query(
    'analyze public.tasks; analyze public.construction_sites; analyze public.profiles; analyze public.task_status_events',
  );
  await db.end();
}
await mkdir('.local', { recursive: true });
await writeFile(
  '.local/query-profile.json',
  JSON.stringify({ fixture: { sites: 100, tasks: 10000 }, results }, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    results.map(({ role, query, executionMs, planningMs }) => ({
      role,
      query,
      executionMs,
      planningMs,
    })),
    null,
    2,
  ),
);
