import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

test('real Supabase: login, create task, execute, return, accept and isolate another executor', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const credentials = (
    process.env.API_TEST_PASSWORD
      ? {
          accounts: [
            process.env.API_MANAGER_EMAIL,
            process.env.API_EXECUTOR_A_EMAIL,
            process.env.API_EXECUTOR_B_EMAIL,
          ],
          password: process.env.API_TEST_PASSWORD,
        }
      : JSON.parse(await readFile('demo-credentials.json', 'utf8'))
  ) as {
    accounts: string[];
    password: string;
  };
  const client = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const auth = await client.auth.signInWithPassword({
    email: credentials.accounts[0],
    password: credentials.password,
  });
  expect(auth.error).toBeNull();
  const siteName = `Проверка интерфейса ${Date.now()}`;
  let siteId: string | undefined;
  async function login(account: number) {
    await page.goto('/sign-in');
    await page.getByLabel('Рабочий email').fill(credentials.accounts[account]);
    await page.getByLabel('Пароль', { exact: true }).fill(credentials.password);
    await page.getByRole('button', { name: 'Войти в систему' }).click();
    await expect(page.getByRole('heading', { name: 'Здесь строится результат' })).toBeVisible();
  }
  async function logout(current: Page) {
    await current.getByRole('button', { name: 'Выйти', exact: true }).click();
    await expect(current.getByRole('heading', { name: 'С возвращением' })).toBeVisible();
  }
  try {
    await login(0);
    await page.screenshot({ path: 'test-results/live-desktop.png', fullPage: true });
    await page.getByRole('button', { name: 'Новый объект', exact: true }).click();
    await page.getByLabel('Название объекта').fill(siteName);
    await page.getByLabel('Адрес', { exact: true }).fill('Москва, Тестовая, 1');
    await page.getByRole('button', { name: 'Создать объект' }).click();
    await page.getByRole('link', { name: new RegExp(siteName) }).click();
    siteId = new URL(page.url()).pathname.split('/').at(-1);
    await page.getByRole('button', { name: 'Новая задача', exact: true }).click();
    await page.getByLabel('Название задачи', { exact: true }).fill('Проверить монолитные работы');
    await page.getByLabel('Описание', { exact: true }).fill('Сквозной тест на настоящем Supabase.');
    await page.getByRole('combobox', { name: 'Исполнитель', exact: true }).fill('Иван');
    await page.getByRole('option', { name: 'Иван Петров', exact: true }).click();
    await page.getByRole('button', { name: 'Создать задачу', exact: true }).click();
    await page.getByRole('link', { name: /Проверить монолитные работы/ }).click();
    const taskPath = new URL(page.url()).pathname;
    await logout(page);
    await login(1);
    await page.goto(taskPath);
    await page.getByRole('button', { name: 'Взять в работу' }).click();
    await page.getByRole('button', { name: 'Отправить на проверку' }).click();
    await expect(page.getByText('Задача ожидает проверки постановщиком.')).toBeVisible();
    await logout(page);
    await login(0);
    await page.goto(taskPath);
    await page.getByRole('button', { name: 'Вернуть на доработку', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByLabel('Что нужно доработать')
      .fill('Проверить отметки повторно.');
    await page.getByRole('dialog').getByRole('button', { name: 'Вернуть на доработку' }).click();
    await expect(page.getByText('Проверить отметки повторно.', { exact: true })).toBeVisible();
    await logout(page);
    await login(1);
    await page.goto(taskPath);
    await page.getByRole('button', { name: 'Взять в работу' }).click();
    await page.getByRole('button', { name: 'Отправить на проверку' }).click();
    await expect(page.getByText('Задача ожидает проверки постановщиком.')).toBeVisible();
    await logout(page);
    await login(0);
    await page.goto(taskPath);
    await page.getByRole('button', { name: 'Принять задачу' }).click();
    await expect(page.getByText('Задача завершена и принята.')).toBeVisible();
    await expect(page.locator('.timeline > li')).toHaveCount(7);
    await page.screenshot({ path: 'test-results/live-task.png', fullPage: true });
    await logout(page);
    await login(2);
    await page.goto(taskPath);
    await expect(page.getByRole('alert')).toContainText('нет к ней доступа');
  } finally {
    if (siteId) {
      const site = await client
        .from('construction_sites')
        .select('version')
        .eq('id', siteId)
        .single();
      if (site.data) {
        const deleted = await client.rpc('delete_site', {
          p_id: siteId,
          p_expected_version: site.data.version,
        });
        expect(deleted.error).toBeNull();
      }
    }
    await client.auth.signOut({ scope: 'local' });
  }
});
