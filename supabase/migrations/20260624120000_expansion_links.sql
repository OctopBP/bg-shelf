-- ---------------------------------------------------------------------------
-- Связи «дополнение ↔ базовая игра» в каталоге.
--
-- Таблица public.game_links и колонка games.is_expansion заведены ещё в
-- 20260622120000_games_database.sql, но до сих пор НИКЕМ не заполнялись:
--   * cache_game (20260623120000) не проставляет is_expansion;
--   * game_links под RLS доступна на запись только админу (см. 20260622120000),
--     поэтому обычный пользователь не мог создать связь.
--
-- Здесь:
--   1) cache_game получает p_is_expansion (проставляется при ВСТАВКЕ новой игры);
--   2) добавляется SECURITY DEFINER функция link_expansion — обычный пользователь
--      создаёт связь дополнение→база в обход RLS (как cache_game пополняет games).
-- ---------------------------------------------------------------------------

-- Старую 14-аргументную сигнатуру убираем, чтобы не плодить overload.
drop function if exists public.cache_game(
  int, text, text, int, text, text, int, int, int, numeric, numeric, text, text[], text[]
);

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
  insert into public.games (
    bgg_id, name, original_name, year_published, image_url, thumbnail_url,
    min_players, max_players, playing_time, rating, weight, description,
    categories, mechanics, is_expansion, updated_at
  )
  values (
    p_bgg_id, p_name, p_original_name, p_year_published, p_image_url, p_thumbnail_url,
    p_min_players, p_max_players, p_playing_time, p_rating, p_weight, p_description,
    coalesce(p_categories, '{}'), coalesce(p_mechanics, '{}'), p_is_expansion, now()
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

grant execute on function public.cache_game(
  int, text, text, int, text, text, int, int, int, numeric, numeric, text, text[], text[], boolean
) to authenticated;

-- --- link_expansion: связь дополнение→база (как cache_game — definer-обход RLS) -
-- from_game_id = дополнение, to_game_id = базовая игра. Идемпотентна.
create or replace function public.link_expansion(
  p_from_game_id bigint,
  p_to_game_id   bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_from_game_id is null or p_to_game_id is null
     or p_from_game_id = p_to_game_id then
    return;
  end if;
  insert into public.game_links (from_game_id, to_game_id, link_type)
    values (p_from_game_id, p_to_game_id, 'expansion')
  on conflict do nothing;
end$$;

grant execute on function public.link_expansion(bigint, bigint) to authenticated;
