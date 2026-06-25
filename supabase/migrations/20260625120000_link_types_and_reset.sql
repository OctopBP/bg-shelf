-- ---------------------------------------------------------------------------
-- game_links: добавляем типы связей + полный сброс каталога и коллекций.
--
-- Контекст: BGG отдаёт не только дополнения (boardgameexpansion), но и аксессуары
-- (boardgameaccessory) и связанные игры/переиздания (boardgameimplementation).
-- Расширяем допустимые link_type и перезаливаем каталог заново корректными
-- данными (скрапер bg-preorders-scraper).
--
-- Направление связи (единый контракт, обе стороны пишут только так):
--   expansion       — addon = дополнение,            base = основная игра;
--   accessory       — addon = аксессуар,             base = игра, к которой он;
--   implementation  — addon = переиздание (новее),   base = оригинал (старше).
--                     На странице игры обе стороны implementation показываем
--                     вместе как «связанные игры».
-- ---------------------------------------------------------------------------

-- --- 1. Расширяем допустимые типы связи -------------------------------------
-- Снимаем любой существующий check на link_type (имя могло быть авто-сгенерено),
-- затем ставим новый — иначе старый молча отверг бы 'accessory'/'implementation'.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public' and rel.relname = 'game_links'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%link_type%'
  loop
    execute format('alter table public.game_links drop constraint %I', c.conname);
  end loop;
end$$;

alter table public.game_links
  add constraint game_links_link_type_check
  check (link_type in ('expansion', 'accessory', 'implementation'));

-- --- 2. Полный сброс каталога и содержимого коллекций -----------------------
-- DELETE (не TRUNCATE), чтобы уважать FK on delete:
--   * games → каскадно чистит game_links, game_names, game_contributors,
--     game_external_ids, game_bgg_stats и collection_items (коллекции пустеют);
--   * preorders.game_id (on delete set null) — предзаказы СОХРАНЯЮТСЯ, у них
--     лишь обнуляется привязка к игре;
--   * contributors → каскадно чистит contributor_external_ids.
-- Сами коллекции (collections/collection_members), профили, друзья и домен
-- предзаказов остаются нетронутыми.
delete from public.games;
delete from public.contributors;
