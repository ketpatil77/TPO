create or replace function public.reset_profile_evidence_verification()
returns trigger language plpgsql set search_path = public as $$
declare
  ignored text[] := array['verification_status','verified_by','verified_role','verified_at','verification_note','updated_at'];
begin
  if tg_table_name = 'certificates' then
    ignored := ignored || array['ocr_extracted_name','name_match_score','tamper_score','phash','duplicate_of_cert_id','duplicate_matches','layout_anomaly_score','review_status','flagged_reasons','ela_diff_path','fraud_processed_at','fraud_processing_error','fraud_analysis_version'];
  end if;
  if (to_jsonb(new) - ignored) is distinct from (to_jsonb(old) - ignored) then
    new.verification_status := 'pending';
    new.verified_by := null;
    new.verified_role := null;
    new.verified_at := null;
    new.verification_note := null;
  end if;
  return new;
end
$$;
