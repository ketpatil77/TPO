alter table public.internships
    add column if not exists evidence_path text,
    add column if not exists evidence_mime text,
    add column if not exists evidence_bytes integer,
    add column if not exists evidence_sha256 text,
    add column if not exists evidence_uploaded_at timestamptz,
    add column if not exists proof_missing_since timestamptz,
    add column if not exists proof_deadline timestamptz,
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists updated_at timestamptz not null default now();

alter table public.certificates
    add column if not exists proof_missing_since timestamptz,
    add column if not exists proof_deadline timestamptz,
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists updated_at timestamptz not null default now();

update public.internships
set proof_missing_since = coalesce(proof_missing_since, created_at, now()),
    proof_deadline = coalesce(proof_deadline, coalesce(proof_missing_since, created_at, now()) + interval '48 hours')
where evidence_path is null;

update public.certificates
set proof_missing_since = coalesce(proof_missing_since, created_at, now()),
    proof_deadline = coalesce(proof_deadline, coalesce(proof_missing_since, created_at, now()) + interval '48 hours')
where evidence_path is null;

create or replace function public.maintain_proof_deadline()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if tg_op = 'INSERT' then
        new.created_at := coalesce(new.created_at, now());
        new.updated_at := coalesce(new.updated_at, now());
        if new.evidence_path is null then
            new.proof_missing_since := coalesce(new.proof_missing_since, new.created_at, now());
            new.proof_deadline := coalesce(new.proof_deadline, new.proof_missing_since + interval '48 hours');
        else
            new.proof_missing_since := null;
            new.proof_deadline := null;
        end if;
        return new;
    end if;

    new.updated_at := now();
    if new.evidence_path is not null then
        new.proof_missing_since := null;
        new.proof_deadline := null;
        return new;
    end if;

    if old.evidence_path is not null then
        new.proof_missing_since := now();
        new.proof_deadline := now() + interval '48 hours';
        return new;
    end if;

    if tg_table_name = 'internships' then
        if row(new.company, new.role, new.start_date, new.end_date, new.mode) is distinct from row(old.company, old.role, old.start_date, old.end_date, old.mode) then
            new.proof_missing_since := now();
            new.proof_deadline := now() + interval '48 hours';
        end if;
    elsif tg_table_name = 'certificates' then
        if row(new.name, new.issuer, new.date, new.mode) is distinct from row(old.name, old.issuer, old.date, old.mode) then
            new.proof_missing_since := now();
            new.proof_deadline := now() + interval '48 hours';
        end if;
    end if;

    new.proof_missing_since := coalesce(new.proof_missing_since, old.proof_missing_since, now());
    new.proof_deadline := coalesce(new.proof_deadline, old.proof_deadline, new.proof_missing_since + interval '48 hours');
    return new;
end;
$$;

drop trigger if exists internships_proof_deadline on public.internships;
create trigger internships_proof_deadline
before insert or update on public.internships
for each row execute function public.maintain_proof_deadline();

drop trigger if exists certificates_proof_deadline on public.certificates;
create trigger certificates_proof_deadline
before insert or update on public.certificates
for each row execute function public.maintain_proof_deadline();

create index if not exists internships_missing_proof_deadline_idx on public.internships (proof_deadline) where evidence_path is null;
create index if not exists certificates_missing_proof_deadline_idx on public.certificates (proof_deadline) where evidence_path is null;

alter table public.internships drop constraint if exists internships_verification_status_check;
alter table public.internships add constraint internships_verification_status_check check (verification_status in ('pending','approved','rejected'));
