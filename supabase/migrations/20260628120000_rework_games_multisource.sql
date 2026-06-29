-- ===========================================================================
-- Рефакторинг games-домена в мультиисточниковую модель.
--
-- Было: god-table `games` (BGG-поля inline) + game_bgg_stats + contributors +
-- game_links (from/to) — одна запись на BGG-игру.
--
-- Стало: тонкая каноническая `games` (только поля для списков/карточек/сорта)
-- + по таблице-детали на источник (`games_bgg`, в будущем `games_tesera`, …).
-- Имена — в `game_names` (все языки + оригинал) с одним trigram-индексом и
-- флагом `is_display` (какое имя показывать на (game, lang)); canonicalname
-- версий ищется отдельным trigram-индексом на `game_bgg_versions`. Люди и
-- компании разнесены (`persons` / `companies`). `game_links` — families +
-- expansions с гибким target.
--
-- Данные каталога НЕ сохраняем (будут переимпортированы); делаем ALTER-на-месте,
-- чтобы НЕ ронять collection_items.game_id (FK на games.id) и данные коллекций.
-- BGG-метрики из game_bgg_stats не мигрируем (тестовые) — таблица удаляется.
-- RPC приложения (browse_games / cache_game) обновлены под новую форму;
-- search_games(q,lim) возвращает setof games и продолжает работать как есть.
-- ===========================================================================

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- ---------------------------------------------------------------------------
-- 1. Справочники, общие для всех источников.
-- ---------------------------------------------------------------------------
-- Языки (например, язык BGG-версии).
create table if not exists public.languages (
  id     bigint generated always as identity primary key,
  bgg_id integer unique,
  code   text,                                  -- ISO-код, если известен
  name   text not null
);

-- Компании = BGG boardgamepublisher (издатели игр / версий).
-- ВНИМАНИЕ: это НЕ public.publishers (та моделирует магазины-источники
-- предзаказов: Crowd Games, Лавка игр). Разные сущности — держим раздельно.
create table if not exists public.companies (
  id   bigint generated always as identity primary key,
  name text not null
);
create table if not exists public.company_external_ids (
  company_id  bigint not null references public.companies (id) on delete cascade,
  source      text   not null,
  external_id text   not null,
  url         text,
  primary key (company_id, source),
  unique (source, external_id)
);

-- Люди = дизайнеры / художники / прочие участники.
create table if not exists public.persons (
  id   bigint generated always as identity primary key,
  name text not null
);
create table if not exists public.person_external_ids (
  person_id   bigint not null references public.persons (id) on delete cascade,
  source      text   not null,
  external_id text   not null,
  url         text,
  primary key (person_id, source),
  unique (source, external_id)
);

-- ---------------------------------------------------------------------------
-- 2. games -> тонкая проекция (read-model для списков/карточек/сорта).
--    id сохраняется => collection_items.game_id (FK) и данные коллекций целы.
-- ---------------------------------------------------------------------------
-- Новые поля.
alter table public.games add column if not exists rank        integer;
alter table public.games add column if not exists num_ratings integer;
alter table public.games add column if not exists slug        text;

-- `source` -> `primary_source` (какой источник канонический для этой игры).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games' and column_name = 'source'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games' and column_name = 'primary_source'
  ) then
    alter table public.games rename column source to primary_source;
  end if;
end $$;
alter table public.games add column if not exists primary_source text not null default 'bgg';

-- Убираем всё, что переезжает в games_bgg / сателлиты (данные не бережём).
alter table public.games drop column if exists bgg_id        cascade;  -- -> games_bgg.bgg_id
alter table public.games drop column if exists original_name;          -- -> game_names (alternate)
alter table public.games drop column if exists type;
alter table public.games drop column if exists description;            -- -> games_bgg
alter table public.games drop column if exists weight;
alter table public.games drop column if exists categories;
alter table public.games drop column if exists mechanics;
alter table public.games drop column if exists families;
alter table public.games drop column if exists min_age;                -- -> games_bgg
alter table public.games drop column if exists min_playtime;           -- -> games_bgg
alter table public.games drop column if exists max_playtime;           -- -> games_bgg

create unique index if not exists games_slug_key on public.games (slug);
-- Пагинация по рейтингу: keyset по rank (where rank > $cursor order by rank).
create index if not exists games_rank_idx on public.games (rank);

-- ---------------------------------------------------------------------------
-- 3. games_bgg — полная BGG-деталь (1:1 с games для источника 'bgg').
--    Хранит всё, что отдаёт BGG, плюс BGG-only метрики. raw — на будущее.
-- ---------------------------------------------------------------------------
create table if not exists public.games_bgg (
  game_id              bigint primary key references public.games (id) on delete cascade,
  bgg_id               integer not null unique,    -- BGG "thing" id; ключ апсерта
  primary_name         text not null,
  description          text,
  year_published       integer,
  thumbnail_url        text,
  image_url            text,
  min_players          integer,
  max_players          integer,
  min_playtime         integer,
  max_playtime         integer,
  playing_time         integer,
  min_age              integer,
  -- poll по числу игроков: {"1":{"best":..,"recommended":..,"not":..}, … "4+":{…}}
  suggested_numplayers jsonb   not null default '{}'::jsonb,
  average_rating       numeric(6, 4),
  num_ratings          integer,
  rank_overall         integer,
  raw                  jsonb,
  updated_at           timestamptz not null default now()
);
create index if not exists games_bgg_rank_idx on public.games_bgg (rank_overall);

-- ---------------------------------------------------------------------------
-- 4. game_bgg_versions — BGG boardgameversion + версии-издатели/художники.
--    canonical_name со своим trigram-индексом для поиска по версиям.
-- ---------------------------------------------------------------------------
create table if not exists public.game_bgg_versions (
  id             bigint generated always as identity primary key,
  game_id        bigint  not null references public.games (id) on delete cascade,
  bgg_version_id integer unique,
  canonical_name text    not null,
  norm           text    not null default '',     -- ведётся триггером (как game_names)
  thumbnail_url  text,
  image_url      text,
  year_published integer,
  language_id    bigint references public.languages (id) on delete set null
);

create or replace function public.game_bgg_versions_set_norm()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.norm := unaccent(lower(new.canonical_name));
  return new;
end;
$$;

drop trigger if exists game_bgg_versions_norm on public.game_bgg_versions;
create trigger game_bgg_versions_norm
  before insert or update of canonical_name on public.game_bgg_versions
  for each row execute function public.game_bgg_versions_set_norm();

create index if not exists game_bgg_versions_game_idx on public.game_bgg_versions (game_id);
create index if not exists game_bgg_versions_norm_trgm_idx
  on public.game_bgg_versions using gin (norm gin_trgm_ops);

create table if not exists public.game_version_publishers (
  version_id bigint not null references public.game_bgg_versions (id) on delete cascade,
  company_id bigint not null references public.companies (id) on delete cascade,
  primary key (version_id, company_id)
);
create table if not exists public.game_version_artists (
  version_id bigint not null references public.game_bgg_versions (id) on delete cascade,
  person_id  bigint not null references public.persons (id) on delete cascade,
  role       text   not null default 'artist',
  primary key (version_id, person_id, role)
);

-- ---------------------------------------------------------------------------
-- 5. Старые сателлиты заменяем новыми.
-- ---------------------------------------------------------------------------
drop table if exists public.game_bgg_stats     cascade;  -- метрики -> games_bgg
drop table if exists public.game_contributors  cascade;  -- -> game_credits / game_publishers
drop table if exists public.contributors       cascade;  -- -> persons / companies
drop table if exists public.game_links         cascade;  -- форма меняется, пересоздаём

-- game_credits — игра <-> человек с ролью.
create table public.game_credits (
  game_id   bigint not null references public.games (id) on delete cascade,
  person_id bigint not null references public.persons (id) on delete cascade,
  role      text   not null,                    -- 'designer'|'artist'|'developer'|…
  source    text   not null default 'bgg',
  primary key (game_id, person_id, role)
);
create index game_credits_person_idx on public.game_credits (person_id);

-- game_publishers — игра <-> компания (boardgamepublisher).
create table public.game_publishers (
  game_id    bigint not null references public.games (id) on delete cascade,
  company_id bigint not null references public.companies (id) on delete cascade,
  source     text   not null default 'bgg',
  primary key (game_id, company_id)
);
create index game_publishers_company_idx on public.game_publishers (company_id);

-- game_links — гетерогенные связи: families и другие игры (expansions и т.п.).
--   family       -> target = BGG-семейство (target_game_id null)
--   expansion/…  -> target = другая игра (target_game_id, когда она у нас есть)
create table public.game_links (
  game_id        bigint  not null references public.games (id) on delete cascade,
  link_type      text    not null,   -- 'family'|'expansion'|'accessory'|'reimplementation'|'integration'
  target_bgg_id  integer not null,   -- id связанного BGG thing/family
  target_game_id bigint references public.games (id) on delete set null,
  name           text,               -- отображаемое имя связанного объекта
  source         text    not null default 'bgg',
  primary key (game_id, link_type, source, target_bgg_id)
);
create index game_links_target_game_idx on public.game_links (target_game_id);
create index game_links_target_bgg_idx  on public.game_links (link_type, target_bgg_id);

-- ---------------------------------------------------------------------------
-- 6. game_names — добавляем is_display (показываемое имя на (game, lang))
--    и source. norm/триггер/trigram-индекс уже есть из games_database.
-- ---------------------------------------------------------------------------
alter table public.game_names add column if not exists is_display boolean not null default false;
alter table public.game_names add column if not exists source     text    not null default 'bgg';
-- Максимум одно display-имя на (game_id, lang).
create unique index if not exists game_names_one_display
  on public.game_names (game_id, lang) where is_display;

-- ---------------------------------------------------------------------------
-- 7. RPC под новую форму.
-- ---------------------------------------------------------------------------
-- browse_games: bgg_id теперь берём из games_bgg (в games его нет). Сигнатура и
-- порядок сортировки (по рейтингу) сохранены — приложение коллекций не меняется.
create or replace function public.browse_games(
  p_query text default null,
  p_collection_id uuid default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id bigint,
  bgg_id int,
  name text,
  year_published int,
  thumbnail_url text,
  in_collection boolean,
  total_count bigint
)
language sql
stable
set search_path = public, extensions
as $$
  with matched as (
    select distinct g.id
    from public.games g
    join public.game_names n on n.game_id = g.id
    where p_query is null or btrim(p_query) = ''
       or n.norm ilike '%' || unaccent(lower(btrim(p_query))) || '%'
  )
  select
    g.id,
    b.bgg_id,
    g.name,
    g.year_published,
    g.thumbnail_url,
    p_collection_id is not null and exists (
      select 1 from public.collection_items ci
      where ci.game_id = g.id and ci.collection_id = p_collection_id
    ) as in_collection,
    count(*) over () as total_count
  from public.games g
  join matched m on m.id = g.id
  left join public.games_bgg b on b.game_id = g.id
  order by g.rating desc nulls last, g.name asc, g.id asc
  limit p_limit offset p_offset;
$$;

grant execute on function public.browse_games(text, uuid, int, int) to authenticated;

-- cache_game: апсертит игру в новую модель (games + games_bgg + game_names +
-- game_external_ids). Сигнатура прежняя (совместимость с приложением); поля,
-- которых больше нет в модели (weight/categories/mechanics), игнорируются.
-- Дедуп по games_bgg.bgg_id. SECURITY DEFINER — как раньше.
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
  -- Уже в каталоге?
  select g.* into v_game
  from public.games g
  join public.games_bgg b on b.game_id = g.id
  where b.bgg_id = p_bgg_id;
  if found then
    return v_game;
  end if;

  insert into public.games (
    name, year_published, image_url, thumbnail_url,
    min_players, max_players, playing_time, rating, primary_source, updated_at
  )
  values (
    p_name, p_year_published, p_image_url, p_thumbnail_url,
    p_min_players, p_max_players, p_playing_time, p_rating, 'bgg', now()
  )
  returning * into v_game;

  insert into public.games_bgg (
    game_id, bgg_id, primary_name, description, year_published,
    thumbnail_url, image_url, min_players, max_players, playing_time
  )
  values (
    v_game.id, p_bgg_id, p_name, p_description, p_year_published,
    p_thumbnail_url, p_image_url, p_min_players, p_max_players, p_playing_time
  )
  on conflict (bgg_id) do nothing;

  -- Имена: основное (display) + оригинал как альтернативное, если отличается.
  insert into public.game_names (game_id, name, name_type, is_display, source)
    values (v_game.id, p_name, 'primary', true, 'bgg');
  if p_original_name is not null and p_original_name <> p_name then
    insert into public.game_names (game_id, name, name_type, source)
      values (v_game.id, p_original_name, 'alternate', 'bgg');
  end if;

  insert into public.game_external_ids (game_id, source, external_id)
    values (v_game.id, 'bgg', p_bgg_id::text)
  on conflict do nothing;

  return v_game;
end$$;

-- ---------------------------------------------------------------------------
-- 8. updated_at триггеры для games / games_bgg.
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists trg_games_touch on public.games;
create trigger trg_games_touch
  before update on public.games
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_games_bgg_touch on public.games_bgg;
create trigger trg_games_bgg_touch
  before update on public.games_bgg
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 9. RLS: каталог публично читаем; запись — через service role (обходит RLS).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'games_bgg','languages','companies','company_external_ids',
    'persons','person_external_ids','game_bgg_versions',
    'game_version_publishers','game_version_artists',
    'game_credits','game_publishers','game_links'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select using (true)', t || '_read', t);
  end loop;
end $$;
