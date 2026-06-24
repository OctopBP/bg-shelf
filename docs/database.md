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

## 4. Модель безопасности (RLS / привилегии)

Сводка решений Фазы 1 (миграция `20260622150000_phase1_security.sql`).

### Каталог игр — запись только админу

`games`, `game_names`, `contributors`, `game_contributors`, `game_links` — общий
справочник: **SELECT** открыт всем `authenticated`, а **INSERT/UPDATE/DELETE**
разрешены только `is_admin(auth.uid())` (и `service_role`, который обходит RLS —
им пользуются импорт-скрипт и скрапер). Это закрывает вандализм каталога.

Обычный пользователь пополняет кэш игр при добавлении в коллекцию не прямой
записью в `games`, а через `SECURITY DEFINER` функцию **`cache_game(...)`**. Она
**только вставляет** отсутствующую игру и `on conflict (bgg_id) do nothing` —
никогда не перезаписывает уже существующую запись, поэтому прямой вызов RPC с
произвольными полями не может испортить каталог. Источник правды значений —
серверный fetch из BGG (`addGameToCollection`).

> Следствие: ручная правка общих полей игры (`updateGameInfo` → `games.update`)
> теперь работает только у админа. Для обычных пользователей такой запрос
> отклонит RLS. Если нужно дать пользователям свои правки — это отдельная фича
> (per-collection override), а не запись в общий каталог.

### profiles — скрыта роль, закрыта эскалация привилегий

Колонка `profiles.role` (`user` | `admin`) **не видна** обычным пользователям, и
менять её через API нельзя. RLS не ограничивает колонки, поэтому используются
колоночные привилегии:

- `grant select (id, username)` — читать можно только id и ник;
- `grant update (username)` — обновлять можно только ник.

Это закрывает дыру: прежняя политика «users update own profile» (`for update
using id = auth.uid()`) разрешала менять **любую** колонку своей строки, включая
`role` → пользователь мог сам стать админом. `is_admin()` — `SECURITY DEFINER`,
поэтому продолжает читать `role` в обход грантов. Назначение админа — только
через SQL / service role.

### Публичность предзаказов — намеренная

Политики `preorders read published` и `publishers read` заданы **без**
`to authenticated`, т.е. каталог предзаказов и справочник издателей читает любой,
включая анонима. Это осознанное решение (публичный каталог), зафиксировано в
комментариях к политикам (`comment on policy …`) и здесь. Черновики
(`preorder_drafts`) и любые записи в этот домен — только админ/`service_role`.

## 5. Производительность списков (Фаза 2)

### Счётчики игр — на стороне БД

Число игр в коллекции считает вью `collection_item_counts`
(миграция `20260622160000`, `security_invoker = on` — RLS `collection_items`
применяется к вызывающему). `listCollections` / `listCollectionsByOwner` берут
счётчики из неё, а не выбирают все строки `collection_items` ради подсчёта в JS.

### Курсорная пагинация

Списки игр (`listCollection`, `listAllGames`) пагинируются курсором — парой
`(added_at, id)` при сортировке `added_at desc, id desc`. Помощник —
`src/lib/pagination.ts` (`encodeCursor`/`decodeCursor`/`clampLimit`, `Page<T>`,
`DEFAULT_PAGE_SIZE = 60`, `MAX_PAGE_SIZE = 200`). Это контракт для всех будущих
списков (лента, предзаказы) — закладывать пагинацию с первого дня.

### `config.toml` → `max_rows = 1000`

Оставлен как есть и это безопасно: счётчики агрегируются в БД (строк ≤ числа
коллекций), списки игр идут страницами (≤ `MAX_PAGE_SIZE + 1` строк на запрос),
agent читает ≤ 200. Ни один запрос не приближается к 1000, поэтому тихого
обрезания нет. Любой новый «широкий» список обязан пагинироваться.

### Бюджет LLM-пайплайна

- Разбор намерения (`resolve.ts parseAddCommand`) — `claude-haiku-4-5`
  (классификация + структурированный выход).
- Agent-цикл (`agent.ts`) — `claude-opus-4-8`, но удешевлён: `effort = "low"`,
  не более `MAX_ITERATIONS = 8` обращений к модели; `maxDuration = 120с` на
  роуте — это верхний предел стоимости/времени одной команды. Путь добавления игр
  идёт мимо агента (`parseAddCommand` → предложение), так что агент обычно делает
  1–3 шага.

## 6. Идентичность игр: всё на наш `games.id` (Фазы A–C)

Миграции `20260623120000` (A), `20260623130000` (B), `20260623140000` (C).
Подробное ревью и план — `docs/db-review.md`.

### Главное правило

**Любая связь с игрой ссылается на наш `games.id` (bigint), а не на `bgg_id`.**
Внешние идентификаторы (BGG и будущие источники) живут в `game_external_ids`.
Новых FK на `bgg_id` не заводим.

- `collection_items.game_id → games.id` (было `bgg_id`). Уникальность записи —
  `(collection_id, game_id)`. Это открыло игры из не-BGG источников (у них
  `bgg_id IS NULL`) — раньше их нельзя было положить в коллекцию.
- `games.bgg_id` **остаётся** как denormalized-зеркало: нужен для ссылки
  «открыть на BGG» и для дедупа в `cache_game` (`on conflict (bgg_id)`). Это не
  ключ связей. Канон внешних id — `game_external_ids` (заполняется и `cache_game`,
  и seed).
- `cache_game(...)` возвращает строку `games` (с `id`); вызывающий код привязывает
  `collection_items.game_id` по нему, не зная внутренний id заранее.

### Контракт приложения

- `CollectionGame.gameId` (= `games.id`) — идентичность записи: URL `/game/[id]`,
  удаление/перемещение/теги. `CollectionGame.bggId` (`number | null`) — только для
  ссылки на BGG.
- API `/api/collection`: `DELETE`/`PUT`/`PATCH` оперируют `gameId`; `POST`
  (добавление новой игры из BGG) принимает `bggId` — это путь открытия игры из
  BGG. Добавление не-BGG игр по `gameId` — отдельная будущая фича.
- Агент: `list_collection` отдаёт `game_id`; `remove`/`set_tags` — по `game_id`;
  `add_to_collection` — по `bgg_id` (поиск идёт через BGG).

### Дополнения: `game_links` + `is_expansion` (миграция 20260624120000)

- `games.is_expansion` и `game_links` (`from`=дополнение, `to`=база,
  `link_type='expansion'`) заведены ещё в `20260622120000`, но до
  `20260624120000` не заполнялись. Теперь:
  - `cache_game` принимает `p_is_expansion` (проставляется при ВСТАВКЕ);
  - `link_expansion(from, to)` — SECURITY DEFINER, обычный пользователь создаёт
    связь в обход RLS (как `cache_game` пополняет `games`).
- При добавлении дополнения `addGameToCollection` кэширует его базовые игры (для
  обложки/названия, в т.ч. ч/б у «осиротевших») и создаёт связи.
- Чтение для UI: `getCollectionExpansionMap(supabase, collectionIds)` строит карту
  `byBase` / `expansionToBase` по всей коллекции (без пагинации) — главный экран
  группирует дополнения под базой, страница игры показывает список дополнений.
- Бэкфилл уже добавленных игр (флаг `is_expansion` существующих строк cache_game
  не обновляет): `npx tsx --env-file=.env.local scripts/backfill-expansions.ts`
  (нужен `SUPABASE_SERVICE_ROLE_KEY`). Идемпотентен.

### Разгрузка god-table `games`

- BGG-метрики (`rank`, `bayes_average`, `average`, `users_rated`,
  `subcategory_ranks`, `best/recommended_players`) вынесены в `game_bgg_stats`
  (1:1 с игрой, обновляются отдельно; у не-BGG игр строки просто нет).
  `rating`/`weight` оставлены на `games` как отображаемые поля (их читает UI).
- `contributors`: убран дублирующий `kind` (тип вклада только в
  `game_contributors.role`), уникальность по имени, внешние id в
  `contributor_external_ids`.
- `preorders.game_id` (nullable) — связь предзаказа с карточкой игры (матчинг —
  будущая фича). `games.created_at`/`slug` добавлены (роутинг пока по `id`).

### Осознанно отложено (см. `docs/db-review.md`)

- **B1** — дубль имени `games.name` vs `game_names`. Сейчас: `games.name` —
  отображаемое имя (источник правды для UI), `game_names` — поисковый индекс
  (заполнит будущий импортёр). Нормализация позже, чтобы не ломать `games(*)`-join.
- **B2** — нормализация таксономии `categories`/`mechanics`/`families` (`text[]`)
  в `tags`/`game_tags`. Отложено: ломает `games(*)`-join, низкая сейчас отдача.
- **M-4** — `contributors(publisher)` vs таблица `publishers` (предзаказы) —
  потенциальный дубль «издателя»; решение при матчинге предзаказов↔игр.
