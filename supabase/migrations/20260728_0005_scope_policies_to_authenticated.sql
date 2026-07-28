-- ============================================================================
-- ScentKeep — scope every policy to the `authenticated` role.
--
-- The policies were created without a TO clause, which defaults to `public` and
-- therefore includes the `anon` role (requests with no session at all). In
-- practice that was already safe: for `anon`, `auth.uid()` is NULL, so
-- `(select auth.uid()) = user_id` evaluates to NULL and the row is denied —
-- which scripts/test-rls.js verifies against the live database.
--
-- But relying on that is relying on a NULL comparison rather than on an explicit
-- grant, and Supabase's `auth_allow_anonymous_sign_ins` advisor rightly flags
-- it. Naming the role makes the intent explicit and fails closed by
-- construction rather than by evaluation.
--
-- Note: an anonymously signed-in Supabase user holds the `authenticated` role
-- (with is_anonymous: true in the JWT), NOT the `anon` role — so this does not
-- affect the anonymous-first flow at all.
-- ============================================================================

-- profiles -------------------------------------------------------------------
drop policy if exists "profiles: owner reads"   on public.profiles;
drop policy if exists "profiles: owner inserts" on public.profiles;
drop policy if exists "profiles: owner updates" on public.profiles;
drop policy if exists "profiles: owner deletes" on public.profiles;

create policy "profiles: owner reads"   on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: owner inserts" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles: owner updates" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles: owner deletes" on public.profiles for delete to authenticated using ((select auth.uid()) = id);

-- fragrances -----------------------------------------------------------------
drop policy if exists "fragrances: owner reads"   on public.fragrances;
drop policy if exists "fragrances: owner inserts" on public.fragrances;
drop policy if exists "fragrances: owner updates" on public.fragrances;
drop policy if exists "fragrances: owner deletes" on public.fragrances;

create policy "fragrances: owner reads"   on public.fragrances for select to authenticated using ((select auth.uid()) = user_id);
create policy "fragrances: owner inserts" on public.fragrances for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "fragrances: owner updates" on public.fragrances for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "fragrances: owner deletes" on public.fragrances for delete to authenticated using ((select auth.uid()) = user_id);

-- sotd_entries ---------------------------------------------------------------
drop policy if exists "sotd: owner reads"   on public.sotd_entries;
drop policy if exists "sotd: owner inserts" on public.sotd_entries;
drop policy if exists "sotd: owner updates" on public.sotd_entries;
drop policy if exists "sotd: owner deletes" on public.sotd_entries;

create policy "sotd: owner reads"   on public.sotd_entries for select to authenticated using ((select auth.uid()) = user_id);
create policy "sotd: owner inserts" on public.sotd_entries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "sotd: owner updates" on public.sotd_entries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sotd: owner deletes" on public.sotd_entries for delete to authenticated using ((select auth.uid()) = user_id);

-- settings -------------------------------------------------------------------
drop policy if exists "settings: owner reads"   on public.settings;
drop policy if exists "settings: owner inserts" on public.settings;
drop policy if exists "settings: owner updates" on public.settings;
drop policy if exists "settings: owner deletes" on public.settings;

create policy "settings: owner reads"   on public.settings for select to authenticated using ((select auth.uid()) = user_id);
create policy "settings: owner inserts" on public.settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "settings: owner updates" on public.settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "settings: owner deletes" on public.settings for delete to authenticated using ((select auth.uid()) = user_id);

-- subscriptions --------------------------------------------------------------
-- Read-only for the owner; still no write policy, so only the service-role
-- webhook can change entitlement state.
drop policy if exists "subscriptions: owner reads" on public.subscriptions;
create policy "subscriptions: owner reads" on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);

-- storage --------------------------------------------------------------------
drop policy if exists "bottle photos: owner reads"   on storage.objects;
drop policy if exists "bottle photos: owner inserts" on storage.objects;
drop policy if exists "bottle photos: owner updates" on storage.objects;
drop policy if exists "bottle photos: owner deletes" on storage.objects;

create policy "bottle photos: owner reads" on storage.objects
  for select to authenticated
  using (bucket_id = 'bottle-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "bottle photos: owner inserts" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bottle-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "bottle photos: owner updates" on storage.objects
  for update to authenticated
  using (bucket_id = 'bottle-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'bottle-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "bottle photos: owner deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'bottle-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
