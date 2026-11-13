import { test, expect, type Page } from '@playwright/test';
import { createBackend } from './backend';

async function login(page: Page, name: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Рабочий email').fill(`${name}@example.test`);
  await page.getByLabel('Пароль', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Войти в систему' }).click();
  await expect(page.getByRole('heading', { name: 'Здесь строится результат' })).toBeVisible();
}
async function logout(page: Page) {
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'С возвращением' })).toBeVisible();
}
test('full task lifecycle, role isolation, cache clearing, CRUD and audit', async ({
  page,
  context,
}) => {
  const backend = await createBackend();
  await backend.install(context);
  try {
    await login(page, 'manager');
    await page.screenshot({ path: 'test-results/desktop-overview.png', fullPage: true });
    await page.getByRole('link', { name: /ЖК Северный парк/ }).click();
    await expect(page.getByRole('link', { name: /Чужая задача B/ })).toBeVisible();
    await page.getByRole('button', { name: 'Новая задача', exact: true }).click();
    await page.getByLabel('Название задачи', { exact: true }).fill('Проверить опалубку');
    await page.getByLabel('Описание', { exact: true }).fill('Проверить геометрию и крепления.');
    await page.getByRole('combobox', { name: 'Исполнитель', exact: true }).fill('executorA');
    await page.getByRole('option', { name: 'executorA', exact: true }).click();
    await page.getByRole('button', { name: 'Создать задачу', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('link', { name: /Проверить опалубку/ })).toBeVisible();
    await logout(page);

    await login(page, 'executora');
    await page.getByRole('link', { name: 'Мои задачи', exact: true }).click();
    await expect(page.getByRole('link', { name: /Чужая задача B/ })).not.toBeVisible();
    await page.goto(`/tasks/${backend.other.id}`);
    await expect(page.getByRole('alert')).toContainText('нет к ней доступа');
    await page.goto(`/tasks/${backend.task.id}`);
    await expect(page.getByRole('button', { name: 'Изменить', exact: true })).not.toBeVisible();
    await page.getByRole('button', { name: 'Взять в работу' }).click();
    await page.getByRole('button', { name: 'Отправить на проверку' }).click();
    await expect(page.getByText('Задача ожидает проверки постановщиком.')).toBeVisible();
    await logout(page);

    await login(page, 'manager');
    await page.goto(`/tasks/${backend.task.id}`);
    await page.getByRole('button', { name: 'Вернуть на доработку', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Вернуть на доработку' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Опишите, что нужно исправить');
    await dialog.getByLabel('Что нужно доработать').fill('Устранить зазор в узле А.');
    await dialog.getByRole('button', { name: 'Вернуть на доработку' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('Устранить зазор в узле А.', { exact: true })).toBeVisible();
    await logout(page);

    await login(page, 'executora');
    await page.goto(`/tasks/${backend.task.id}`);
    await page.getByRole('button', { name: 'Взять в работу' }).click();
    await page.getByRole('button', { name: 'Отправить на проверку' }).click();
    await expect(page.getByText('Задача ожидает проверки постановщиком.')).toBeVisible();
    await logout(page);
    await login(page, 'manager');
    await page.goto(`/tasks/${backend.task.id}`);
    await page.getByRole('button', { name: 'Принять задачу' }).click();
    await expect(page.getByText('Задача завершена и принята.')).toBeVisible();
    await expect(page.locator('.timeline > li')).toHaveCount(7);
    await page.screenshot({ path: 'test-results/task-history.png', fullPage: true });
    await page.getByRole('button', { name: 'Изменить', exact: true }).click();
    await page.getByLabel('Название задачи', { exact: true }).fill('Армирование проверено');
    await page.getByRole('button', { name: 'Сохранить изменения' }).click();
    await expect(page.getByRole('heading', { name: 'Армирование проверено' })).toBeVisible();
    await logout(page);

    await login(page, 'executorb');
    await page.getByRole('link', { name: 'Мои задачи', exact: true }).click();
    await expect(page.getByRole('link', { name: /Чужая задача B/ })).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Армирование проверено|Проверить опалубку/ }),
    ).not.toBeVisible();
    await logout(page);
    await login(page, 'manager');
    await page.screenshot({ path: 'test-results/mobile-overview.png', fullPage: true });
    await page.goto(`/tasks/${backend.task.id}`);
    await page.getByRole('button', { name: 'Удалить задачу', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Удалить задачу', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'ЖК Северный парк', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /Армирование проверено/ })).not.toBeVisible();
  } finally {
    await backend.close();
  }
});

test('object CRUD, empty state, responsive navigation and input validation', async ({
  page,
  context,
}) => {
  const backend = await createBackend();
  await backend.install(context);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, 'manager');
    await page.getByRole('button', { name: 'Новый объект' }).click();
    await page.getByRole('button', { name: 'Создать объект' }).click();
    await expect(page.getByText('Введите название', { exact: true })).toBeVisible();
    await page.getByLabel('Название объекта').fill('Новый корпус');
    await page.getByLabel('Адрес', { exact: true }).fill('Казань, ул. Мира, 1');
    await page.getByRole('button', { name: 'Создать объект' }).click();
    await page.getByRole('link', { name: /Новый корпус/ }).click();
    await expect(page.getByRole('heading', { name: 'Задач пока нет' })).toBeVisible();
    await page.getByRole('button', { name: 'Изменить', exact: true }).click();
    await page.getByLabel('Название объекта').fill('Корпус 2');
    await page.getByRole('button', { name: 'Сохранить изменения' }).click();
    await expect(page.getByRole('heading', { name: 'Корпус 2', exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByRole('button', { name: 'Удалить объект', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Удалить объект', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Здесь строится результат' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Корпус 2/ })).not.toBeVisible();
  } finally {
    await backend.close();
  }
});
