# Архитектура data-слоя и dev-окружения (Фаза 3)

Зафиксированные конвенции. Новые фичи строим по ним.

## 1. Доступ к данным — Route Handlers (канон) [A-2]

Единый паттерн доступа к данным — **route handlers** в `src/app/api/**/route.ts**`
(не Server Actions). Это уже сложившийся и унифицированный в Фазах 0–2 стиль;
второй парадигмы не вводим.

Сверка с гайдом Next 16 (`node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`,
A-1): Server Actions (`'use server'`) — рабочий вариант для мутаций/форм, но они
доступны и прямым POST (auth надо проверять внутри каждой), и переход потребовал
бы передела всех роутов и клиентских вызовов без явного выигрыша после уже
сделанной унификации. Поэтому выбран route-handlers.

### Контракт роута

```
1. const supabase = await createClient();              // типизированный клиент
2. const { data: { user } } = await supabase.auth.getUser();  // один getUser на запрос
3. if (!user) → 401
4. const { data, error } = await parseBody(Schema, request);  // zod, иначе 400
   if (error) return error;
5. вызов lib-функции (collection.ts / collections.ts / friends.ts),
   userId пробрасываем аргументом (не зовём getUser повторно)
6. NextResponse.json(...)  // на ошибки lib — 4xx/5xx с { error }
```

- **Один ресурс — один роут; HTTP-метод = операция.** `/api/collection`:
  `GET` (список, с курсорной пагинацией `?cursor&limit` → `nextCursor`),
  `POST` (добавить игры), `DELETE` (удалить), `PUT` (переместить),
  `PATCH` (теги/заметка/инфо). Пакетные операции — массивом в теле, это
  по-прежнему одна операция, а не «толстый» роут. [A-3]
- Валидация тела — только через `parseBody` (`src/lib/api/validation.ts`).
- Пагинация списков — через `src/lib/pagination.ts` (см. `docs/database.md` §5).

> [A-3] «Толстый POST» из плана относился к сценарию миграции на Server Actions.
> Раз мигрируем не уходим — отдельного устранения не требуется: текущий
> `/api/collection` уже соответствует канону (метод = операция). Если когда-нибудь
> роут начнёт делать разнородные вещи в одном методе — разносить по ресурсам
> (`/api/collection/items`, `/api/collection/moves`), а не множить ветки в одном
> обработчике.

## 2. Клиентский data-слой — хук `useCollectionData` [A-4]

Загрузка данных вынесена из `CollectionApp.tsx` в переиспользуемый хук
[`src/hooks/useCollectionData.ts`](../src/hooks/useCollectionData.ts): список
коллекций, активная вкладка, игры активного вида, курсорная пагинация
(IntersectionObserver). UI-состояние (фильтры, выбор, диалоги) остаётся в
компоненте. Диалоги уже вынесены в отдельные компоненты (`AddGamesDialog`,
`MoveGameDialog`, `CollectionSettingsDialog`, `CreateCollectionDialog`,
`ConfirmDialog`), ввод — `VoiceInput`/`PhotoInput`. Так компонент перестал
«делать всё», а логика загрузки переиспользуема.

## 3. Локальное dev/demo-окружение — seed локального Supabase [A-5]

**Решение:** канон локальной разработки и демо — **`supabase start` + seed**
(`supabase/seed.sql`, подключён в `config.toml` → `[db.seed]`), а не самописный
MSW-стор.

Причина: полный MSW-мок (`src/lib/mock/store.ts`, ~580 строк) дублирует backend —
каждую фичу приходится реализовывать дважды (так в Фазах 1–2 дописывались хендлеры
`cache_game`, `collection_item_counts`). Локальный Supabase убирает это удвоение:
один и тот же код, реальные RLS/триггеры/RPC.

**Воркфлоу (нужен Docker):**

```bash
supabase start          # поднять локальный стек
supabase db reset        # применить миграции + seed.sql
# приложение: NEXT_PUBLIC_SUPABASE_URL/KEY от локального стека, USE_MOCK выкл.
# вход: demo@boardgames.local / demo1234 (см. seed.sql)
```

**Статус MSW-мока:** **deprecated (заморожен)**. Новых хендлеров под новые фичи
не добавляем. Полное удаление `src/lib/mock/store.ts` + `src/mocks/**` + флага
`USE_MOCK` — отдельным шагом ПОСЛЕ того, как seed-путь провалидирован локально
(`supabase db reset` на машине с Docker; форму вставки `auth.users`/
`auth.identities` в `seed.sql` сверить с версией GoTrue). До тех пор MSW-демо
оставлено рабочим как мост.
