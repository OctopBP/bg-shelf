-- ===========================================================================
-- browse_games: меняем сортировку с названия на рейтинг BGG (games.rating)
-- по убыванию — в окне добавления игр сверху должны быть популярные игры.
-- 20260626120000_browse_games уже применена, поэтому правим функцию здесь
-- новой миграцией, а не редактируя ту.
-- ===========================================================================

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
    g.bgg_id,
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
  order by g.rating desc nulls last, g.name asc, g.id asc
  limit p_limit offset p_offset;
$$;

grant execute on function public.browse_games(text, uuid, int, int) to authenticated;
