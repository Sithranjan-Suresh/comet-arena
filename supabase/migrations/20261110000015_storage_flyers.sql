-- Task 74: public `flyers` bucket. Flyers are public marketing material, so anyone may read them;
-- only signed-in students may write, and only inside their own folder.
-- The app uploads with the service role (which bypasses these policies); they are defense in depth for
-- any direct client upload and make the intended access explicit.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('flyers', 'flyers', true, 10485760, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy flyers_public_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'flyers');

-- Path convention: submissions/<user id>/<file>. A user may add and remove only files in their own folder.
create policy flyers_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'flyers'
    and (storage.foldername(name))[1] = 'submissions'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy flyers_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'flyers'
    and (storage.foldername(name))[1] = 'submissions'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
