-- ===========================================================================
-- Фаза C. Связки доменов и консистентность.
-- ===========================================================================
--   * preorders.game_id — опциональная привязка предзаказа к карточке игры
--     (на момент скрапинга матча может не быть → nullable).
--   * games.created_at — когда игра попала в каталог (раньше был только
--     updated_at).
--   * games.slug — человекочитаемый/непоследовательный идентификатор для URL
--     (заполняется позже; роутинг пока по id).
--   * FK для preorders.approved_by → auth.users (была голая uuid-колонка).
-- ===========================================================================

-- --- preorders.game_id ------------------------------------------------------
alter table public.preorders
  add column if not exists game_id bigint references public.games (id) on delete set null;
create index if not exists preorders_game_idx on public.preorders (game_id);

-- --- games.created_at / slug ------------------------------------------------
alter table public.games
  add column if not exists created_at timestamptz not null default now();
alter table public.games
  add column if not exists slug text;
create unique index if not exists games_slug_key on public.games (slug) where slug is not null;

-- --- FK для preorders.approved_by ------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'preorders_approved_by_fkey' and conrelid = 'public.preorders'::regclass
  ) then
    alter table public.preorders
      add constraint preorders_approved_by_fkey
      foreign key (approved_by) references auth.users (id) on delete set null;
  end if;
end $$;
