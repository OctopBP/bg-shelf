-- ===========================================================================
-- Версия/язык в коллекциях + локализованный каталог.
--
--   1. profiles.lang — язык пользователя (ISO-код, дефолт 'ru'). UI-переключателя
--      пока нет; вся выборка названий идёт на этом языке.
--   2. collection_items.version_id — конкретная версия игры (издание/язык) из
--      game_bgg_versions. При добавлении подбирается новейшая версия на языке
--      пользователя; если такой нет — остаётся null.
--   3. cache_game — возвращает рассинхрон с приложением: добавляем параметр
--      p_is_expansion (клиент его уже шлёт) и проставляем games.is_expansion.
--   4. browse_games / search_games — параметр p_lang и локализованное имя
--      (game_names на нужном языке, иначе games.name). search_games заодно
--      отдаёт bgg_id (его выпилили из games при рефакторинге 28.06).
--   5. link_expansion — мёртвая функция (ссылается на снесённые колонки
--      addon/base game_links); связи дополнений теперь пишет импортёр.
--
-- Язык в каталоге хранится полным именем ('Russian'/'English'), на профиле —
-- ISO-кодом ('ru'); мостик ru→Russian живёт в коде (src/lib/lang.ts).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. profiles.lang
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists lang text not null default 'ru';

-- ---------------------------------------------------------------------------
-- 2. collection_items.version_id
-- ---------------------------------------------------------------------------
alter table public.collection_items
  add column if not exists version_id bigint
    references public.game_bgg_versions (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3. cache_game: +p_is_expansion (снимает рассинхрон сигнатуры с клиентом).
-- ---------------------------------------------------------------------------
drop function if exists public.cache_game(
  int, text, text, int, text, text, int, int, int, numeric, numeric, text, text[], text[]);

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
  p_mechanics     text[] default '{}',
  p_is_expansion  boolean default false
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
    min_players, max_players, playing_time, rating, is_expansion, updated_at
  )
  values (
    p_name, p_year_published, p_image_url, p_thumbnail_url,
    p_min_players, p_max_players, p_playing_time, p_rating, p_is_expansion, now()
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
-- 4a. browse_games: +p_lang, локализованное имя.
-- ---------------------------------------------------------------------------
drop function if exists public.browse_games(text, uuid, int, int);

create or replace function public.browse_games(
  p_query text default null,
  p_collection_id uuid default null,
  p_limit int default 20,
  p_offset int default 0,
  p_lang text default 'Russian'
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
  select
    g.id,
    b.bgg_id,
    coalesce(
      (select n.name from public.game_names n
       where n.game_id = g.id and n.lang = p_lang
       order by n.is_display desc nulls last
       limit 1),
      g.name
    ) as name,
    g.year_published,
    g.thumbnail_url,
    p_collection_id is not null and exists (
      select 1 from public.collection_items ci
      where ci.game_id = g.id and ci.collection_id = p_collection_id
    ) as in_collection,
    count(*) over () as total_count
  from public.games g
  left join public.games_bgg b on b.game_id = g.id
  where p_query is null
     or btrim(p_query) = ''
     or exists (
       select 1 from public.game_names n
       where n.game_id = g.id
         and n.norm ilike '%' || unaccent(lower(btrim(p_query))) || '%'
     )
  order by g.rank asc nulls last,
           g.num_ratings desc nulls last,
           g.name asc,
           g.id asc
  limit p_limit offset p_offset;
$$;

grant execute on function public.browse_games(text, uuid, int, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4b. search_games: возвращает table(...) с bgg_id + локализованным именем.
--     (Раньше returns setof games — менять тип через create or replace нельзя.)
-- ---------------------------------------------------------------------------
drop function if exists public.search_games(text, int);

create function public.search_games(
  q text,
  lim int default 20,
  p_lang text default 'Russian'
)
returns table (
  id             bigint,
  bgg_id         int,
  name           text,
  year_published int,
  thumbnail_url  text,
  is_expansion   boolean
)
language sql
stable
set search_path = public, extensions
as $$
  select
    g.id,
    b.bgg_id,
    coalesce(
      (select n2.name from public.game_names n2
       where n2.game_id = g.id and n2.lang = p_lang
       order by n2.is_display desc nulls last
       limit 1),
      g.name
    ) as name,
    g.year_published,
    g.thumbnail_url,
    g.is_expansion
  from public.games g
  join public.game_names n on n.game_id = g.id
  left join public.games_bgg b on b.game_id = g.id
  where n.norm % unaccent(lower(q))
  group by g.id, b.bgg_id
  order by max(similarity(n.norm, unaccent(lower(q)))) desc
  limit lim;
$$;

grant execute on function public.search_games(text, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. link_expansion больше не нужен (ссылается на снесённые колонки game_links).
-- ---------------------------------------------------------------------------
drop function if exists public.link_expansion(bigint, bigint);
