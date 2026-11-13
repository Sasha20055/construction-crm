# Стройконтроль — мини-CRM «Объекты и задачи»

React/TypeScript SPA для постановщиков и исполнителей. Объекты, задачи, строгий цикл статусов,
история и разграничение доступа проверяются PostgreSQL, включая обращения в обход интерфейса.

## Структура проекта

```text
frontend/             # React-приложение, FSD, Vite, TypeScript, UI-тесты
backend/              # схема БД, RLS, RPC, миграции, конфигурация и backend-тесты
  migrations/
  tests/
    database/         # PostgreSQL/PGlite integration
    api/              # реальные HTTP-проверки Supabase
    sql/              # pgTAP
  scripts/            # Supabase CLI, подготовка локального окружения и демоданных
tests/                # сквозные сценарии frontend + backend
scripts/              # общие проверки и запуск сквозных тестов
docs/                 # спецификация, решения и результаты проверки
```

Все npm-команды выполняются из корня; package.json и lockfile общие.
Supabase CLI требует имя каталога `supabase`, поэтому `backend/scripts/cli.mjs`
копирует входные файлы из `backend/` в служебный `.local/supabase/` и запускает CLI там.
`.local/` исключён из Git; редактировать нужно только исходники в `backend/`.
Команды CLI вызывайте через `node backend/scripts/cli.mjs <command>` либо готовые npm scripts.
Идентификатор локального проекта сохранён: перенос каталогов не сбрасывает базу.

## Быстрый запуск

Нужны Node.js 22.12+ в ветке 22 либо Node.js 24+, npm и проект Supabase.
Для локального Supabase дополнительно нужен запущенный Docker.

```bash
npm ci
cp .env.example .env.local
```

Заполните в `.env.local` только публичные настройки приложения:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY
```

Затем:

```bash
npm run dev
```

Без настроек подключения приложение покажет экран настройки. Рабочего обхода авторизации или
подмены базы демонстрационными данными в production-коде нет.

## База: локально

С запущенным Docker Desktop можно подготовить локальное окружение одной командой:

```bash
npm run setup:local
npm run dev
```

Команда запускает необходимые сервисы Supabase, применяет миграции на первом старте,
применяет новые локальные миграции, создаёт демоданные, записывает публичные настройки в `.env.local`, а случайный пароль —
в исключённый из Git `demo-credentials.json` с правами только владельцу файла.
Секретный service key передаётся скрипту только через окружение дочернего процесса.
Повторный запуск использует тот же локальный пароль и не сбрасывает данные.
Если `.env.local` указывает на другой проект, скрипт откажется его перезаписывать.
Для чистого старта с удалением локальных данных предусмотрен осознанный локальный reset.

Ручной вариант:

```bash
npm run db:start
npm run db:reset
```

CLI применяет `backend/config.toml`, миграции и отключает signup. Возьмите URL и публичный anon key
из локального Supabase и внесите в `.env.local`. Studio: `http://127.0.0.1:54323`.

`db:reset` уничтожает данные **локального** проекта и применяет миграции заново.
Не используйте reset с удалённой базой. Для обновлений добавляйте новые миграции.

## База: облачный проект

1. Создайте отдельный Supabase-проект и примените все SQL-файлы из `backend/migrations/` по порядку через SQL Editor
   либо CLI `node backend/scripts/cli.mjs link --project-ref YOUR_REF` и `node backend/scripts/cli.mjs db push`.
2. В Auth отключите **Allow new users to sign up**. Это настройка сервера Auth: миграция SQL сама её не меняет.
3. В Auth URL Configuration задайте Site URL приложения и допустимые Redirect URLs.
4. Убедитесь, что схема `private` не включена в Exposed schemas Data API.
5. Создайте пользователей через Auth → Users → Add user, с подтверждёнными email.
6. Администратором добавьте их в `public.profiles`: UUID из Auth, отображаемое имя и роль
   `manager` или `executor`. Роли пользователи себе не назначают.

Пример назначения профиля (реальный UUID подставляется администратором):

```sql
insert into public.profiles(id, display_name, role)
values ('UUID_FROM_AUTH', 'Анна Смирнова', 'manager');
```

## Демонстрационные учётки и данные

Вместо ручного заполнения можно запустить доверенный скрипт. Только в локальный, исключённый из Git
`.env.local` добавьте:

```dotenv
SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
DEMO_PASSWORD=YOUR_OWN_STRONG_PASSWORD_AT_LEAST_12_CHARACTERS
```

```bash
npm run demo:seed
```

Скрипт создаёт 3 объекта, 6 задач во всех статусах и три аккаунта:

| Email                         | Роль          |
| ----------------------------- | ------------- |
| `manager@crm.example.test`    | Постановщик   |
| `executor.a@crm.example.test` | Исполнитель A |
| `executor.b@crm.example.test` | Исполнитель B |

Пароль берётся из `DEMO_PASSWORD`, не печатается и не сохраняется скриптом.
Для существующих учёток пароль не сбрасывается; повторный запуск пропускает уже созданные задачи.
Прерванную частично выполненную демонстрационную последовательность нужно закончить через UI.
Демо-статусы выставляются разрешёнными RPC с согласованной историей.

Service role используется только вручную запускаемым серверным скриптом для создания учёток/профилей.
Не добавляйте ему префикс `VITE_`, не передавайте в настройки фронтенд-хостинга и не коммитьте `.env.local`.

## Проверки

```bash
npm run check       # TypeScript, ESLint, автоматическая проверка границ FSD
npm test            # PostgreSQL/PGlite integration + Vitest + RTL, без Docker
npm run build       # Production-сборка в frontend/dist/
npm run test:e2e    # Playwright: настоящий UI + SQL, тестовая имитация Auth/HTTP
```

По умолчанию Playwright использует установленный Google Chrome. Если его нет:

```bash
npx playwright install chromium
PLAYWRIGHT_CHANNEL=chromium npm run test:e2e
```

Браузерные сценарии проходят полный цикл с возвратом, смену трёх аккаунтов,
проверку чужой задачи, CRUD, историю и мобильный экран. Сетевой адаптер находится только в `tests/e2e`;
он не доказывает корректность GoTrue/PostgREST, поэтому есть отдельный уровень проверки реального Supabase.

С запущенным Supabase:

```bash
npm run db:test     # pgTAP: права и RLS на настоящем Supabase Postgres
```

После `npm run setup:local` прямые API-тесты можно выполнить без ручной настройки пароля:

```bash
npm run test:api:local
npm run test:postgres:local # параллельные транзакции, гонки и повторы
npm run db:profile          # EXPLAIN ANALYZE на временных данных с откатом
npm run test:ui:local  # Chrome + настоящий Auth/PostgREST, полный цикл задачи без подмен
```

Команда читает исключённый из Git файл локальных доступов и работает только с loopback URL Supabase.

Для прямых HTTP/API-тестов после создания тестовых пользователей добавьте в `.env.local`:

```dotenv
API_MANAGER_EMAIL=manager@crm.example.test
API_EXECUTOR_A_EMAIL=executor.a@crm.example.test
API_EXECUTOR_B_EMAIL=executor.b@crm.example.test
API_TEST_PASSWORD=THE_PASSWORD_YOU_CHOSE
```

```bash
npm run test:api
```

Этот набор проверяет закрытую регистрацию, RLS/вложенные данные, запрет прямой записи и две
одновременные команды одной версии (один успех, один конфликт). Создаёт свой объект и скрывает его после теста;
аудит сохраняется согласно доменным правилам. Запускайте на тестовом проекте.
Без обязательных переменных тесты явно отмечаются как skipped; это не успешная проверка реального API.

GitHub Actions содержит два job: приложение и настоящий локальный Supabase с pgTAP/API,
параллельными транзакциями, контролем актуальности типов и настоящим UI.
Локально также выполнен отдельный браузерный тест `test:ui:local` с настоящим Supabase.
Результаты локальной проверки и ограничения окружения: [verification.md](docs/verification.md).

## Архитектура

SDD: [спецификация с ID требований](docs/spec.md) → [контракты и план](docs/implementation-plan.md) → тесты → код.
Правила для последующей работы ИИ: [AGENTS.md](AGENTS.md).

Фронтенд FSD: `app → pages → features → entities → shared`. Widgets добавляются при необходимости.
API, модели и UI разделены внутри features. Слайсы экспортируют публичный API;
`frontend/scripts/check-boundaries.mjs` проверяет AST статических, динамических и type-импортов, включая относительные пути.
Серверные данные — TanStack Query, формы — React Hook Form/Zod, локальный UI — React state.
Кэш изолирован ID пользователя, очищается при смене сессии и обновляется адресно после команд.
Черновики сохраняют исходную версию до явной загрузки актуальных данных. Повтор создания с тем же ключом не дублирует запись.
Каталог исполнителей имеет серверный поиск и пагинацию, имена участников загружаются по ID отображаемых записей.
Страницы загружаются лениво.
Базовый UI использует Radix Dialog и Tailwind, с собственным компактным набором компонентов.

Backend: Auth идентифицирует пользователя; SELECT защищён RLS; узкие RPC проверяют доступ и поля;
ограничения/триггеры обеспечивают workflow и аудит. Отдельный Node-сервер для CRM не требуется.
`crm_backend` — роль без LOGIN/BYPASSRLS, без прав менять роли пользователей и изменять/удалять историю.
Все definer-функции имеют пустой `search_path`; внутренние helpers находятся вне API-схем.

Решения и ограничения: [decisions.md](docs/decisions.md). Диагностика и обслуживание: [operations.md](docs/operations.md).

## Типы схемы

```bash
npm run db:types   # из запущенного локального Supabase
```

Если Docker недоступен, исходные типы можно воспроизвести по каталогу PostgreSQL из миграции:

```bash
node backend/scripts/generate-schema-types.mjs
```

Это генерация, не ручное дублирование таблиц. Supabase CLI также добавляет типы связей для вложенных запросов.

## Развёртывание

Vercel: импортировать GitHub-репозиторий, build `npm run build`, output `frontend/dist`, Node 22.
Внести **только** `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY` в environment variables.
`vercel.json` содержит SPA fallback. Для другого статического хостинга также нужен fallback на `index.html`.
Применить миграции к облачной БД и отключить signup до передачи доступа.

Проверить вход трёх пользователей на конечном домене и выполнить API-тесты. Передать URL приложения,
GitHub, доступы и [объяснение руководителю](docs/handover.md) одним сообщением в hh.ru.
В репозитории не хранится готовый пароль для сдачи.
