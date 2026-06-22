# База данных: схема, типы, общие таблицы

Короткий свод правил работы со схемой Postgres/Supabase. Подробный план развития —
в [improvement-plan.md](improvement-plan.md) (Фаза 0).

## 1. Единственный источник правды — миграции

Канон схемы — файлы в `supabase/migrations/`. Они применяются к remote через:

```bash
supabase db push          # применить новые миграции к слинкованному проекту
supabase migration list   # сверить локальные и remote миграции
```

Новую таблицу/колонку/политику добавляем **только новой миграцией**
(`supabase migration new <name>`), а не правкой существующих файлов. Миграции
идемпотентны (`create ... if not exists`, `create or replace`), чтобы повторный
прогон был безопасен.

### Почему нет `supabase/schema.sql`

Раньше в репозитории лежал руками поддерживаемый `supabase/schema.sql` —
второй DDL, который расходился с миграциями. Он удалён: один источник правды =
миграции. Если нужен цельный снимок схемы для чтения, его можно сгенерировать
(требует Docker для локального `pg_dump`):

```bash
supabase db dump --linked --schema public -f supabase/schema.snapshot.sql
```

Такой снимок — read-only артефакт, его нельзя править руками.

## 2. Сгенерированные TypeScript-типы

Типы строк/Insert/Update генерируются из remote-схемы и лежат в
[`src/lib/database.types.ts`](../src/lib/database.types.ts). Регенерация:

```bash
npm run types:gen
```

(под капотом `supabase gen types typescript --linked --schema public`). Команда
работает без Docker — использует Management API. Запускай её после каждого
`supabase db push`, чтобы типы не отставали от схемы, и коммить результат.

Клиенты типизированы: `createClient()` в
[`src/lib/supabase/server.ts`](../src/lib/supabase/server.ts) и
[`src/lib/supabase/client.ts`](../src/lib/supabase/client.ts) возвращают
`SupabaseClient<Database>`, поэтому запросы проверяются на этапе компиляции.
Ручные касты (`as Record<string, unknown>`, `mapRow`) в data-слое
убираем постепенно по мере прохода типов.

## 3. Общие таблицы домена предзаказов

Таблицы `publishers`, `preorder_drafts`, `preorders` (миграция
`20260622140000_preorders_domain.sql`, тип `draft_status`) **делятся** с проектом
**`bg-preorders-scraper`** — оба приложения смотрят в одну БД Supabase.

- **Владелец миграций этих таблиц — данный репозиторий (`bg-collection`).**
  Все DDL-изменения publishers/preorder_drafts/preorders делаются миграцией
  здесь и применяются через `supabase db push`. Скрапер только читает/пишет
  данные, но не меняет схему.
- Ключ `publishers.slug` совпадает с ключом издателя в скрапере — не переименовывать
  без согласования.
- `preorder_drafts.source_url` уникален (upsert при повторном прогоне скрапера).
- Эти таблицы зависят от `is_admin()` из `20260622130000_admin_role.sql` —
  миграцию предзаказов нельзя применять раньше неё.

При изменении любой из общих таблиц — предупреждать поддерживающего
`bg-preorders-scraper`, чтобы не было конфликтов schema drift между проектами.
