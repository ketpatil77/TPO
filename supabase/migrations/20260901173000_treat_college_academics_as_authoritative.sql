update public.students
set academic_verification_status = 'verified',
    academic_verification_note = 'College-supplied academic record',
    academic_verified_at = coalesce(academic_verified_at, now())
where academic_verification_status is distinct from 'verified';

alter table public.students
    alter column academic_verification_status set default 'verified';
