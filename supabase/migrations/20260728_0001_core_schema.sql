-- ============================================================================
-- ScentKeep — core schema.
--
-- Security model (brief §5): RLS is ON for every user table and every policy is
-- scoped to `auth.uid()`, so a user can only ever read or write their own rows.
-- Anonymous-first: rows hang off auth.users, which anonymous sign-in populates.
--
-- `(select auth.uid())` rather than bare `auth.uid()` is deliberate — Postgres
-- caches the scalar subquery once per statement instead of re-evaluating the
-- function per row, which is what Supabase's `auth_rls_initplan` advisor checks.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  prefs       jsonb not null default '{}'::jsonb
);

alter table public.profiles enable row level security;

create policy "profiles: owner reads"   on public.profiles
  for select using ((select auth.uid()) = id);
create policy "profiles: owner inserts" on public.profiles
  for insert with check ((select auth.uid()) = id);
create policy "profiles: owner updates" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles: owner deletes" on public.profiles
  for delete using ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- fragrances — the wardrobe (and, when in_wishlist, the wishlist)
-- ---------------------------------------------------------------------------
create table if not exists public.fragrances (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 120),
  brand         text not null default '' check (char_length(brand) <= 120),
  photo_url     text check (photo_url is null or char_length(photo_url) <= 2048),
  notes_top     text check (notes_top is null or char_length(notes_top) <= 500),
  notes_heart   text check (notes_heart is null or char_length(notes_heart) <= 500),
  notes_base    text check (notes_base is null or char_length(notes_base) <= 500),
  family        text check (family is null or char_length(family) <= 40),
  size_ml       numeric(7, 2) check (size_ml is null or (size_ml > 0 and size_ml <= 10000)),
  price         numeric(12, 2) check (price is null or (price >= 0 and price <= 1000000)),
  currency      text not null default 'USD' check (char_length(currency) = 3),
  purchase_date date,
  seasons       text[] not null default '{}'::text[] check (array_length(seasons, 1) is null or array_length(seasons, 1) <= 4),
  occasions     text[] not null default '{}'::text[] check (array_length(occasions, 1) is null or array_length(occasions, 1) <= 12),
  longevity     smallint not null default 0 check (longevity between 0 and 5),
  sillage       smallint not null default 0 check (sillage between 0 and 5),
  rating        smallint not null default 0 check (rating between 0 and 5),
  in_wishlist   boolean not null default false,
  notes         text check (notes is null or char_length(notes) <= 4000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Lets sotd_entries carry a composite FK that pins a diary row to a bottle the
  -- SAME user owns. Without this, a crafted insert could reference a stranger's
  -- fragrance id and leak its existence through FK violation behaviour.
  unique (id, user_id)
);

alter table public.fragrances enable row level security;

create policy "fragrances: owner reads"   on public.fragrances
  for select using ((select auth.uid()) = user_id);
create policy "fragrances: owner inserts" on public.fragrances
  for insert with check ((select auth.uid()) = user_id);
create policy "fragrances: owner updates" on public.fragrances
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "fragrances: owner deletes" on public.fragrances
  for delete using ((select auth.uid()) = user_id);

create index if not exists fragrances_user_wishlist_idx
  on public.fragrances (user_id, in_wishlist, created_at desc);
create index if not exists fragrances_user_brand_idx
  on public.fragrances (user_id, brand);

-- ---------------------------------------------------------------------------
-- sotd_entries — the Scent of the Day diary. Append-mostly history.
-- ---------------------------------------------------------------------------
create table if not exists public.sotd_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  fragrance_id uuid not null,
  date         date not null,
  occasion     text check (occasion is null or char_length(occasion) <= 40),
  weather      text check (weather is null or char_length(weather) <= 40),
  mood         text check (mood is null or char_length(mood) <= 40),
  note         text check (note is null or char_length(note) <= 2000),
  rating       smallint not null default 0 check (rating between 0 and 5),
  created_at   timestamptz not null default now(),

  -- Ownership is enforced by the database, not just by policy: the referenced
  -- fragrance must belong to the same user_id as the diary row.
  constraint sotd_entries_fragrance_fkey
    foreign key (fragrance_id, user_id)
    references public.fragrances (id, user_id) on delete cascade,

  -- One log per bottle per day. Makes the "log SOTD" tap idempotent: a double
  -- tap or a retried request cannot create a duplicate wear that would inflate
  -- every most-worn / rotation statistic.
  constraint sotd_entries_unique_per_day unique (user_id, fragrance_id, date)
);

alter table public.sotd_entries enable row level security;

create policy "sotd: owner reads"   on public.sotd_entries
  for select using ((select auth.uid()) = user_id);
create policy "sotd: owner inserts" on public.sotd_entries
  for insert with check ((select auth.uid()) = user_id);
create policy "sotd: owner updates" on public.sotd_entries
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sotd: owner deletes" on public.sotd_entries
  for delete using ((select auth.uid()) = user_id);

create index if not exists sotd_user_date_idx
  on public.sotd_entries (user_id, date desc);
create index if not exists sotd_user_fragrance_idx
  on public.sotd_entries (user_id, fragrance_id, date desc);

-- ---------------------------------------------------------------------------
-- settings
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  reminder_enabled     boolean not null default true,
  reminder_time        text not null default '09:00' check (reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  rediscover_enabled   boolean not null default true,
  theme_preference     text not null default 'system' check (theme_preference in ('system', 'dark', 'light')),
  currency             text not null default 'USD' check (char_length(currency) = 3),
  favorite_families    text[] not null default '{}'::text[],
  collection_size_band text check (collection_size_band is null or char_length(collection_size_band) <= 24),
  onboarded_at         timestamptz,
  updated_at           timestamptz not null default now()
);

alter table public.settings enable row level security;

create policy "settings: owner reads"   on public.settings
  for select using ((select auth.uid()) = user_id);
create policy "settings: owner inserts" on public.settings
  for insert with check ((select auth.uid()) = user_id);
create policy "settings: owner updates" on public.settings
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "settings: owner deletes" on public.settings
  for delete using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- subscriptions — mirrored FROM RevenueCat by webhook. The client may READ its
-- own row but never write one: entitlement truth comes from RevenueCat via the
-- service-role Edge Function, so a tampered client cannot grant itself premium.
-- (No insert/update/delete policy exists -> those are denied for every logged-in
-- user. The service-role key bypasses RLS entirely and does the writing.)
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  entitlement   text not null default 'premium',
  status        text not null default 'inactive'
                check (status in ('active', 'inactive', 'trial', 'grace', 'expired', 'paused')),
  product_id    text,
  store         text,
  period_type   text,
  expires_at    timestamptz,
  last_event_id text,
  updated_at    timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "subscriptions: owner reads" on public.subscriptions
  for select using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- billing_events — webhook idempotency ledger, keyed by the PROVIDER'S event id
-- so a replayed RevenueCat delivery is a no-op. Service-role only; no policies,
-- and RLS on means no client can read it at all.
-- ---------------------------------------------------------------------------
create table if not exists public.billing_events (
  event_id    text primary key,
  user_id     uuid references auth.users (id) on delete set null,
  event_type  text,
  received_at timestamptz not null default now(),
  payload     jsonb
);

alter table public.billing_events enable row level security;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists fragrances_touch_updated_at on public.fragrances;
create trigger fragrances_touch_updated_at
  before update on public.fragrances
  for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch_updated_at on public.settings;
create trigger settings_touch_updated_at
  before update on public.settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-provision profile + settings on signup (including anonymous signup), so
-- a brand-new user never hits a missing-row path on first launch.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
