-- «Без коллекции»: игра может не принадлежать ни одной коллекции, оставаясь
-- закреплённой за пользователем (collection_id = null, owner_id = пользователь).
-- Такие orphan-записи показываются на виртуальной вкладке «Без коллекции».

-- collection_id больше не обязателен.
alter table public.collection_items alter column collection_id drop not null;

-- Владелец orphan-записи. У записей, привязанных к коллекции, остаётся null —
-- доступ к ним определяется membership'ом коллекции.
alter table public.collection_items
  add column if not exists owner_id uuid references auth.users (id) on delete cascade;

-- Уникальность игры в «Без коллекции» в пределах пользователя. Индекс полный
-- (не частичный), чтобы upsert с on_conflict (owner_id, bgg_id) работал: у
-- записей коллекций owner_id = null, поэтому они в этот индекс не попадают.
create unique index if not exists collection_items_owner_bgg_idx
  on public.collection_items (owner_id, bgg_id);

-- RLS для orphan-записей — аддитивно к member-политикам коллекций.
drop policy if exists "owner reads uncollected items" on public.collection_items;
create policy "owner reads uncollected items"
  on public.collection_items for select to authenticated
  using (collection_id is null and owner_id = auth.uid());

drop policy if exists "owner inserts uncollected items" on public.collection_items;
create policy "owner inserts uncollected items"
  on public.collection_items for insert to authenticated
  with check (collection_id is null and owner_id = auth.uid());

drop policy if exists "owner updates uncollected items" on public.collection_items;
create policy "owner updates uncollected items"
  on public.collection_items for update to authenticated
  using (collection_id is null and owner_id = auth.uid())
  with check (collection_id is null and owner_id = auth.uid());

drop policy if exists "owner deletes uncollected items" on public.collection_items;
create policy "owner deletes uncollected items"
  on public.collection_items for delete to authenticated
  using (collection_id is null and owner_id = auth.uid());
