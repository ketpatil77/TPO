-- Keep internship verification states consistent with certificates and ranking logic.
-- Approved internship proofs are stored as `verified` so downstream scoring and UI
-- can use one canonical status across proof-managed records.

alter table public.internships
    drop constraint if exists internships_verification_status_check;

update public.internships
set verification_status = 'verified'
where verification_status = 'approved';

alter table public.internships
    add constraint internships_verification_status_check
    check (verification_status = any (array['pending'::text, 'verified'::text, 'rejected'::text]));
