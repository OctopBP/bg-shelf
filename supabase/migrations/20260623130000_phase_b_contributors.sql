-- ===========================================================================
-- Фаза B (частично). contributors: убрать дублирующий `kind`, добавить внешние
-- идентификаторы. Тип вклада хранится только в game_contributors.role.
-- ===========================================================================
-- Таблицы contributors/game_contributors приложением пока не заполняются (их
-- наполнит будущий импортёр). Данные тестовые → чистим и пересобираем без
-- сложного дедупа.
--
-- ОТЛОЖЕНО осознанно (см. docs/db-review.md, фиксируется в docs/database.md):
--   * B1 — дубль имени games.name vs game_names (games.name = отображаемое имя,
--     game_names = поисковый индекс; нормализация позже, чтобы не ломать
--     joined-select games(*));
--   * B2 — нормализация таксономии categories/mechanics/families (text[]) в
--     tags/game_tags (ломает games(*)-join, низкая сейчас отдача).
-- ===========================================================================

truncate table public.game_contributors, public.contributors restart identity cascade;

-- kind дублировал game_contributors.role — убираем. Человек/организация теперь
-- уникальны по имени (тёзки-edge case задокументирован).
alter table public.contributors drop constraint if exists contributors_name_kind_key;
alter table public.contributors drop column if exists kind;
create unique index if not exists contributors_name_key on public.contributors (name);

-- Внешние id людей/организаций (у BGG есть id дизайнеров/издателей). Дедуп при
-- импорте по (source, external_id), а не по строке имени.
create table if not exists public.contributor_external_ids (
  contributor_id bigint not null references public.contributors (id) on delete cascade,
  source         text   not null,
  external_id    text   not null,
  url            text,
  primary key (contributor_id, source),
  unique (source, external_id)
);

create index if not exists contributor_external_ids_contributor_idx
  on public.contributor_external_ids (contributor_id);

-- RLS: как у остального каталога (select всем authenticated, запись — админ).
alter table public.contributor_external_ids enable row level security;

drop policy if exists "contributor_external_ids readable by authenticated" on public.contributor_external_ids;
create policy "contributor_external_ids readable by authenticated"
  on public.contributor_external_ids for select to authenticated using (true);
drop policy if exists "contributor_external_ids admin insert" on public.contributor_external_ids;
create policy "contributor_external_ids admin insert"
  on public.contributor_external_ids for insert to authenticated
  with check (public.is_admin(auth.uid()));
drop policy if exists "contributor_external_ids admin update" on public.contributor_external_ids;
create policy "contributor_external_ids admin update"
  on public.contributor_external_ids for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop policy if exists "contributor_external_ids admin delete" on public.contributor_external_ids;
create policy "contributor_external_ids admin delete"
  on public.contributor_external_ids for delete to authenticated
  using (public.is_admin(auth.uid()));
