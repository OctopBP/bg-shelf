-- ===========================================================================
-- Домен предзаказов (publishers / preorder_drafts / preorders)
-- ===========================================================================
-- Перенесено из проекта bg-preorders-scraper, чтобы все миграции жили в одном
-- месте (оба проекта смотрят в одну БД). Зависит от is_admin() из
-- 20260622130000_admin_role.sql. Блок profiles/role здесь намеренно опущен —
-- он уже есть в той миграции. Всё идемпотентно (if not exists / or replace).

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- Статус модерации черновика.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'draft_status') then
    create type draft_status as enum ('pending', 'approved', 'rejected');
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- publishers — справочник издателей (ключ slug совпадает с ключом скрапера).
-- ---------------------------------------------------------------------------
create table if not exists public.publishers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,          -- e.g. "hobby-world"
  website_url text,
  logo_url    text,
  is_active   boolean not null default true, -- скрапер пропускает неактивных
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- preorder_drafts — сырые спарсенные позиции на модерацию.
-- Уникальность по source_url, чтобы повторный прогон скрапера делал upsert.
-- ---------------------------------------------------------------------------
create table if not exists public.preorder_drafts (
  id            uuid primary key default gen_random_uuid(),
  publisher_id  uuid references public.publishers(id) on delete set null,
  source_url    text not null unique,
  title         text not null,
  price         numeric(10, 2),
  currency      text not null default 'RUB',
  image_url     text,
  description   text,
  release_date  date,
  raw           jsonb,
  status        draft_status not null default 'pending',
  scraped_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists preorder_drafts_status_idx
  on public.preorder_drafts (status);
create index if not exists preorder_drafts_publisher_idx
  on public.preorder_drafts (publisher_id);

-- ---------------------------------------------------------------------------
-- preorders — одобренный публичный каталог предзаказов.
-- ---------------------------------------------------------------------------
create table if not exists public.preorders (
  id            uuid primary key default gen_random_uuid(),
  draft_id      uuid references public.preorder_drafts(id) on delete set null,
  publisher_id  uuid references public.publishers(id) on delete set null,
  source_url    text not null unique,
  title         text not null,
  price         numeric(10, 2),
  currency      text not null default 'RUB',
  image_url     text,
  description   text,
  release_date  date,
  is_published  boolean not null default true,
  approved_by   uuid,                          -- auth.users.id админа
  approved_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists preorders_publisher_idx
  on public.preorders (publisher_id);
create index if not exists preorders_published_idx
  on public.preorders (is_published);

-- ---------------------------------------------------------------------------
-- touch_updated_at — держим updated_at свежим на черновиках.
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists trg_drafts_touch on public.preorder_drafts;
create trigger trg_drafts_touch
  before update on public.preorder_drafts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- approve_draft(draft_id): атомарно копирует черновик в preorders (upsert по
-- source_url) и переводит черновик в 'approved'. SECURITY DEFINER, доступ
-- только для админа (is_admin).
-- ---------------------------------------------------------------------------
create or replace function public.approve_draft(p_draft_id uuid)
returns public.preorders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft   public.preorder_drafts%rowtype;
  v_result  public.preorders%rowtype;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  select * into v_draft
  from public.preorder_drafts
  where id = p_draft_id
  for update;

  if not found then
    raise exception 'draft % not found', p_draft_id using errcode = 'P0002';
  end if;

  insert into public.preorders (
    draft_id, publisher_id, source_url, title, price, currency,
    image_url, description, release_date, approved_by, approved_at
  )
  values (
    v_draft.id, v_draft.publisher_id, v_draft.source_url, v_draft.title,
    v_draft.price, v_draft.currency, v_draft.image_url, v_draft.description,
    v_draft.release_date, auth.uid(), now()
  )
  on conflict (source_url) do update set
    title        = excluded.title,
    price        = excluded.price,
    currency     = excluded.currency,
    image_url    = excluded.image_url,
    description  = excluded.description,
    release_date = excluded.release_date,
    publisher_id = excluded.publisher_id,
    draft_id     = excluded.draft_id,
    approved_by  = excluded.approved_by,
    approved_at  = now(),
    is_published = true
  returning * into v_result;

  update public.preorder_drafts
  set status = 'approved'
  where id = p_draft_id;

  return v_result;
end$$;

-- ===========================================================================
-- RLS
-- ===========================================================================
alter table public.publishers      enable row level security;
alter table public.preorder_drafts enable row level security;
alter table public.preorders       enable row level security;

-- Публичный каталог: любой может читать опубликованные предзаказы.
drop policy if exists "preorders read published" on public.preorders;
create policy "preorders read published"
  on public.preorders for select
  using (is_published = true);

-- Издатели — публичные справочные данные.
drop policy if exists "publishers read" on public.publishers;
create policy "publishers read"
  on public.publishers for select
  using (true);

-- Черновики: читать/писать через API могут только админы.
drop policy if exists "drafts admin all" on public.preorder_drafts;
create policy "drafts admin all"
  on public.preorder_drafts for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- Админы полностью управляют предзаказами.
drop policy if exists "preorders admin all" on public.preorders;
create policy "preorders admin all"
  on public.preorders for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- Примечание: скрапер и cron-роут используют SERVICE ROLE key, который
-- полностью обходит RLS, поэтому отдельная insert-политика для них не нужна.
