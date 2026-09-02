alter table public.certificates
  add column if not exists evidence_path text,
  add column if not exists evidence_mime text,
  add column if not exists evidence_bytes integer,
  add column if not exists evidence_sha256 text,
  add column if not exists evidence_uploaded_at timestamptz;

alter table public.certificates
  drop constraint if exists certificates_evidence_mime_check;
alter table public.certificates
  add constraint certificates_evidence_mime_check
  check (evidence_mime is null or evidence_mime in ('image/jpeg','image/png'));

alter table public.certificates
  drop constraint if exists certificates_evidence_bytes_check;
alter table public.certificates
  add constraint certificates_evidence_bytes_check
  check (evidence_bytes is null or (evidence_bytes > 0 and evidence_bytes <= 409600));

create index if not exists certificates_evidence_path_idx
  on public.certificates(evidence_path)
  where evidence_path is not null;
