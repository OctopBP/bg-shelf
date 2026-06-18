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
