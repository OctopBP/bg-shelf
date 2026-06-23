-- ===========================================================================
-- Seed для ЛОКАЛЬНОЙ разработки (A-5). Применяется при `supabase db reset` /
-- `supabase start` ПОСЛЕ миграций (см. config.toml → [db.seed]).
-- ===========================================================================
-- ВАЖНО: это локальный seed, НЕ для прода. Требует запущенного локального стека
-- (Docker). В этом окружении Docker недоступен, поэтому файл ПОДГОТОВЛЕН, но не
-- прогонялся — провалидируй `supabase db reset` на машине с Docker и поправь
-- форму вставки auth.users/auth.identities, если версия GoTrue её изменит.
--
-- Идемпотентно (on conflict do nothing): db reset и так пересоздаёт БД, но так
-- повторный прогон безопасен.

-- --- 1. Демо-пользователь ---------------------------------------------------
-- Вставка в auth.users включает триггер handle_new_user, который сам создаёт
-- profile + дефолтную коллекцию «Моя коллекция» + membership(owner). Поэтому
-- коллекцию здесь руками НЕ создаём.
-- Токеновые колонки (confirmation_token и т.п.) ДОЛЖНЫ быть '' , не NULL:
-- GoTrue читает их в Go-строку и падает на NULL («converting NULL to string
-- is unsupported»). Поэтому задаём пустые строки явно.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated',
  'demo@boardgames.local',
  crypt('demo1234', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{}',
  '', '', '', '', '', '', '', ''
)
on conflict (id) do nothing;

-- Identity для входа по email (требуется свежими версиями GoTrue).
insert into auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
values (
  gen_random_uuid(),
  '11111111-1111-1111-1111-111111111111',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"demo@boardgames.local"}',
  'email', '11111111-1111-1111-1111-111111111111',
  now(), now(), now()
)
on conflict do nothing;

-- --- 2. Кэш игр (games) -----------------------------------------------------
insert into public.games (bgg_id, name, year_published, min_players, max_players, playing_time)
values
  (822,   'Каркассон',        2000, 2, 5, 45),
  (13,    'CATAN',            1995, 3, 4, 90),
  (1927,  'Манчкин',          2001, 3, 6, 90),
  (30549, 'Пандемия',         2008, 2, 4, 45),
  (9209,  'Билет на поезд',   2004, 2, 5, 60)
on conflict (bgg_id) do nothing;

-- --- 3. Игры в дефолтной коллекции демо-пользователя ------------------------
-- Коллекцию по умолчанию создал триггер; находим её по owner_id + is_default.
insert into public.collection_items (collection_id, bgg_id, tags, added_by)
select
  (select id from public.collections
     where owner_id = '11111111-1111-1111-1111-111111111111' and is_default
     limit 1),
  g.bgg_id,
  g.tags,
  '11111111-1111-1111-1111-111111111111'
from (values
  (822,   array['семейная']::text[]),
  (13,    array['классика']::text[]),
  (1927,  array['пати']::text[])
) as g(bgg_id, tags)
where exists (
  select 1 from public.collections
  where owner_id = '11111111-1111-1111-1111-111111111111' and is_default
)
on conflict (collection_id, bgg_id) do nothing;
