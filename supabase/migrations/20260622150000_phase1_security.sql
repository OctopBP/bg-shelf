-- ===========================================================================
-- Фаза 1. Безопасность: закрыть запись в глобальный каталог игр, убрать
-- эскалацию привилегий через profiles, зафиксировать публичность предзаказов.
-- ===========================================================================
-- Зависит от public.is_admin(uuid) из 20260622130000_admin_role.sql.
-- Всё идемпотентно (drop policy if exists / create or replace).

-- ---------------------------------------------------------------------------
-- S-1. Каталожные таблицы доступны на запись только админу (или service_role,
-- который полностью обходит RLS). SELECT остаётся открытым для authenticated.
-- ---------------------------------------------------------------------------

-- games: убираем открытые insert/update, ставим admin-only на insert/update/delete.
drop policy if exists "games are insertable by authenticated users" on public.games;
drop policy if exists "games are updatable by authenticated users" on public.games;

create policy "games admin insert" on public.games
  for insert to authenticated
  with check (public.is_admin(auth.uid()));
create policy "games admin update" on public.games
  for update to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
create policy "games admin delete" on public.games
  for delete to authenticated
  using (public.is_admin(auth.uid()));

-- game_names / contributors / game_contributors / game_links: в миграции
-- 20260622120000 их insert/update/delete были открыты любому authenticated —
-- заменяем на admin-only, select оставляем как есть.
do $$
declare
  t text;
begin
  foreach t in array array['game_names', 'contributors', 'game_contributors', 'game_links']
  loop
    execute format('drop policy if exists "%1$s insertable by authenticated" on public.%1$I', t);
    execute format('drop policy if exists "%1$s updatable by authenticated" on public.%1$I', t);
    execute format('drop policy if exists "%1$s deletable by authenticated" on public.%1$I', t);

    execute format(
      'create policy "%1$s admin insert" on public.%1$I for insert to authenticated with check (public.is_admin(auth.uid()))', t);
    execute format(
      'create policy "%1$s admin update" on public.%1$I for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()))', t);
    execute format(
      'create policy "%1$s admin delete" on public.%1$I for delete to authenticated using (public.is_admin(auth.uid()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- S-3. Пополнение кэша игр обычным пользователем при добавлении в коллекцию.
-- games теперь закрыт на запись, поэтому addGameToCollection пишет не напрямую,
-- а через SECURITY DEFINER функцию cache_game — она исполняется от владельца и
-- обходит RLS. ВАЖНО: on conflict (bgg_id) do nothing — пользователь может лишь
-- добавить отсутствующую игру, но НЕ перезаписать уже существующую запись
-- каталога (защита от вандализма через прямой вызов RPC с произвольными полями).
-- ---------------------------------------------------------------------------
create or replace function public.cache_game(
  p_bgg_id        int,
  p_name          text,
  p_original_name text default null,
  p_year_published int default null,
  p_image_url     text default null,
  p_thumbnail_url text default null,
  p_min_players   int default null,
  p_max_players   int default null,
  p_playing_time  int default null,
  p_rating        numeric default null,
  p_weight        numeric default null,
  p_description   text default null,
  p_categories    text[] default '{}',
  p_mechanics     text[] default '{}'
)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
begin
  insert into public.games (
    bgg_id, name, original_name, year_published, image_url, thumbnail_url,
    min_players, max_players, playing_time, rating, weight, description,
    categories, mechanics, updated_at
  )
  values (
    p_bgg_id, p_name, p_original_name, p_year_published, p_image_url, p_thumbnail_url,
    p_min_players, p_max_players, p_playing_time, p_rating, p_weight, p_description,
    coalesce(p_categories, '{}'), coalesce(p_mechanics, '{}'), now()
  )
  on conflict (bgg_id) do nothing;

  -- Возвращаем актуальную строку (только что вставленную или уже существовавшую).
  select * into v_game from public.games where bgg_id = p_bgg_id;
  return v_game;
end$$;

grant execute on function public.cache_game(
  int, text, text, int, text, text, int, int, int, numeric, numeric, text, text[], text[]
) to authenticated;

-- ---------------------------------------------------------------------------
-- S-4. profiles: скрыть колонку role от обычных пользователей и закрыть
-- эскалацию привилегий. Существующая политика "users update own profile"
-- (for update using id = auth.uid()) разрешала менять ЛЮБУЮ колонку своей
-- строки, включая role → пользователь мог сделать себя админом. RLS не умеет
-- ограничивать колонки, поэтому используем колоночные привилегии:
--   * читать можно только id и username;
--   * обновлять можно только username.
-- is_admin() — SECURITY DEFINER, поэтому продолжает читать role в обход грантов.
-- ---------------------------------------------------------------------------
revoke select, insert, update, delete on public.profiles from anon, authenticated;
grant select (id, username) on public.profiles to anon, authenticated;
grant update (username)     on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- S-5. Публичность каталога предзаказов — намеренная. Политики "preorders read
-- published" и "publishers read" заданы без `to authenticated`, т.е. читать их
-- может и аноним. Фиксируем это решение в комментарии к политикам.
-- ---------------------------------------------------------------------------
comment on policy "preorders read published" on public.preorders is
  'Намеренно публичная (включая anon) политика: каталог предзаказов открыт для чтения всем. Решение зафиксировано в docs/database.md.';
comment on policy "publishers read" on public.publishers is
  'Намеренно публичная (включая anon) политика: справочник издателей открыт для чтения всем. Решение зафиксировано в docs/database.md.';
