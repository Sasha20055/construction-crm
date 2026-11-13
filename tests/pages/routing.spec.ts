import { test, expect } from '@playwright/test';
import { createBackend } from '../e2e/backend';

test('Pages bundle: prefixed assets, deep links, reloads, session and task transitions', async ({
  page,
  context,
  request,
}) => {
  const backend = await createBackend();
  await backend.install(context);
  const brokenAssets: string[] = [];
  const browserErrors: string[] = [];
  page.on('response', (response) => {
    if (response.url().startsWith('http://127.0.0.1:4173') && response.status() >= 400)
      brokenAssets.push(response.url());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  try {
    expect((await request.get('/construction-crm/tasks/any-id')).status()).toBe(404);
    await page.goto('/construction-crm/');
    await expect(page).toHaveURL(/\/construction-crm\/#\/sign-in$/);
    await page.getByLabel('Рабочий email').fill('manager@example.test');
    await page.getByLabel('Пароль', { exact: true }).fill('test-password');
    await page.getByRole('button', { name: 'Войти в систему' }).click();
    await expect(page.getByRole('heading', { name: 'Здесь строится результат' })).toBeVisible();
    const siteLink = page.getByRole('link', { name: /ЖК Северный парк/ });
    await expect(siteLink).toHaveAttribute('href', `#/sites/${backend.site.id}`);
    await siteLink.click();
    await expect(page).toHaveURL(new RegExp(`/construction-crm/#/sites/${backend.site.id}$`));
    await page.getByRole('link', { name: /Проверить армирование/ }).click();
    await expect(page).toHaveURL(new RegExp(`/#/tasks/${backend.task.id}$`));
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Проверить армирование', exact: true }),
    ).toBeVisible();
    const direct = await context.newPage();
    await direct.goto(`/construction-crm/#/tasks/${backend.task.id}`);
    await expect(
      direct.getByRole('heading', { name: 'Проверить армирование', exact: true }),
    ).toBeVisible();
    await direct.close();
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
    await expect(page).toHaveURL(/#\/sign-in$/);
    await page.getByLabel('Рабочий email').fill('executora@example.test');
    await page.getByLabel('Пароль', { exact: true }).fill('test-password');
    await page.getByRole('button', { name: 'Войти в систему' }).click();
    await expect(page.getByRole('heading', { name: 'Здесь строится результат' })).toBeVisible();
    await page.goto(`/construction-crm/#/tasks/${backend.task.id}`);
    await page.getByRole('button', { name: 'Взять в работу' }).click();
    await expect(page.getByRole('button', { name: 'Отправить на проверку' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Отправить на проверку' })).toBeVisible();
    await expect(page.locator('.timeline > li')).toHaveCount(2);
    await page.goto(`/construction-crm/#/tasks/${backend.other.id}`);
    await expect(page.getByRole('alert')).toContainText('нет к ней доступа');
    expect(brokenAssets).toEqual([]);
    expect(browserErrors).toEqual([]);
  } finally {
    await backend.close();
  }
});
