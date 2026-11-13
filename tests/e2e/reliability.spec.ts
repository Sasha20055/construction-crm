import { test, expect, type Page } from '@playwright/test';
import { createBackend } from './backend';
import { users } from '../../backend/tests/database/helpers';
async function login(page: Page) {
  await page.goto('/sign-in');
  await page.getByLabel('Рабочий email').fill('manager@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Войти в систему' }).click();
  await expect(page.getByRole('heading', { name: 'Здесь строится результат' })).toBeVisible();
}
test('task and site drafts keep their base versions until explicit reload', async ({
  page,
  context,
}) => {
  const backend = await createBackend();
  await backend.install(context);
  try {
    await login(page);
    await page.goto(`/tasks/${backend.task.id}`);
    await page.getByRole('button', { name: 'Изменить', exact: true }).click();
    await page.getByLabel('Название задачи', { exact: true }).fill('Local title');
    await backend.query(
      users.managerB,
      "select * from public.update_task($1,1,$2,'External title','Important external description',$3)",
      [backend.task.id, backend.site.id, users.executorA],
    );
    await page.getByRole('button', { name: 'Сохранить изменения' }).click();
    await expect(page.getByRole('alert')).toContainText('Задача изменена');
    await expect(page.getByRole('button', { name: 'Сохранить изменения' })).toBeDisabled();
    await expect(page.getByLabel('Описание', { exact: true })).toHaveValue(
      'Проверить узлы перед заливкой бетона.',
    );
    expect(
      (
        await backend.query<{ description: string }>(
          users.manager,
          'select description from public.tasks where id=$1',
          [backend.task.id],
        )
      )[0].description,
    ).toBe('Important external description');
    await page.getByRole('button', { name: 'Загрузить актуальные данные' }).click();
    await expect(page.getByLabel('Описание', { exact: true })).toHaveValue(
      'Important external description',
    );
    await page.getByLabel('Название задачи', { exact: true }).fill('Resolved title');
    await page.getByRole('button', { name: 'Сохранить изменения' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(
      (
        await backend.query<{ description: string }>(
          users.manager,
          'select description from public.tasks where id=$1',
          [backend.task.id],
        )
      )[0].description,
    ).toBe('Important external description');
    await page.goto(`/sites/${backend.site.id}`);
    await page.getByRole('button', { name: 'Изменить', exact: true }).click();
    await page.getByLabel('Название объекта').fill('Local site');
    await backend.query(
      users.managerB,
      "select public.update_site($1,1,'External site','External address')",
      [backend.site.id],
    );
    await page.getByRole('button', { name: 'Сохранить изменения' }).click();
    await expect(page.getByRole('button', { name: 'Сохранить изменения' })).toBeDisabled();
    await page.getByRole('button', { name: 'Загрузить актуальные данные' }).click();
    await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('External address');
    await page.getByLabel('Название объекта').fill('Resolved site');
    await page.getByRole('button', { name: 'Сохранить изменения' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(
      (
        await backend.query<{ address: string }>(
          users.manager,
          'select address from public.construction_sites where id=$1',
          [backend.site.id],
        )
      )[0].address,
    ).toBe('External address');
  } finally {
    await backend.close();
  }
});
test('a disappearing last page recovers after invalidation', async ({ page, context }) => {
  const backend = await createBackend();
  await backend.install(context);
  try {
    const added = await backend.query<{ id: string; version: number }>(
      users.manager,
      "select s.* from generate_series(1,20) n cross join lateral public.create_site('Site ' || n,'Address') s",
    );
    await login(page);
    await page.getByRole('button', { name: 'Следующая страница' }).click();
    await expect(page.locator('.site-card')).toHaveCount(1);
    for (const site of added.slice(0, 2))
      await backend.query(users.manager, 'select public.delete_site($1,$2)', [
        site.id,
        site.version,
      ]);
    await page.getByRole('button', { name: 'Новый объект', exact: true }).click();
    await page.getByLabel('Название объекта').fill('Replacement site');
    await page.getByLabel('Адрес', { exact: true }).fill('Address');
    await page.getByRole('button', { name: 'Создать объект' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.locator('.site-card')).toHaveCount(20);
    await expect(page.getByRole('button', { name: 'Следующая страница' })).not.toBeVisible();
  } finally {
    await backend.close();
  }
});
test('executor search reaches beyond the API row cap and names load by ID', async ({
  page,
  context,
}) => {
  const backend = await createBackend();
  await backend.provisionExecutors(1005);
  await backend.install(context);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await page.goto(`/sites/${backend.site.id}`);
    await expect(page.getByRole('link', { name: /Проверить армирование/ })).toContainText(
      'executorA',
    );
    await page.getByRole('button', { name: 'Новая задача', exact: true }).click();
    const assignee = page.getByRole('combobox', { name: 'Исполнитель', exact: true });
    await expect(page.getByLabel('Поиск исполнителя')).toHaveCount(0);
    await assignee.click();
    await page
      .getByRole('navigation', { name: 'Исполнители' })
      .getByRole('button', { name: 'Следующая страница' })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Введите название', { exact: true })).not.toBeVisible();
    await assignee.fill('executorB');
    await expect(page.getByRole('option', { name: 'executorB', exact: true })).toBeVisible();
    await page.screenshot({ path: '/tmp/crm-executor-picker-mobile.png' });
    await assignee.press('ArrowDown');
    await assignee.press('Enter');
    await expect(assignee).toHaveValue('executorB');
    await assignee.fill('Nobody matches this name');
    await expect(page.getByRole('status')).toHaveText('Никого не найдено');
    await assignee.press('Escape');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(assignee).toHaveValue('executorB');
    await page.getByLabel('Название задачи', { exact: true }).fill('Search result task');
    await page.getByRole('button', { name: 'Создать задачу' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('link', { name: /Search result task/ })).toContainText('executorB');
    await page.getByRole('link', { name: /Search result task/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Search result task', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Изменить', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(assignee).toHaveValue('executorB');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: '/tmp/crm-executor-picker-desktop.png' });
  } finally {
    await backend.close();
  }
});
test('retrying a create after a lost response does not duplicate the record', async ({
  page,
  context,
}) => {
  const backend = await createBackend();
  await backend.install(context);
  try {
    await login(page);
    let dropped = false;
    await page.route('**/rest/v1/rpc/create_site', async (route) => {
      if (dropped) return route.fallback();
      dropped = true;
      const payload = route.request().postDataJSON();
      await backend.query(users.manager, 'select public.create_site($1,$2,$3)', [
        payload.p_name,
        payload.p_address,
        payload.p_request_id,
      ]);
      await route.abort('failed');
    });
    await page.getByRole('button', { name: 'Новый объект', exact: true }).click();
    await page.getByLabel('Название объекта').fill('Retry site');
    await page.getByLabel('Адрес', { exact: true }).fill('Address');
    await page.getByRole('button', { name: 'Создать объект' }).click();
    await expect(page.getByRole('alert')).toContainText('Не удалось выполнить запрос');
    await page.getByRole('button', { name: 'Создать объект' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(
      await backend.query(
        users.manager,
        "select id from public.construction_sites where name='Retry site'",
      ),
    ).toHaveLength(1);
  } finally {
    await backend.close();
  }
});
