-- ===========================================================================
-- Фаза A. Все зависимости игр — на наш собственный games.id, не на bgg_id.
-- ===========================================================================
-- 1. game_external_ids — внешние идентификаторы (BGG и будущие источники). Это
--    канонічное место для bgg_id; games.bgg_id остаётся как denormalized-зеркало
--    (нужно для ссылки «открыть на BGG» и дедупа в cache_game) — не как ключ
--    связей.
-- 2. collection_items: bgg_id-FK → game_id-FK на games.id. Снимает завязку на
--    BGG и открывает игры из других источников (у не-BGG игры bgg_id IS NULL).
-- 3. game_bgg_stats — BGG-специфичные метрики (rank/рейтинги/poll) вынесены из
--    god-table games. Эти колонки приложением не читались — чистый вынос.
-- Данные тестовые → бэкфилл best-effort, без сложной идемпотентной миграции
-- пользовательских строк.
-- ===========================================================================

-- --- 1. game_external_ids ---------------------------------------------------
create table if not exists public.game_external_ids (
  game_id     bigint not null references public.games (id) on delete cascade,
  source      text   not null,             -- 'bgg' | 'tesera' | 'hobbyworld' | ...
  external_id text   not null,             -- идентификатор в этом источнике
  url         text,
  primary key (game_id, source),
  unique (source, external_id)
);

create index if not exists game_external_ids_game_idx
  on public.game_external_ids (game_id);

-- Бэкфилл из games.bgg_id.
insert into public.game_external_ids (game_id, source, external_id)
  select id, 'bgg', bgg_id::text
  from public.games
  where bgg_id is not null
on conflict do nothing;

-- --- 2. collection_items.game_id -------------------------------------------
alter table public.collection_items
  add column if not exists game_id bigint references public.games (id) on delete cascade;

-- Бэкфилл из связки bgg_id → games.id.
update public.collection_items ci
  set game_id = g.id
  from public.games g
  where ci.game_id is null and g.bgg_id = ci.bgg_id;

-- Тестовые данные: строки без сопоставленной игры просто удаляем (иначе NOT NULL
-- ниже не встанет). На проде такого не будет — игра всегда в каталоге.
delete from public.collection_items where game_id is null;

-- Снимаем старую bgg_id-схему. Сначала уникальный индекс и FK на bgg_id, потом
-- саму колонку.
drop index if exists public.collection_items_collection_bgg_idx;
drop index if exists public.collection_items_owner_bgg_idx;
alter table public.collection_items
  drop constraint if exists collection_items_bgg_id_fkey;
alter table public.collection_items
  drop column if exists bgg_id;

alter table public.collection_items alter column game_id set not null;

create unique index if not exists collection_items_collection_game_idx
  on public.collection_items (collection_id, game_id);
create index if not exists collection_items_game_idx
  on public.collection_items (game_id);

-- --- 3. game_bgg_stats ------------------------------------------------------
-- BGG-метрики живут отдельной строкой 1:1 с игрой. Обновляются независимо
-- (рейтинги «протухают»), для не-BGG игр строки просто нет.
create table if not exists public.game_bgg_stats (
  game_id           bigint primary key references public.games (id) on delete cascade,
  rank              int,
  bayes_average     numeric(6, 4),
  average           numeric(6, 4),
  users_rated       int,
  subcategory_ranks jsonb not null default '{}',
  best_players      text,
  recommended_players text,
  updated_at        timestamptz not null default now()
);

-- Перенос значений из games (если колонки ещё существуют).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games' and column_name = 'bgg_rank'
  ) then
    insert into public.game_bgg_stats (
      game_id, rank, bayes_average, average, users_rated,
      subcategory_ranks, best_players, recommended_players
    )
    select id, bgg_rank, bgg_bayes_average, bgg_average, bgg_users_rated,
           coalesce(subcategory_ranks, '{}'::jsonb), best_players, recommended_players
    from public.games
    where bgg_rank is not null or bgg_bayes_average is not null
       or bgg_average is not null or bgg_users_rated is not null
       or best_players is not null or recommended_players is not null
    on conflict (game_id) do nothing;
  end if;
end $$;

-- Удаляем перенесённые BGG-колонки из games. rating/weight оставляем на games
-- как отображаемые поля (их читает приложение); families — в фазу B (таксономия).
drop index if exists public.games_families_idx;  -- пересоздадим, если families останется
alter table public.games drop column if exists bgg_rank;
alter table public.games drop column if exists bgg_bayes_average;
alter table public.games drop column if exists bgg_average;
alter table public.games drop column if exists bgg_users_rated;
alter table public.games drop column if exists subcategory_ranks;
alter table public.games drop column if exists best_players;
alter table public.games drop column if exists recommended_players;
-- families ещё используется gin-индексом; вернём индекс (колонку не трогаем).
create index if not exists games_families_idx on public.games using gin (families);

-- --- 4. cache_game: пополняет и games, и game_external_ids ------------------
-- Возвращает строку games (с id) — вызывающий код привязывает collection_items
-- по game_id. on conflict (bgg_id) do nothing — пользователь не может перезаписать
-- существующую запись каталога (защита от вандализма, см. 20260622150000).
create or replace function public.cache_game(
  p_bgg_id        int,
  p_name          text,
  p_original_name text default null,
  p_year_published int default null,
  p_image_url     text default null,
  p_thumbnail_url text default null,
  p_min_players   int default null,
  p_max_players   int default null,
  p_playing_time  int default null,
  p_rating        numeric default null,
  p_weight        numeric default null,
  p_description   text default null,
  p_categories    text[] default '{}',
  p_mechanics     text[] default '{}'
)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
begin
  insert into public.games (
    bgg_id, name, original_name, year_published, image_url, thumbnail_url,
    min_players, max_players, playing_time, rating, weight, description,
    categories, mechanics, updated_at
  )
  values (
    p_bgg_id, p_name, p_original_name, p_year_published, p_image_url, p_thumbnail_url,
    p_min_players, p_max_players, p_playing_time, p_rating, p_weight, p_description,
    coalesce(p_categories, '{}'), coalesce(p_mechanics, '{}'), now()
  )
  on conflict (bgg_id) do nothing;

  select * into v_game from public.games where bgg_id = p_bgg_id;

  -- Зеркалим внешний id в каноническую таблицу.
  if v_game.id is not null and p_bgg_id is not null then
    insert into public.game_external_ids (game_id, source, external_id)
      values (v_game.id, 'bgg', p_bgg_id::text)
    on conflict do nothing;
  end if;

  return v_game;
end$$;

-- --- 5. RLS для новых каталожных таблиц (как games: select всем, запись админу) -
alter table public.game_external_ids enable row level security;
alter table public.game_bgg_stats   enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['game_external_ids', 'game_bgg_stats']
  loop
    execute format('drop policy if exists "%1$s readable by authenticated" on public.%1$I', t);
    execute format(
      'create policy "%1$s readable by authenticated" on public.%1$I for select to authenticated using (true)', t);
    execute format('drop policy if exists "%1$s admin insert" on public.%1$I', t);
    execute format(
      'create policy "%1$s admin insert" on public.%1$I for insert to authenticated with check (public.is_admin(auth.uid()))', t);
    execute format('drop policy if exists "%1$s admin update" on public.%1$I', t);
    execute format(
      'create policy "%1$s admin update" on public.%1$I for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()))', t);
    execute format('drop policy if exists "%1$s admin delete" on public.%1$I', t);
    execute format(
      'create policy "%1$s admin delete" on public.%1$I for delete to authenticated using (public.is_admin(auth.uid()))', t);
  end loop;
end $$;
