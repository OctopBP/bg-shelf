-- ===========================================================================
-- Роль администратора
-- ===========================================================================
-- Перенесено из проекта bg-preorders-scraper, чтобы все миграции жили в одном
-- месте. Админ — это просто профиль с role = 'admin'. is_admin() переиспользуется
-- в RLS-политиках. У profiles в этом проекте своя схема (username, без email),
-- поэтому из исходной миграции берём только колонку role и функцию is_admin().

-- Колонка role на существующей таблице profiles ('user' | 'admin').
alter table public.profiles
  add column if not exists role text not null default 'user';

-- Является ли пользователь админом. SECURITY DEFINER, чтобы функцию можно было
-- использовать в RLS-политиках без зацикливания на самой profiles.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = uid and role = 'admin'
  );
$$;

grant execute on function public.is_admin(uuid) to authenticated;

-- Примечание: UPDATE-политики на role для обычных пользователей намеренно нет —
-- назначение админа делается только через SQL / service role, чтобы пользователь
-- не мог повысить себе права.

-- ===========================================================================
-- Admin RLS: админ видит все коллекции и их игры (только чтение).
-- Политики аддитивны к существующим member/friends-политикам.
-- profiles здесь уже читаются всеми authenticated, отдельная политика не нужна.
-- ===========================================================================
drop policy if exists "admins can read all collections" on public.collections;
create policy "admins can read all collections"
  on public.collections for select to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "admins can read all items" on public.collection_items;
create policy "admins can read all items"
  on public.collection_items for select to authenticated
  using (public.is_admin(auth.uid()));

-- ===========================================================================
-- Назначение первого админа. profiles не хранит email, поэтому ищем по auth.users.
-- Если пользователь ещё не зарегистрирован, строка не обновится (no-op).
-- ===========================================================================
update public.profiles p
set role = 'admin'
from auth.users u
where u.id = p.id and u.email = 'kaktusao@mail.ru';
