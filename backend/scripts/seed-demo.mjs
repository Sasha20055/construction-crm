// Trusted, explicitly invoked provisioning script. Never imported by Vite.
import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.DEMO_PASSWORD;
if (!url || !serviceKey || !publicKey || !password || password.length < 12) {
  console.error(
    'Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_PUBLISHABLE_KEY and DEMO_PASSWORD (12+ chars) in the ignored .env.local.',
  );
  process.exit(1);
}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, options);
const accounts = [
  { email: 'manager@crm.example.test', name: 'Анна Смирнова', role: 'manager' },
  { email: 'executor.a@crm.example.test', name: 'Иван Петров', role: 'executor' },
  { email: 'executor.b@crm.example.test', name: 'Алексей Волков', role: 'executor' },
];
function checked({ data, error }) {
  if (error) throw error;
  return data;
}
async function rpc(client, name, args) {
  const data = checked(await client.rpc(name, args));
  return Array.isArray(data) ? data[0] : data;
}
const existingUsers = [];
for (let page = 1; ; page++) {
  const result = checked(await admin.auth.admin.listUsers({ page, perPage: 200 }));
  existingUsers.push(...result.users);
  if (result.users.length < 200) break;
}
try {
  for (const account of accounts) {
    let user = existingUsers.find((u) => u.email === account.email);
    if (!user)
      user = checked(
        await admin.auth.admin.createUser({ email: account.email, password, email_confirm: true }),
      ).user;
    account.id = user.id;
    checked(
      await admin
        .from('profiles')
        .upsert({ id: user.id, display_name: account.name, role: account.role }),
    );
    account.client = createClient(url, publicKey, options);
    // Existing accounts are never silently reset. Use their original password or a fresh project.
    checked(await account.client.auth.signInWithPassword({ email: account.email, password }));
  }
  const [manager, a, b] = accounts;
  const siteDefs = [
    ['ЖК Северный парк', 'Москва, ул. Строителей, 12'],
    ['Бизнес-центр Горизонт', 'Москва, проспект Мира, 48'],
    ['Школа на Лесной', 'Химки, ул. Лесная, 7'],
  ];
  const sites = [];
  for (const [name, address] of siteDefs) {
    const existing = checked(
      await manager.client.from('construction_sites').select('*').eq('name', name).limit(1),
    );
    sites.push(
      existing[0] ??
        (await rpc(manager.client, 'create_site', { p_name: name, p_address: address })),
    );
  }
  const definitions = [
    [0, 'Проверить армирование перекрытия', a, 'new'],
    [0, 'Согласовать узлы примыкания', b, 'in_progress'],
    [1, 'Проверить геометрию опалубки', a, 'in_review'],
    [1, 'Принять гидроизоляцию фундамента', b, 'accepted'],
    [2, 'Устранить замечания по кладке', a, 'rework'],
    [2, 'Подготовить исполнительную схему', b, 'new'],
  ];
  for (const [siteIndex, title, assignee, target] of definitions) {
    const site = sites[siteIndex];
    const existing = checked(
      await manager.client
        .from('tasks')
        .select('id')
        .eq('site_id', site.id)
        .eq('title', title)
        .limit(1),
    );
    if (existing.length) continue;
    let task = await rpc(manager.client, 'create_task', {
      p_site_id: site.id,
      p_title: title,
      p_description:
        'Проверить качество работ и соответствие проектной документации. Результат передать постановщику на проверку.',
      p_assignee_id: assignee.id,
    });
    const steps =
      target === 'new'
        ? []
        : target === 'in_progress'
          ? ['in_progress']
          : target === 'in_review'
            ? ['in_progress', 'in_review']
            : ['in_progress', 'in_review', target];
    for (const status of steps) {
      task = await rpc(
        ['accepted', 'rework'].includes(status) ? manager.client : assignee.client,
        'transition_task',
        {
          p_id: task.id,
          p_expected_version: task.version,
          p_target_status: status,
          p_comment:
            status === 'rework'
              ? 'Устранить зазоры в примыканиях и повторно проверить уровень.'
              : null,
        },
      );
    }
  }
  console.log('Demo ready: 3 sites, 6 tasks, 1 manager and 2 executors.');
  console.log(accounts.map((a) => `${a.role}: ${a.email}`).join('\n'));
  console.log('Password was read from DEMO_PASSWORD and is not printed or stored by this script.');
} catch (error) {
  console.error(
    'Demo setup failed:',
    typeof error?.message === 'string' ? error.message : 'Supabase request failed',
  );
  process.exitCode = 1;
} finally {
  await Promise.all(
    accounts.filter((a) => a.client).map((a) => a.client.auth.signOut({ scope: 'local' })),
  );
}
