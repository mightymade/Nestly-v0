-- Nestly database, part 3 of 4: file storage.
-- hostel-photos: public, so Explore loads photos fast. Files live in a folder named after the hostel id.
-- docs: private ID cards, selfies and ownership papers. Files live in a folder named after the owner's user id.
-- Profile photos and university logos are small and stay in the database as images, so they need no bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('hostel-photos', 'hostel-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('docs', 'docs', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "anyone views hostel photos" on storage.objects for select
  using (bucket_id = 'hostel-photos');
create policy "owners upload hostel photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'hostel-photos' and (public.owns_hostel((storage.foldername(name))[1]) or public.is_admin()));
create policy "owners replace hostel photos" on storage.objects for update to authenticated
  using (bucket_id = 'hostel-photos' and (public.owns_hostel((storage.foldername(name))[1]) or public.is_admin()));
create policy "owners delete hostel photos" on storage.objects for delete to authenticated
  using (bucket_id = 'hostel-photos' and (public.owns_hostel((storage.foldername(name))[1]) or public.is_admin()));

create policy "owners read own documents" on storage.objects for select to authenticated
  using (bucket_id = 'docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "owners upload own documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners replace own documents" on storage.objects for update to authenticated
  using (bucket_id = 'docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners delete own documents" on storage.objects for delete to authenticated
  using (bucket_id = 'docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
