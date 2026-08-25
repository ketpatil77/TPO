alter table public.students add column if not exists avatar_path text;
alter table public.profiles add column if not exists avatar_path text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/jpeg', 'image/png'])
on conflict (id) do update set
  public = false,
  file_size_limit = 1048576,
  allowed_mime_types = array['image/jpeg', 'image/png'];
-- Avatar access stays server-mediated. Service key bypasses RLS; no browser role
-- receives direct object permissions, preventing cross-account enumeration.
drop policy if exists "Public avatar access" on storage.objects;
drop policy if exists "Authenticated avatar access" on storage.objects;
