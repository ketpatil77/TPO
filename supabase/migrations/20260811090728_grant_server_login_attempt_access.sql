-- Login throttling is backend-only. Modern secret keys act as service_role,
-- which still needs table privileges before its RLS bypass can be evaluated.
revoke all on public.login_attempts from anon, authenticated;
grant select, insert, update, delete on public.login_attempts to service_role;
