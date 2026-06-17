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

-- Коллекция конкретного пользователя
create table if not exists public.collection_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bgg_id integer not null references public.games (bgg_id) on delete cascade,
  tags text[] not null default '{}',
  notes text,
  added_at timestamptz not null default now(),
  unique (user_id, bgg_id)
);

create index if not exists collection_items_user_idx on public.collection_items (user_id);

alter table public.games enable row level security;
alter table public.collection_items enable row level security;

-- games — общий кэш: читать и пополнять может любой залогиненный пользователь
create policy "games are readable by authenticated users"
  on public.games for select to authenticated using (true);

create policy "games are insertable by authenticated users"
  on public.games for insert to authenticated with check (true);

create policy "games are updatable by authenticated users"
  on public.games for update to authenticated using (true);

-- collection_items — строго свои записи
create policy "users manage own collection items"
  on public.collection_items for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
