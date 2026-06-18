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

-- Снимаем старую схему и фиксируем новую. Старую политику убираем ДО удаления
-- колонки user_id — иначе drop column падает с зависимостью (2BP01).
drop policy if exists "users manage own collection items" on public.collection_items;
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

-- ===========================================================================
-- Друзья
-- ===========================================================================

-- Профиль пользователя. Нужен, чтобы искать друзей и показывать их по нику
-- (auth.users недоступна через PostgREST, а email раскрывать не хочется).
-- username всегда в нижнем регистре: [a-z0-9_], 3–20 символов.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$')
);

create unique index if not exists profiles_username_idx on public.profiles (username);

-- Автогенерация уникального ника из локальной части email при регистрации.
create or replace function public.generate_username(email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
  n int := 0;
begin
  base := lower(regexp_replace(split_part(email, '@', 1), '[^a-z0-9_]', '_', 'g'));
  base := substring(base from 1 for 14);
  if length(base) < 3 then
    base := base || '_user';
  end if;
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1;
    candidate := base || '_' || n::text;
  end loop;
  return candidate;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
    values (new.id, public.generate_username(new.email))
    on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Бэкфилл профилей для уже существующих пользователей.
insert into public.profiles (id, username)
select u.id, public.generate_username(u.email)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- Дружба. Одна строка на пару; статус pending → accepted. Отклонение/отмена/
-- удаление из друзей — это delete строки.
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_distinct check (requester_id <> addressee_id),
  constraint friendships_pair_unique unique (requester_id, addressee_id)
);

create index if not exists friendships_addressee_idx on public.friendships (addressee_id);
create index if not exists friendships_requester_idx on public.friendships (requester_id);

-- Есть ли принятая дружба между текущим пользователем и other.
-- SECURITY DEFINER, чтобы обойти RLS на friendships при использовании в
-- политиках collections/collection_items (иначе зацикливание).
create or replace function public.are_friends(other uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from friendships f
    where f.status = 'accepted'
      and (
        (f.requester_id = auth.uid() and f.addressee_id = other)
        or (f.addressee_id = auth.uid() and f.requester_id = other)
      )
  );
$$;

-- Принадлежит ли коллекция другу текущего пользователя.
create or replace function public.is_friend_collection(cid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from collections c
    where c.id = cid and public.are_friends(c.owner_id)
  );
$$;

grant execute on function public.are_friends(uuid) to authenticated;
grant execute on function public.is_friend_collection(uuid) to authenticated;

-- profiles RLS
alter table public.profiles enable row level security;

drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- friendships RLS
alter table public.friendships enable row level security;

drop policy if exists "view own friendships" on public.friendships;
create policy "view own friendships"
  on public.friendships for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "send friend request" on public.friendships;
create policy "send friend request"
  on public.friendships for insert to authenticated
  with check (auth.uid() = requester_id);

-- Принять запрос: адресат меняет статус на accepted.
drop policy if exists "respond to friend request" on public.friendships;
create policy "respond to friend request"
  on public.friendships for update to authenticated
  using (auth.uid() = addressee_id) with check (auth.uid() = addressee_id);

-- Отклонить / отменить / удалить из друзей: любая из сторон.
drop policy if exists "delete own friendship" on public.friendships;
create policy "delete own friendship"
  on public.friendships for delete to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Друг видит коллекции и игры друга (только чтение). Политики аддитивны к
-- существующим member-политикам.
drop policy if exists "friends can read collection" on public.collections;
create policy "friends can read collection"
  on public.collections for select to authenticated
  using (public.are_friends(owner_id));

drop policy if exists "friends can read items" on public.collection_items;
create policy "friends can read items"
  on public.collection_items for select to authenticated
  using (public.is_friend_collection(collection_id));
