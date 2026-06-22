# Разработка

Краткий онбординг. Глубокие детали — в [`docs/`](docs/): архитектура data-слоя и
dev-окружения — [`docs/architecture.md`](docs/architecture.md); схема БД, типы,
RLS, пагинация — [`docs/database.md`](docs/database.md); план развития —
[`docs/improvement-plan.md`](docs/improvement-plan.md).

## Схема БД и миграции

- **Канон — миграции** в `supabase/migrations/`. Схему руками не правим; новое
  изменение = новая миграция (`supabase migration new <name>`, всё идемпотентно).
- Применить к remote: `supabase db push`. Сверить: `supabase migration list`.
- `supabase/schema.sql` нет — единственный источник правды это миграции
  (см. `docs/database.md` §1).

## Сгенерированные типы

```bash
npm run types:gen        # supabase gen types typescript --linked → src/lib/database.types.ts
```

Запускать после каждого `supabase db push`, результат коммитить. Клиенты
типизированы (`SupabaseClient<Database>`). Подробнее — `docs/database.md` §2.

## Локальная разработка / демо

**Канон — локальный Supabase + seed** (нужен Docker):

```bash
supabase start          # поднять локальный стек
supabase db reset        # миграции + supabase/seed.sql
# вход: demo@boardgames.local / demo1234
```

MSW-мок (`USE_MOCK=true`) — **deprecated**, заморожен (без новых хендлеров),
оставлен как офлайн-мост до валидации seed-пути. См. `docs/architecture.md` §3.

## Конвенция доступа к данным

Route handlers (`src/app/api/**/route.ts`), не Server Actions:
`createClient → auth.getUser → parseBody(zod) → lib(userId) → NextResponse.json`.
Один ресурс — один роут, HTTP-метод = операция, пакет — массивом в теле.
Валидация тел — `src/lib/api/validation.ts`; пагинация — `src/lib/pagination.ts`.
Подробнее — `docs/architecture.md` §1.

## Логирование

Структурный логгер `src/lib/logger.ts` (`logger.child(scope).info/warn/error`),
уровень из `LOG_LEVEL`. Прямые `console.*` в коде приложения не используем.

## Общие таблицы предзаказов

Таблицы `publishers`, `preorder_drafts`, `preorders` **делятся** с проектом
**`bg-preorders-scraper`** (одна БД Supabase). **Владелец миграций этих таблиц —
данный репозиторий (`bg-collection`)**; скрапер пишет/читает данные через
`service_role`, но схему не меняет. Любое изменение этих таблиц — согласовывать
со скрапером. Подробнее — `docs/database.md` §3.

## Перед коммитом

```bash
npx tsc --noEmit && npm run lint && npm run build
```
