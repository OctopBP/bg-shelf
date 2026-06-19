-- ===========================================================================
-- Обязательная коллекция + видимость
-- ===========================================================================
-- Раньше игра могла не принадлежать ни одной коллекции (collection_id = null,
-- owner_id = пользователь — виртуальная вкладка «Без коллекции»). Теперь у
-- каждой игры обязательно есть коллекция, у каждого пользователя есть коллекция
-- по умолчанию, а у коллекции — настройка видимости.

-- --- Новые колонки коллекции ----------------------------------------------
-- visibility: кто видит коллекцию помимо владельца и явно приглашённых
--   (collection_members):
--     public  — любой залогиненный пользователь
--     friends — только друзья владельца
--     private — никто (только владелец и участники)
alter table public.collections
  add column if not exists visibility text not null default 'public'
    check (visibility in ('public', 'friends', 'private'));

-- is_default: коллекция «по умолчанию». В неё попадают игры, добавленные вне
-- конкретной коллекции, и её нельзя удалить.
alter table public.collections
  add column if not exists is_default boolean not null default false;

-- У каждого владельца не больше одной коллекции по умолчанию.
create unique index if not exists collections_one_default_per_owner
  on public.collections (owner_id)
  where is_default;

-- --- Дефолтная коллекция при регистрации ----------------------------------
-- Расширяем триггер: вместе с профилем создаём «Мою коллекцию» по умолчанию.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
begin
  insert into public.profiles (id, username)
    values (new.id, public.generate_username(new.email))
    on conflict (id) do nothing;

  if not exists (
    select 1 from public.collections where owner_id = new.id and is_default
  ) then
    insert into public.collections (owner_id, name, is_default)
      values (new.id, 'Моя коллекция', true)
      returning id into cid;
    insert into public.collection_members (collection_id, user_id, role)
      values (cid, new.id, 'owner');
  end if;

  return new;
end;
$$;

-- --- Миграция orphan-записей ("без коллекции") в дефолтную коллекцию -------
-- Для каждого пользователя: гарантируем дефолтную коллекцию и переносим в неё
-- его игры без коллекции. Безопасно повторно (idempotent).
do $$
declare
  u record;
  def uuid;
begin
  for u in select id from auth.users loop
    -- 1. Найти/назначить коллекцию по умолчанию.
    select id into def
      from public.collections
      where owner_id = u.id and is_default
      order by created_at
      limit 1;

    if def is null then
      -- Предпочитаем уже существующую «Мою коллекцию», иначе самую раннюю,
      -- иначе создаём новую.
      select id into def
        from public.collections
        where owner_id = u.id
        order by (name = 'Моя коллекция') desc, created_at asc
        limit 1;

      if def is null then
        insert into public.collections (owner_id, name, is_default)
          values (u.id, 'Моя коллекция', true)
          returning id into def;
        insert into public.collection_members (collection_id, user_id, role)
          values (def, u.id, 'owner');
      else
        update public.collections set is_default = true where id = def;
      end if;
    end if;

    -- 2. Удалить orphan-дубли тех игр, что уже есть в дефолтной коллекции
    --    (иначе перенос нарушит unique (collection_id, bgg_id)).
    delete from public.collection_items oi
      where oi.owner_id = u.id
        and oi.collection_id is null
        and exists (
          select 1 from public.collection_items t
          where t.collection_id = def and t.bgg_id = oi.bgg_id
        );

    -- 3. Перенести оставшиеся orphan-записи в дефолтную коллекцию.
    update public.collection_items
      set collection_id = def,
          added_by = coalesce(added_by, owner_id),
          owner_id = null
      where owner_id = u.id and collection_id is null;
  end loop;
end;
$$;

-- --- Снимаем схему «без коллекции» -----------------------------------------
-- Политики, читающие/пишущие orphan-записи по owner_id, больше не нужны и
-- мешают удалить колонку. Удаляем их ДО drop column.
drop policy if exists "owner reads uncollected items" on public.collection_items;
drop policy if exists "owner inserts uncollected items" on public.collection_items;
drop policy if exists "owner updates uncollected items" on public.collection_items;
drop policy if exists "owner deletes uncollected items" on public.collection_items;

drop index if exists collection_items_owner_bgg_idx;
alter table public.collection_items drop column if exists owner_id;
alter table public.collection_items alter column collection_id set not null;

-- --- Видимость в RLS -------------------------------------------------------
-- Публичная коллекция (security definer, чтобы не зацикливать RLS collections).
create or replace function public.is_public_collection(cid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from collections c
    where c.id = cid and c.visibility = 'public'
  );
$$;

-- Коллекция друга, но только если её видимость это допускает.
create or replace function public.is_friend_collection(cid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from collections c
    where c.id = cid
      and c.visibility in ('friends', 'public')
      and public.are_friends(c.owner_id)
  );
$$;

grant execute on function public.is_public_collection(uuid) to authenticated;

-- collections: друг видит только friends/public, плюс публичные видны всем.
drop policy if exists "friends can read collection" on public.collections;
create policy "friends can read collection"
  on public.collections for select to authenticated
  using (
    visibility in ('friends', 'public') and public.are_friends(owner_id)
  );

drop policy if exists "public can read collection" on public.collections;
create policy "public can read collection"
  on public.collections for select to authenticated
  using (visibility = 'public');

-- collection_items: чтение для игр из friends-коллекций друзей и из публичных.
drop policy if exists "friends can read items" on public.collection_items;
create policy "friends can read items"
  on public.collection_items for select to authenticated
  using (public.is_friend_collection(collection_id));

drop policy if exists "public can read items" on public.collection_items;
create policy "public can read items"
  on public.collection_items for select to authenticated
  using (public.is_public_collection(collection_id));
