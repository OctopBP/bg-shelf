-- Кэш данных об играх из BGG (общий для всех пользователей)
create table if not exists public.games (
  bgg_id integer primary key,
  name text not null,
  original_name text,
  year_published integer,
  image_url text,
  thumbnail_url text,
  min_players integer,
  max_players integer,
  playing_time integer,
  rating numeric(4, 2),
  weight numeric(4, 2),
  description text,
  categories text[] default '{}',
  mechanics text[] default '{}',
  updated_at timestamptz not null default now()
);

-- Для уже существующих БД: добавляем оригинальное название игры.
alter table public.games add column if not exists original_name text;

-- Коллекция игр. У одного пользователя может быть несколько коллекций; коллекцию
-- можно расшарить другим пользователям (см. collection_members).
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists collections_owner_idx on public.collections (owner_id);

-- Участники коллекции (включая владельца). Роли:
--   owner  — полный доступ + управление участниками и удаление коллекции
--   editor — добавлять/удалять игры, менять теги/заметки
--   viewer — только просмотр
create table if not exists public.collection_members (
  collection_id uuid not null references public.collections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  added_at timestamptz not null default now(),
  primary key (collection_id, user_id)
);

create index if not exists collection_members_user_idx on public.collection_members (user_id);

-- Записи коллекции. Раньше привязывались к user_id напрямую; теперь к
-- collection_id. collection_id создаётся nullable, чтобы миграция (ниже) успела
-- перенести старые строки до установки NOT NULL.
create table if not exists public.collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid references public.collections (id) on delete cascade,
  bgg_id integer not null references public.games (bgg_id) on delete cascade,
  tags text[] not null default '{}',
  notes text,
  added_at timestamptz not null default now(),
  added_by uuid references auth.users (id)
);

-- Для уже существующих БД: новые колонки.
alter table public.collection_items
  add column if not exists collection_id uuid references public.collections (id) on delete cascade;
alter table public.collection_items
  add column if not exists added_by uuid references auth.users (id);

-- --- Helper-функции -------------------------------------------------------
-- SECURITY DEFINER, поэтому обходят RLS на collection_members — иначе политики,
-- читающие collection_members, зациклились бы.
create or replace function public.is_collection_member(cid uuid, min_role text default 'viewer')
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from collection_members m
    where m.collection_id = cid
      and m.user_id = auth.uid()
      and (
        min_role = 'viewer'
        or (min_role = 'editor' and m.role in ('editor', 'owner'))
        or (min_role = 'owner' and m.role = 'owner')
      )
  );
$$;

-- Создаёт коллекцию и owner-membership одной транзакцией.
create or replace function public.create_collection(name text)
returns public.collections
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.collections;
begin
  insert into public.collections (owner_id, name)
    values (auth.uid(), name)
    returning * into c;
  insert into public.collection_members (collection_id, user_id, role)
    values (c.id, auth.uid(), 'owner');
  return c;
end;
$$;

-- Делится коллекцией с существующим пользователем по email. Приложение
-- invite-only: если аккаунта с таким email нет — raise 'no_account'.
create or replace function public.share_collection(cid uuid, invitee_email text, member_role text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target uuid;
begin
  if not public.is_collection_member(cid, 'owner') then
    raise exception 'not_owner';
  end if;
  if member_role not in ('editor', 'viewer') then
    raise exception 'bad_role';
  end if;
  select id into target from auth.users where lower(email) = lower(trim(invitee_email)) limit 1;
  if target is null then
    raise exception 'no_account';
  end if;
  if target = auth.uid() then
    raise exception 'self';
  end if;
  insert into public.collection_members (collection_id, user_id, role)
    values (cid, target, member_role)
    on conflict (collection_id, user_id) do update set role = excluded.role;
end;
$$;

-- Участники коллекции с email (auth.users недоступна через PostgREST напрямую).
create or replace function public.collection_member_emails(cid uuid)
returns table (user_id uuid, email text, role text)
language sql
security definer
stable
set search_path = public, auth
as $$
  select m.user_id, u.email::text, m.role
  from collection_members m
  join auth.users u on u.id = m.user_id
  where m.collection_id = cid
    and public.is_collection_member(cid);
$$;

grant execute on function public.is_collection_member(uuid, text) to authenticated;
grant execute on function public.create_collection(text) to authenticated;
grant execute on function public.share_collection(uuid, text, text) to authenticated;
grant execute on function public.collection_member_emails(uuid) to authenticated;

-- --- Миграция старых данных (user_id → collection_id) ----------------------
-- Для каждого пользователя со старыми записями создаём «Мою коллекцию»,
-- owner-membership и переносим его игры. Безопасно повторно: работает только
-- пока в таблице ещё есть колонка user_id и непривязанные строки.
do $$
declare
  has_user_id boolean;
  rec record;
  new_cid uuid;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'collection_items'
      and column_name = 'user_id'
  ) into has_user_id;

  if has_user_id then
    for rec in
      execute 'select distinct user_id from public.collection_items where collection_id is null'
    loop
      insert into public.collections (owner_id, name)
        values (rec.user_id, 'Моя коллекция')
        returning id into new_cid;
      insert into public.collection_members (collection_id, user_id, role)
        values (new_cid, rec.user_id, 'owner');
      execute 'update public.collection_items set collection_id = $1, added_by = $2 where user_id = $2 and collection_id is null'
        using new_cid, rec.user_id;
    end loop;
  end if;
end;
$$;

-- Снимаем старую схему и фиксируем новую.
alter table public.collection_items drop constraint if exists collection_items_user_id_bgg_id_key;
drop index if exists collection_items_user_idx;
alter table public.collection_items drop column if exists user_id;
alter table public.collection_items alter column collection_id set not null;
create unique index if not exists collection_items_collection_bgg_idx
  on public.collection_items (collection_id, bgg_id);
create index if not exists collection_items_collection_idx
  on public.collection_items (collection_id);

-- --- RLS -------------------------------------------------------------------
alter table public.games enable row level security;
alter table public.collections enable row level security;
alter table public.collection_members enable row level security;
alter table public.collection_items enable row level security;

-- games — общий кэш: читать и пополнять может любой залогиненный пользователь
drop policy if exists "games are readable by authenticated users" on public.games;
create policy "games are readable by authenticated users"
  on public.games for select to authenticated using (true);

drop policy if exists "games are insertable by authenticated users" on public.games;
create policy "games are insertable by authenticated users"
  on public.games for insert to authenticated with check (true);

drop policy if exists "games are updatable by authenticated users" on public.games;
create policy "games are updatable by authenticated users"
  on public.games for update to authenticated using (true);

-- collections
drop policy if exists "members can read collection" on public.collections;
create policy "members can read collection"
  on public.collections for select to authenticated
  using (public.is_collection_member(id));

drop policy if exists "owner can create collection" on public.collections;
create policy "owner can create collection"
  on public.collections for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "owner can update collection" on public.collections;
create policy "owner can update collection"
  on public.collections for update to authenticated
  using (public.is_collection_member(id, 'owner'));

drop policy if exists "owner can delete collection" on public.collections;
create policy "owner can delete collection"
  on public.collections for delete to authenticated
  using (public.is_collection_member(id, 'owner'));

-- collection_members
drop policy if exists "members can read membership" on public.collection_members;
create policy "members can read membership"
  on public.collection_members for select to authenticated
  using (public.is_collection_member(collection_id));

drop policy if exists "owner can add members" on public.collection_members;
create policy "owner can add members"
  on public.collection_members for insert to authenticated
  with check (public.is_collection_member(collection_id, 'owner'));

drop policy if exists "owner can update members" on public.collection_members;
create policy "owner can update members"
  on public.collection_members for update to authenticated
  using (public.is_collection_member(collection_id, 'owner'));

drop policy if exists "owner can remove members" on public.collection_members;
create policy "owner can remove members"
  on public.collection_members for delete to authenticated
  using (public.is_collection_member(collection_id, 'owner'));

-- collection_items — чтение для участников, изменения для editor+
drop policy if exists "users manage own collection items" on public.collection_items;

drop policy if exists "members can read items" on public.collection_items;
create policy "members can read items"
  on public.collection_items for select to authenticated
  using (public.is_collection_member(collection_id));

drop policy if exists "editors can insert items" on public.collection_items;
create policy "editors can insert items"
  on public.collection_items for insert to authenticated
  with check (public.is_collection_member(collection_id, 'editor'));

drop policy if exists "editors can update items" on public.collection_items;
create policy "editors can update items"
  on public.collection_items for update to authenticated
  using (public.is_collection_member(collection_id, 'editor'));

drop policy if exists "editors can delete items" on public.collection_items;
create policy "editors can delete items"
  on public.collection_items for delete to authenticated
  using (public.is_collection_member(collection_id, 'editor'));
