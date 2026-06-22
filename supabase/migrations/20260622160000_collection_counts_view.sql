-- ===========================================================================
-- Фаза 2 (P-1). Счётчики игр на стороне БД.
-- ===========================================================================
-- Раньше listCollections / listCollectionsByOwner тянули ВСЕ строки
-- collection_items, чтобы посчитать игры в JS. Заменяем на вью с агрегатом.
--
-- security_invoker = on (Postgres 15+): вью исполняется с правами вызывающего,
-- поэтому RLS на collection_items применяется как обычно — пользователь видит
-- счётчики только по доступным ему строкам (как и при подсчёте в JS).
-- ===========================================================================
create or replace view public.collection_item_counts
with (security_invoker = on) as
  select collection_id, count(*)::int as game_count
  from public.collection_items
  group by collection_id;

comment on view public.collection_item_counts is
  'Число игр в коллекции (агрегат на стороне БД). security_invoker=on — RLS collection_items применяется к вызывающему. Используется listCollections/listCollectionsByOwner вместо подсчёта в JS.';
