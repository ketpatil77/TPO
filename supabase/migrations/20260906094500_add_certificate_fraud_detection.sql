-- Human-in-the-loop certificate fraud detection metadata.
do $$ begin
  create type public.certificate_review_status as enum ('auto_clear','pending_review','approved','rejected');
exception when duplicate_object then null; end $$;

alter table public.certificates
  add column if not exists ocr_extracted_name text,
  add column if not exists name_match_score smallint,
  add column if not exists tamper_score smallint,
  add column if not exists phash varchar(16),
  add column if not exists duplicate_of_cert_id uuid references public.certificates(id) on delete set null,
  add column if not exists duplicate_matches jsonb not null default '[]'::jsonb,
  add column if not exists layout_anomaly_score smallint,
  add column if not exists review_status public.certificate_review_status not null default 'pending_review',
  add column if not exists flagged_reasons jsonb not null default '[]'::jsonb,
  add column if not exists ela_diff_path text,
  add column if not exists fraud_processed_at timestamptz,
  add column if not exists fraud_processing_error text,
  add column if not exists fraud_analysis_version text;

alter table public.certificates drop constraint if exists certificates_name_match_score_check;
alter table public.certificates add constraint certificates_name_match_score_check check (name_match_score is null or name_match_score between 0 and 100);
alter table public.certificates drop constraint if exists certificates_tamper_score_check;
alter table public.certificates add constraint certificates_tamper_score_check check (tamper_score is null or tamper_score between 0 and 100);
alter table public.certificates drop constraint if exists certificates_layout_anomaly_score_check;
alter table public.certificates add constraint certificates_layout_anomaly_score_check check (layout_anomaly_score is null or layout_anomaly_score between 0 and 100);
alter table public.certificates drop constraint if exists certificates_phash_check;
alter table public.certificates add constraint certificates_phash_check check (phash is null or phash ~ '^[0-9a-f]{16}$');

create index if not exists certificates_phash_idx on public.certificates(phash) where phash is not null;
create index if not exists certificates_review_status_idx on public.certificates(review_status, evidence_uploaded_at desc);

create table if not exists public.certificate_manual_audits (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references public.certificates(id) on delete cascade,
  student_id uuid not null,
  audit_month text not null check (audit_month ~ '^\\d{4}-\\d{2}$'),
  reason text not null check (reason in ('random_monthly','automated_flag')),
  status text not null default 'pending' check (status in ('pending','completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid,
  note text,
  unique(certificate_id,audit_month,reason)
);
create index if not exists certificate_manual_audits_queue_idx on public.certificate_manual_audits(status,audit_month,created_at);

-- Existing verified/rejected decisions remain authoritative after rollout.
update public.certificates set review_status = case
  when verification_status in ('verified','approved') then 'approved'::public.certificate_review_status
  when verification_status = 'rejected' then 'rejected'::public.certificate_review_status
  else review_status
end;
