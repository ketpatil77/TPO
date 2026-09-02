-- Certificate Vault metadata only. Actual certificate images live in private Cloudflare R2.
alter table public.certificates
    add column if not exists evidence_path text,
    add column if not exists evidence_mime_type text,
    add column if not exists evidence_size_bytes integer,
    add column if not exists evidence_sha256 text,
    add column if not exists evidence_uploaded_at timestamptz;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'certificates_evidence_mime_type_check'
    ) then
        alter table public.certificates
            add constraint certificates_evidence_mime_type_check
            check (evidence_mime_type is null or evidence_mime_type in ('image/jpeg', 'image/png', 'image/webp'));
    end if;

    if not exists (
        select 1 from pg_constraint where conname = 'certificates_evidence_size_check'
    ) then
        alter table public.certificates
            add constraint certificates_evidence_size_check
            check (evidence_size_bytes is null or (evidence_size_bytes > 0 and evidence_size_bytes <= 409600));
    end if;

    if not exists (
        select 1 from pg_constraint where conname = 'certificates_evidence_sha256_check'
    ) then
        alter table public.certificates
            add constraint certificates_evidence_sha256_check
            check (evidence_sha256 is null or evidence_sha256 ~ '^[0-9a-f]{64}$');
    end if;
end $$;

create index if not exists certificates_student_evidence_idx
    on public.certificates(student_id, evidence_uploaded_at desc)
    where evidence_path is not null;
