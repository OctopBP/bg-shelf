-- ---------------------------------------------------------------------------
-- game_links: понятные имена колонок + единое направление связи.
--
-- Предыстория (см. docs/expansions-investigation.md):
--   * Колонки назывались from_game_id / to_game_id — неочевидно, где база, а где
--     дополнение. Канон был «from = дополнение, to = базовая игра».
--   * Сайт (link_expansion, getCollectionExpansionMap) писал/читал ПО канону, а
--     массовый скрапер bg-preorders-scraper писал ЗЕРКАЛЬНО (from = база,
--     to = дополнение). Каталог в основном наполнен скрапером → сайт показывал
--     базы как дополнения и наоборот.
--
-- Здесь:
--   1) переименовываем колонки в говорящие base_game_id / addon_game_id
--      (addon = дополнение/аксессуар/переиздание; base = основная игра);
--   2) нормализуем УЖЕ записанные связи: addon_game_id всегда указывает на
--      сторону-дополнение (games.is_expansion = true). Это разворачивает
--      инвертированные строки скрапера и схлопывает обратные дубли;
--   3) пересоздаём link_expansion под новые имена параметров/колонок.
--
-- Контракт на будущее: addon_game_id = дополнение, base_game_id = основная игра.
-- Обе стороны (сайт и скрапер) пишут строго так.
-- ---------------------------------------------------------------------------

-- --- 1. Переименование колонок, индекса и FK-ограничений --------------------
alter table public.game_links rename column from_game_id to addon_game_id;
alter table public.game_links rename column to_game_id   to base_game_id;

-- Индекс был на «to» (базовая игра) — теперь это base_game_id.
alter index if exists public.game_links_to_idx rename to game_links_base_idx;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'game_links_from_game_id_fkey') then
    alter table public.game_links
      rename constraint game_links_from_game_id_fkey to game_links_addon_game_id_fkey;
  end if;
  if exists (select 1 from pg_constraint where conname = 'game_links_to_game_id_fkey') then
    alter table public.game_links
      rename constraint game_links_to_game_id_fkey to game_links_base_game_id_fkey;
  end if;
end$$;

-- --- 2. Нормализация направления существующих связей ------------------------
-- addon_game_id должен указывать на дополнение (is_expansion = true). Где после
-- переименования это не так, а противоположная сторона — дополнение, меняем
-- стороны местами. distinct схлопывает дубли (когда пара была записана и прямо,
-- и зеркально). Строки, где флаг is_expansion не помогает (ни одна сторона не
-- помечена дополнением), остаются как есть — их направление мы определить не
-- можем (см. ограничение в docs/expansions-investigation.md).
drop table if exists public._game_links_fixed;
create table public._game_links_fixed as
select distinct
  case when gb.is_expansion and not ga.is_expansion then l.base_game_id
       else l.addon_game_id end as addon_game_id,
  case when gb.is_expansion and not ga.is_expansion then l.addon_game_id
       else l.base_game_id end as base_game_id,
  l.link_type
from public.game_links l
join public.games ga on ga.id = l.addon_game_id
join public.games gb on gb.id = l.base_game_id;

truncate public.game_links;

insert into public.game_links (addon_game_id, base_game_id, link_type)
select addon_game_id, base_game_id, link_type
from public._game_links_fixed
where addon_game_id <> base_game_id;

drop table public._game_links_fixed;

-- --- 3. link_expansion под новые имена --------------------------------------
-- Имена входных параметров меняются, поэтому пересоздаём (create or replace не
-- умеет переименовывать параметры).
drop function if exists public.link_expansion(bigint, bigint);

create function public.link_expansion(
  p_addon_game_id bigint,
  p_base_game_id  bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_addon_game_id is null or p_base_game_id is null
     or p_addon_game_id = p_base_game_id then
    return;
  end if;
  insert into public.game_links (addon_game_id, base_game_id, link_type)
    values (p_addon_game_id, p_base_game_id, 'expansion')
  on conflict do nothing;
end$$;

grant execute on function public.link_expansion(bigint, bigint) to authenticated;
