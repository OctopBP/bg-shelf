# 🎲 Коллекция настольных игр

Трекер коллекции настолок с тремя способами добавления игр:

- **Текстовая команда** — «добавь Каркассон и Манчкин, пометь Манчкин как пати»
- **Голосовая команда** — то же самое голосом (Web Speech API, русский язык)
- **Фото** — снимите полку с играми, Claude распознает названия и предложит совпадения из BGG

Данные об играх (рейтинг, число игроков, время партии, обложки) подтягиваются из [BoardGameGeek XML API2](https://boardgamegeek.com/wiki/page/BGG_XML_API2). Команды разбирает Claude (`claude-opus-4-8`) — агент сам ищет игру в BGG (включая перевод русских названий в оригинальные), добавляет её и проставляет теги.

## Стек

- **Next.js 15** (App Router, TypeScript, Tailwind)
- **Supabase** — аутентификация и Postgres
- **Anthropic Claude API** — разбор команд (tool use) и распознавание фото (vision + structured outputs)

## Установка

### 1. Supabase

1. Создайте проект на [supabase.com](https://supabase.com)
2. Примените схему миграциями (канон — `supabase/migrations/`, схему руками не правим):
   ```bash
   supabase link --project-ref <ваш-project-ref>
   supabase db push
   ```
   Подробнее о схеме, генерации типов (`npm run types:gen`) и общих таблицах
   предзаказов — в [`docs/database.md`](docs/database.md).
3. Скопируйте `Project URL` и `anon key` из **Project Settings → API**

> По умолчанию Supabase требует подтверждение email при регистрации. Для локальной разработки можно отключить: **Authentication → Providers → Email → Confirm email — off**.

### 2. Переменные окружения

```bash
cp .env.example .env.local
```

Заполните:

| Переменная | Откуда |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | там же |
| `ANTHROPIC_API_KEY` | [platform.claude.com](https://platform.claude.com) |
| `BGG_API_TOKEN` | [boardgamegeek.com/using_the_xml_api](https://boardgamegeek.com/using_the_xml_api) — нужно зарегистрировать приложение |

### 3. Запуск

```bash
npm install
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000), зарегистрируйтесь и пользуйтесь.

## Демо-режим (запуск вообще без бэкенда)

Чтобы запустить приложение полностью офлайн — **без Supabase и без ключей** — включите один флаг в `.env.local`:

```bash
NEXT_PUBLIC_MOCK=1
```

Тогда:

- **Вход без аккаунта** — на странице входа появляется кнопка «Войти в демо-режим» (или введите любой email/пароль). Сессия хранится в cookie `demo_session`.
- **Коллекция в памяти** — предзаполнена несколькими играми; добавление/удаление/теги работают и сохраняются на время работы сервера (`src/lib/mock/store.ts`).
- Автоматически включаются и моки BGG/Anthropic (см. ниже).

Один флаг `NEXT_PUBLIC_MOCK` доступен и на клиенте, и на сервере, поэтому управляет всеми слоями сразу.

## Точечный мок-режим (реальный вход, но без трат токенов)

Если нужен настоящий Supabase-вход, но без BGG-токена и трат Anthropic, включите моки сервисов отдельно:

```bash
BGG_MOCK=1        # searchBgg/getBggGameDetails отдают данные из src/lib/bgg.mock.ts
ANTHROPIC_MOCK=1  # команды и фото обрабатываются без вызова Claude
```

- **BGG-мок** — фиксированный набор популярных игр (Carcassonne, CATAN, Munchkin, Pandemic, Ticket to Ride, Codenames, 7 Wonders, Dixit) с настоящими BGG id, поэтому флаги можно включать независимо.
- **Anthropic-мок команды** — правило-ориентированный парсер (`src/lib/agent.mock.ts`): понимает «добавь / удали / пометь … как …» для игр из мок-датасета. Ответы помечены префиксом `[мок]`.
- **Anthropic-мок фото** — `src/lib/photo.mock.ts` делает вид, что на фото Carcassonne и CATAN.

Флаги читаются на сервере → после их изменения **перезапустите `npm run dev`**. Выключите (`0`), когда появятся реальные ключи.

## Как это работает

### Голос / текст → `/api/command`

Транскрипт (Web Speech API, `ru-RU`) уходит на сервер, где Claude в агентном цикле использует инструменты:

- `search_bgg` — поиск в BGG (агент сам переводит «каркасон» → «Carcassonne»)
- `add_to_collection` / `remove_from_collection` / `set_tags` / `list_collection`

Данные игры кэшируются в таблице `games`, запись пользователя — в `collection_items` (с RLS: каждый видит только свою коллекцию).

### Фото → `/api/photo`

Claude (vision) возвращает структурированный список распознанных названий, сервер ищет каждое в BGG и возвращает кандидатов. Пользователь подтверждает выбор в модальном окне — подтверждённые игры добавляются через `/api/collection`.

## Ограничения

- Голосовой ввод работает в браузерах с Web Speech API (Chrome, Safari, Edge; в Firefox кнопка микрофона скрывается).
- BGG API иногда отвечает медленно (статус 202 «готовлю ответ») — клиент повторяет запрос автоматически.
- **BGG требует регистрацию приложения** (с 2025 года XML API отдаёт 401 без Bearer-токена). Заполните форму на [boardgamegeek.com/using_the_xml_api](https://boardgamegeek.com/using_the_xml_api), дождитесь одобрения и положите токен в `BGG_API_TOKEN`.
