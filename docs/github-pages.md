# Публикация на GitHub Pages

Репозиторий: https://github.com/Sasha20055/construction-crm.
Ожидаемый адрес после успешного deploy: https://sasha20055.github.io/construction-crm/.

## Однократная настройка GitHub

1. В Settings → Secrets and variables → Actions → Variables → Repository variables добавить:
   - `VITE_SUPABASE_URL` — HTTPS URL облачного проекта Supabase.
   - `VITE_SUPABASE_PUBLISHABLE_KEY` — публичный `sb_publishable_…` либо legacy `anon` key.
2. В Settings → Pages → Build and deployment → Source выбрать **GitHub Actions**.
3. Закоммитить изменения и отправить в `main`. Дождаться зелёного workflow **Deploy GitHub Pages**.
   При изменении только Variables повторно запустить его через Actions → Run workflow:
   переменные подставляются во время сборки.

Привилегированные ключи, пароль БД, DEMO_PASSWORD и `.env.cloud.local` в Pages не передаются.
Если Variables не заполнены или вместо публичного ключа указан секретный, deploy завершается с ошибкой.
Эти проверки не заменяют RLS: публичные переменные в собранном JavaScript видны пользователям.

## Как устроена публикация

`.github/workflows/pages.yml` запускается на push в `main` и вручную.
Проверяет конфигурацию, устанавливает зависимости, запускает проверки кода и тесты,
проверяет production Pages-сборку в Chrome, затем заново собирает приложение с публичными
переменными облачного проекта и публикует **только `frontend/dist`** официальными Actions Pages.
Шаг с тестовой сборкой использует fixture Auth/API и не меняет облачные данные.

`npm run build:pages` включает Vite mode `pages`:

- `base` равен `/construction-crm/`, включая пути JS/CSS и lazy chunks;
- приложение использует HashRouter: `/construction-crm/#/sites`, `/construction-crm/#/tasks/<id>`;
- обновление карточки и открытие прямой ссылки не требуют серверного SPA fallback;
- обычный `npm run dev` / `npm run build` сохраняют BrowserRouter и `base=/` для локального запуска/Vercel.

Если репозиторий переименован или используется корневой custom domain, изменить Pages `base`
в `frontend/vite.config.ts` и соответствующий тестовый префикс в `tests/pages/`.

## Supabase

До deploy применить миграции к облачному проекту, отключить открытую регистрацию, создать пользователей
и профили. GitHub Pages не запускает backend и не применяет миграции автоматически.

В Supabase → Authentication → URL Configuration установить Site URL:
`https://sasha20055.github.io/construction-crm/`.
При использовании email redirect-сценариев добавить нужные URL в Redirect URLs.
Текущий вход по email/password не использует перенаправление на почту.

Новые миграции применяются отдельно, явно к привязанному облачному проекту:

```bash
node backend/scripts/cli.mjs db push --linked
```

## Проверки перед публикацией

```bash
npm run check
npm test
npm run test:pages
```

`test:pages` собирает production-артефакт с тестовой конфигурацией и запускает Chrome на статическом
сервере с реальными 404, без SPA fallback. Проверяет префикс assets, переходы, прямую ссылку на задачу,
обновление страницы, восстановление сессии, выход/смену пользователя и команду изменения статуса.
Этот тест перезаписывает `frontend/dist` тестовой сборкой; deploy workflow всегда собирает артефакт
с реальными публичными Variables заново после теста.

После успешной публикации проверить вход под постановщиком и обоими исполнителями на конечном URL.
Готовность workflow локально не означает, что сайт уже опубликован: конечный результат — успешный deploy
в GitHub Actions и доступный сайт.
