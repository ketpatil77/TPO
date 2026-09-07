create or replace function public.reset_profile_evidence_verification()
returns trigger
language plpgsql
as $fn$
begin
  if (to_jsonb(new) - array['verification_status','verified_by','verified_role','verified_at','verification_note']) is distinct from (to_jsonb(old) - array['verification_status','verified_by','verified_role','verified_at','verification_note']) then
    new.verification_status := 'pending';
    new.verified_by := null;
    new.verified_role := null;
    new.verified_at := null;
    new.verification_note := null;
  end if;
  return new;
end;
$fn$;

drop index if exists public.certificates_phash_idx;
drop index if exists public.certificates_review_status_idx;
drop index if exists public.certificate_manual_audits_queue_idx;
drop table if exists public.certificate_manual_audits;

alter table public.certificates
  drop column if exists ocr_extracted_name,
  drop column if exists name_match_score,
  drop column if exists tamper_score,
  drop column if exists phash,
  drop column if exists duplicate_of_cert_id,
  drop column if exists duplicate_matches,
  drop column if exists layout_anomaly_score,
  drop column if exists review_status,
  drop column if exists flagged_reasons,
  drop column if exists ela_diff_path,
  drop column if exists fraud_processed_at,
  drop column if exists fraud_processing_error,
  drop column if exists fraud_analysis_version;

drop type if exists public.certificate_review_status;
