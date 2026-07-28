-- ============================================================================
-- ScentKeep — collector depth.
--
-- Every field here came out of researching how collectors actually track their
-- collections (spreadsheet schemas, forum threads, competitor apps):
--
--   type            Collectors buy far more decants and samples than full
--                   bottles. Counting a 5 ml decant as a bottle wrecks both the
--                   collection value and any sense of what is on the shelf.
--   concentration   EDT / EDP / Parfum appears in every collector schema found.
--   house_tier      Designer / niche / indie / celebrity — the other universal one.
--   sprays_per_wear Input to the depletion estimate.
--   remaining_ml    A level the user has MEASURED, overriding the estimate.
--   remaining_ml_at When that measurement was taken. Depletion then counts only
--                   wears logged AFTER it, so a correction is not instantly
--                   undone by the history that preceded it.
--   wishlist_kind   Collectors keep "to buy" and "to try" as separate lists;
--                   conflating them makes the wishlist useless as a shopping list.
--
-- All columns are nullable or defaulted, so existing rows stay valid.
-- ============================================================================

alter table public.fragrances
  add column if not exists type text not null default 'bottle'
    check (type in ('bottle', 'decant', 'sample')),
  add column if not exists concentration text
    check (concentration is null or concentration in ('EDC', 'EDT', 'EDP', 'Parfum', 'Extrait', 'Oil')),
  add column if not exists house_tier text
    check (house_tier is null or house_tier in ('Designer', 'Niche', 'Indie', 'Celebrity', 'Clone')),
  add column if not exists sprays_per_wear smallint not null default 2
    check (sprays_per_wear between 1 and 20),
  add column if not exists remaining_ml numeric(7, 2)
    check (remaining_ml is null or (remaining_ml >= 0 and remaining_ml <= 10000)),
  add column if not exists remaining_ml_at timestamptz,
  add column if not exists wishlist_kind text not null default 'buy'
    check (wishlist_kind in ('buy', 'sniff'));

-- A measured level is meaningless without knowing WHEN it was measured — the
-- two columns are only ever written together, so the database enforces it
-- rather than trusting every future caller to remember.
alter table public.fragrances
  drop constraint if exists fragrances_remaining_ml_paired;
alter table public.fragrances
  add constraint fragrances_remaining_ml_paired
  check ((remaining_ml is null) = (remaining_ml_at is null));

comment on column public.fragrances.remaining_ml is
  'User-measured level in ml, overriding the wear-based estimate. Paired with remaining_ml_at.';
comment on column public.fragrances.remaining_ml_at is
  'When remaining_ml was measured. Depletion counts only wears created after this instant.';

-- The wishlist splits into two lists, so the index that backs it must too.
drop index if exists fragrances_user_wishlist_idx;
create index if not exists fragrances_user_wishlist_idx
  on public.fragrances (user_id, in_wishlist, wishlist_kind, created_at desc);

-- Running-low lookups scan owned rows with a size.
create index if not exists fragrances_user_type_idx
  on public.fragrances (user_id, type) where in_wishlist = false;
