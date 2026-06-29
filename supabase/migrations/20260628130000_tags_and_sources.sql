-- ===========================================================================
-- Поверх 20260628120000_rework_games_multisource:
--   1. Нормализованная BGG-таксономия: categories / mechanics / families
--      (tags + game_tags). Families переезжают из game_links в tags — теперь
--      game_links только связи игра↔игра.
--   2. Справочник источников `sources` + замена всех `source text` на
--      `source_id smallint references sources` (default 1 = bgg).
-- Данные каталога не сохраняем — там, где `source` входит в PK/unique, таблицы
-- просто пересоздаются.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. sources — справочник источников данных.
-- ---------------------------------------------------------------------------
create table if not exists public.sources (
  id   smallint primary key,
  code text not null unique,
  name text
);
insert into public.sources (id, code, name) values
  (1, 'bgg', 'BoardGameGeek')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. tags / game_tags — нормализованная таксономия (categories/mechanics/family).
--    Дедуп по (type, name); bgg_id — supplementary.
-- ---------------------------------------------------------------------------
create table public.tags (
  id     bigint generated always as identity primary key,
  type   text    not null check (type in ('category', 'mechanic', 'family')),
  bgg_id integer,
  name   text    not null,
  unique (type, name)
);
create unique index tags_type_bgg_id_key
  on public.tags (type, bgg_id) where bgg_id is not null;

create table public.game_tags (
  game_id   bigint   not null references public.games (id) on delete cascade,
  tag_id    bigint   not null references public.tags (id) on delete cascade,
  source_id smallint not null default 1 references public.sources (id),
  primary key (game_id, tag_id)
);
create index game_tags_tag_idx on public.game_tags (tag_id);   -- «все игры тега X»

-- ---------------------------------------------------------------------------
-- 3. source text -> source_id во всех таблицах games-домена (default 1 = bgg).
-- ---------------------------------------------------------------------------
-- games.primary_source -> primary_source_id
alter table public.games drop column if exists primary_source;
alter table public.games add column primary_source_id smallint not null default 1
  references public.sources (id);

-- game_names.source -> source_id
alter table public.game_names drop column if exists source;
alter table public.game_names add column source_id smallint not null default 1
  references public.sources (id);

-- game_credits.source -> source_id (source не в PK)
alter table public.game_credits drop column if exists source;
alter table public.game_credits add column source_id smallint not null default 1
  references public.sources (id);

-- game_publishers.source -> source_id (source не в PK)
alter table public.game_publishers drop column if exists source;
alter table public.game_publishers add column source_id smallint not null default 1
  references public.sources (id);

-- game_links.source -> source_id (source В PK — пересобираем PK)
alter table public.game_links drop constraint game_links_pkey;
alter table public.game_links drop column source;
alter table public.game_links add column source_id smallint not null default 1
  references public.sources (id);
alter table public.game_links add primary key (game_id, link_type, source_id, target_bgg_id);

-- *_external_ids: source в PK+unique — проще пересоздать (данных нет).
drop table if exists public.company_external_ids cascade;
create table public.company_external_ids (
  company_id  bigint   not null references public.companies (id) on delete cascade,
  source_id   smallint not null default 1 references public.sources (id),
  external_id text     not null,
  url         text,
  primary key (company_id, source_id),
  unique (source_id, external_id)
);

drop table if exists public.person_external_ids cascade;
create table public.person_external_ids (
  person_id   bigint   not null references public.persons (id) on delete cascade,
  source_id   smallint not null default 1 references public.sources (id),
  external_id text     not null,
  url         text,
  primary key (person_id, source_id),
  unique (source_id, external_id)
);

-- game_external_ids (из phase_a, source text) -> source_id.
drop table if exists public.game_external_ids cascade;
create table public.game_external_ids (
  game_id     bigint   not null references public.games (id) on delete cascade,
  source_id   smallint not null default 1 references public.sources (id),
  external_id text     not null,
  url         text,
  primary key (game_id, source_id),
  unique (source_id, external_id)
);
create index game_external_ids_game_idx on public.game_external_ids (game_id);

-- ---------------------------------------------------------------------------
-- 4. cache_game — под новую таксономию и source_id (default 1 = bgg, поэтому
--    source_id в инсертах не указываем).
-- ---------------------------------------------------------------------------
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
    min_players, max_players, playing_time, rating, updated_at
  )
  values (
    p_name, p_year_published, p_image_url, p_thumbnail_url,
    p_min_players, p_max_players, p_playing_time, p_rating, now()
  )
  returning * into v_game;   -- primary_source_id = 1 (bgg) по дефолту

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
  -- (source_id = 1/bgg по дефолту)
  insert into public.game_names (game_id, name, name_type, is_display)
    values (v_game.id, p_name, 'primary', true);
  if p_original_name is not null and p_original_name <> p_name then
    insert into public.game_names (game_id, name, name_type)
      values (v_game.id, p_original_name, 'alternate');
  end if;

  insert into public.game_external_ids (game_id, external_id)
    values (v_game.id, p_bgg_id::text)
  on conflict do nothing;

  -- Таксономия: раскладываем имена категорий/механик по нормализованным тегам.
  -- (families в cache_game не передаются — их пишет BGG-импортёр.)
  insert into public.tags (type, name)
    select 'category', x from unnest(coalesce(p_categories, '{}')) as x
  on conflict (type, name) do nothing;
  insert into public.tags (type, name)
    select 'mechanic', x from unnest(coalesce(p_mechanics, '{}')) as x
  on conflict (type, name) do nothing;

  insert into public.game_tags (game_id, tag_id)
    select v_game.id, t.id
    from public.tags t
    where (t.type = 'category' and t.name = any (coalesce(p_categories, '{}')))
       or (t.type = 'mechanic' and t.name = any (coalesce(p_mechanics, '{}')))
  on conflict do nothing;

  return v_game;
end$$;

-- ---------------------------------------------------------------------------
-- 5. RLS для новых/пересозданных таблиц (публичное чтение).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'sources','tags','game_tags',
    'company_external_ids','person_external_ids','game_external_ids'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select using (true)', t || '_read', t);
  end loop;
end $$;
