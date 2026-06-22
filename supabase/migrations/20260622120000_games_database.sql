-- ===========================================================================
-- Собственная БД игр: расширяем кэш `games` до полноценного справочника.
--   * games получает суррогатный id (PK), bgg_id остаётся уникальным/nullable;
--   * имена для поиска (game_names) с триграммным fuzzy-поиском по unaccent;
--   * нормализованные люди/организации (contributors + game_contributors);
--   * связи дополнение↔базовая игра (game_links, self-referential M:N).
-- Контракт по bgg_id сохранён: collection_items.bgg_id → games.bgg_id остаётся
-- валидным (FK ссылается на unique-колонку), приложение не ломается.
-- ===========================================================================

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- --- 1. games: суррогатный id + новые поля ---------------------------------
alter table public.games add column if not exists id bigint generated always as identity;

do $$
begin
  -- bgg_id должен быть unique, чтобы FK из collection_items пережил смену PK
  if not exists (
    select 1 from pg_constraint
    where conname = 'games_bgg_id_key' and conrelid = 'public.games'::regclass
  ) then
    alter table public.games add constraint games_bgg_id_key unique (bgg_id);
  end if;

  -- если PK всё ещё на bgg_id — переносим его на id и делаем bgg_id nullable
  if exists (
    select 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.games'::regclass
      and c.contype = 'p'
      and a.attname = 'bgg_id'
  ) then
    -- FK collection_items.bgg_id физически держит индекс games_pkey, поэтому его
    -- нельзя дропнуть, пока FK на него опирается. Отцепляем FK, меняем PK, затем
    -- вешаем FK заново — он переедет на новый unique-индекс games_bgg_id_key.
    alter table public.collection_items
      drop constraint if exists collection_items_bgg_id_fkey;
    alter table public.games drop constraint games_pkey;
    alter table public.games add constraint games_pkey primary key (id);
    alter table public.games alter column bgg_id drop not null;
    alter table public.collection_items
      add constraint collection_items_bgg_id_fkey
      foreign key (bgg_id) references public.games (bgg_id) on delete cascade;
  end if;
end $$;

alter table public.games add column if not exists source text not null default 'bgg';
alter table public.games add column if not exists is_expansion boolean not null default false;
alter table public.games add column if not exists type text;
alter table public.games add column if not exists min_age int;
alter table public.games add column if not exists min_playtime int;
alter table public.games add column if not exists max_playtime int;
alter table public.games add column if not exists bgg_rank int;
alter table public.games add column if not exists bgg_bayes_average numeric(6, 4);
alter table public.games add column if not exists bgg_average numeric(6, 4);
alter table public.games add column if not exists bgg_users_rated int;
alter table public.games add column if not exists subcategory_ranks jsonb not null default '{}';
alter table public.games add column if not exists families text[] not null default '{}';
alter table public.games add column if not exists best_players text;
alter table public.games add column if not exists recommended_players text;

create index if not exists games_categories_idx on public.games using gin (categories);
create index if not exists games_mechanics_idx on public.games using gin (mechanics);
create index if not exists games_families_idx on public.games using gin (families);

-- --- 2. game_names: имена для поиска ----------------------------------------
create table if not exists public.game_names (
  id bigint generated always as identity primary key,
  game_id bigint not null references public.games (id) on delete cascade,
  name text not null,
  name_type text not null check (name_type in ('primary', 'alternate')),
  lang text,
  norm text not null default ''
);

-- norm = unaccent(lower(name)). unaccent() — STABLE (зависит от словаря), поэтому
-- генерируемую колонку использовать нельзя; ведём через триггер.
create or replace function public.game_names_set_norm()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.norm := unaccent(lower(new.name));
  return new;
end;
$$;

drop trigger if exists game_names_norm on public.game_names;
create trigger game_names_norm
  before insert or update of name on public.game_names
  for each row execute function public.game_names_set_norm();

create index if not exists game_names_game_idx on public.game_names (game_id);
create index if not exists game_names_norm_trgm_idx
  on public.game_names using gin (norm gin_trgm_ops);

-- --- 3. contributors: нормализованные люди/организации ----------------------
-- Единая таблица: один человек бывает и дизайнером, и художником — не дублируем.
create table if not exists public.contributors (
  id bigint generated always as identity primary key,
  name text not null,
  kind text not null check (kind in ('designer', 'artist', 'publisher')),
  unique (name, kind)
);

create table if not exists public.game_contributors (
  game_id bigint not null references public.games (id) on delete cascade,
  contributor_id bigint not null references public.contributors (id) on delete cascade,
  role text not null check (role in ('designer', 'artist', 'publisher')),
  primary key (game_id, contributor_id, role)
);

create index if not exists game_contributors_contributor_idx
  on public.game_contributors (contributor_id);

-- --- 4. game_links: дополнения и связи (self-referential M:N) ---------------
-- expansion: from = дополнение, to = базовая игра. База знает дополнения через
-- to_game_id, дополнение знает базу через from_game_id.
create table if not exists public.game_links (
  from_game_id bigint not null references public.games (id) on delete cascade,
  to_game_id bigint not null references public.games (id) on delete cascade,
  link_type text not null check (link_type in ('expansion', 'reimplementation', 'accessory')),
  primary key (from_game_id, to_game_id, link_type),
  check (from_game_id <> to_game_id)
);

create index if not exists game_links_to_idx on public.game_links (to_game_id);

-- --- 5. Поиск по имени/альт-именам (триграммный fuzzy) ----------------------
create or replace function public.search_games(q text, lim int default 20)
returns setof public.games
language sql
stable
set search_path = public, extensions
as $$
  select g.*
  from public.games g
  join public.game_names n on n.game_id = g.id
  where n.norm % unaccent(lower(q))
  group by g.id
  order by max(similarity(n.norm, unaccent(lower(q)))) desc
  limit lim;
$$;

grant execute on function public.search_games(text, int) to authenticated;

-- --- RLS: общий справочник, как games --------------------------------------
alter table public.game_names enable row level security;
alter table public.contributors enable row level security;
alter table public.game_contributors enable row level security;
alter table public.game_links enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['game_names', 'contributors', 'game_contributors', 'game_links']
  loop
    execute format('drop policy if exists "%1$s readable by authenticated" on public.%1$I', t);
    execute format(
      'create policy "%1$s readable by authenticated" on public.%1$I for select to authenticated using (true)', t);
    execute format('drop policy if exists "%1$s insertable by authenticated" on public.%1$I', t);
    execute format(
      'create policy "%1$s insertable by authenticated" on public.%1$I for insert to authenticated with check (true)', t);
    execute format('drop policy if exists "%1$s updatable by authenticated" on public.%1$I', t);
    execute format(
      'create policy "%1$s updatable by authenticated" on public.%1$I for update to authenticated using (true)', t);
    execute format('drop policy if exists "%1$s deletable by authenticated" on public.%1$I', t);
    execute format(
      'create policy "%1$s deletable by authenticated" on public.%1$I for delete to authenticated using (true)', t);
  end loop;
end $$;
