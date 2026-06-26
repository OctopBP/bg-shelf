-- ===========================================================================
-- browse_games: постраничный обзор каталога games для простого поиска (не
-- триграммный fuzzy, как search_games, а обычное substring-совпадение по
-- основному и альтернативным названиям — для режима «Умный поиск выключен»
-- в окне добавления игр). Возвращает total_count окном, чтобы UI построил
-- пагинацию без отдельного count-запроса.
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
  order by g.name asc, g.id asc
  limit p_limit offset p_offset;
$$;

grant execute on function public.browse_games(text, uuid, int, int) to authenticated;
