-- ============================================================================
-- ScentKeep — bottle photo storage.
--
-- Private bucket. Every object lives under a folder named for its owner's uid
-- (`<user_id>/<fragrance_id>.jpg`), and each policy checks that first path
-- segment against auth.uid(). So even with a valid token, a user can only touch
-- their own photos, and nothing is world-readable (brief §5: per-user access).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bottle-photos',
  'bottle-photos',
  false,
  5242880, -- 5 MB; the client downscales before upload
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "bottle photos: owner reads"   on storage.objects;
drop policy if exists "bottle photos: owner inserts" on storage.objects;
drop policy if exists "bottle photos: owner updates" on storage.objects;
drop policy if exists "bottle photos: owner deletes" on storage.objects;

create policy "bottle photos: owner reads" on storage.objects
  for select using (
    bucket_id = 'bottle-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "bottle photos: owner inserts" on storage.objects
  for insert with check (
    bucket_id = 'bottle-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "bottle photos: owner updates" on storage.objects
  for update using (
    bucket_id = 'bottle-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id = 'bottle-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "bottle photos: owner deletes" on storage.objects
  for delete using (
    bucket_id = 'bottle-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
