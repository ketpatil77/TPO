alter table public.internships add column if not exists proof_notice_sent_at timestamptz;
alter table public.certificates add column if not exists proof_notice_sent_at timestamptz;

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
            new.proof_notice_sent_at := null;
        else
            new.proof_missing_since := null;
            new.proof_deadline := null;
            new.proof_notice_sent_at := null;
        end if;
        return new;
    end if;

    new.updated_at := now();
    if new.evidence_path is not null then
        new.proof_missing_since := null;
        new.proof_deadline := null;
        new.proof_notice_sent_at := null;
        return new;
    end if;

    if old.evidence_path is not null then
        new.proof_missing_since := now();
        new.proof_deadline := now() + interval '48 hours';
        new.proof_notice_sent_at := null;
        return new;
    end if;

    if tg_table_name = 'internships' then
        if row(new.company, new.role, new.start_date, new.end_date, new.mode) is distinct from row(old.company, old.role, old.start_date, old.end_date, old.mode) then
            new.proof_missing_since := now();
            new.proof_deadline := now() + interval '48 hours';
            new.proof_notice_sent_at := null;
        end if;
    elsif tg_table_name = 'certificates' then
        if row(new.name, new.issuer, new.date, new.mode) is distinct from row(old.name, old.issuer, old.date, old.mode) then
            new.proof_missing_since := now();
            new.proof_deadline := now() + interval '48 hours';
            new.proof_notice_sent_at := null;
        end if;
    end if;

    new.proof_missing_since := coalesce(new.proof_missing_since, old.proof_missing_since, now());
    new.proof_deadline := coalesce(new.proof_deadline, old.proof_deadline, new.proof_missing_since + interval '48 hours');
    new.proof_notice_sent_at := coalesce(new.proof_notice_sent_at, old.proof_notice_sent_at);
    return new;
end;
$$;
