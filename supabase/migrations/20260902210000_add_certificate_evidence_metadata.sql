-- Certificate Vault metadata only. Actual certificate images live in private Cloudflare R2.
alter table public.certificates
    add column if not exists evidence_path text,
    add column if not exists evidence_mime text,
    add column if not exists evidence_bytes integer,
    add column if not exists evidence_sha256 text,
    add column if not exists evidence_uploaded_at timestamptz;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'certificates_evidence_mime_check') then
        alter table public.certificates add constraint certificates_evidence_mime_check
            check (evidence_mime is null or evidence_mime in ('image/jpeg', 'image/png'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'certificates_evidence_bytes_check') then
        alter table public.certificates add constraint certificates_evidence_bytes_check
            check (evidence_bytes is null or (evidence_bytes > 0 and evidence_bytes <= 409600));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'certificates_evidence_sha256_check') then
        alter table public.certificates add constraint certificates_evidence_sha256_check
            check (evidence_sha256 is null or evidence_sha256 ~ '^[0-9a-f]{64}$');
    end if;
end $$;

create index if not exists certificates_student_evidence_idx
    on public.certificates(student_id, evidence_uploaded_at desc)
    where evidence_path is not null;
