-- ===========================================================================
-- browse_games: две правки окна «Добавить игры».
--
--   1. Сортировка. Раньше — `order by rating desc` (сырой средний балл BGG),
--      из-за чего вверх всплывали промо/дополнения с rating=10.00 при горстке
--      голосов. Правильное «популярное сверху» даёт `games.rank` (BGG overall
--      rank: 1 = Brass: Birmingham). Сорт: rank asc nulls last, при равенстве —
--      по числу оценок и имени. Игры без ранга (дополнения и т.п.) уходят вниз.
--
--   2. Скорость. Раньше фильтр по именам шёл через `with matched as (select
--      distinct g.id from games join game_names …)` — полный скан всех альт-имён
--      с дедупом ДАЖЕ при пустом запросе (начальная загрузка каталога). Заменяем
--      на `exists`-подзапрос в where: при пустом p_query он не вычисляется вовсе,
--      и запрос вырождается в скан games по индексу games_rank_idx + limit.
--
-- Сигнатура и возвращаемые поля прежние — приложение не меняется.
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

grant execute on function public.browse_games(text, uuid, int, int) to authenticated;
