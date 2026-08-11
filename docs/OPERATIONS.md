# TPO Portal Operations

## Live services

- Application: `https://tpo-placement-portal.ketan-tpo-portal.workers.dev`
- Cloudflare Worker: `tpo-placement-portal`
- Supabase project: `lwqdrzxnrbuykvofutgs`

Free plans provide best-effort availability and enforce quotas. They do not provide a 100% uptime SLA.

## Health and smoke checks

```powershell
node -e "const b='https://tpo-placement-portal.ketan-tpo-portal.workers.dev'; Promise.all(['/api/health','/api/roster','/api/admin/students'].map(async p=>{const r=await fetch(b+p); console.log(p,r.status)}))"
```

Expected: health `200`, roster `404`, unauthenticated admin `401`.

Review Worker errors and request metrics in Cloudflare Workers Observability. Review Supabase Auth, API, Postgres, and Storage logs after authentication or upload failures.

## Manual backup

Create dated directory outside repository, then run:

```powershell
npx.cmd supabase db dump --linked --file "E:\TPO-backups\YYYY-MM-DD\schema.sql"
npx.cmd supabase db dump --linked --data-only --use-copy --file "E:\TPO-backups\YYYY-MM-DD\data.sql"
npx.cmd supabase storage cp --linked --recursive ss:///resumes "E:\TPO-backups\YYYY-MM-DD\resumes"
```

Never commit backup data or private resumes. Verify files exist and are non-empty before migrations or incident recovery.

## Recovery

1. Stop roster imports and profile writes.
2. Record latest healthy Worker version with `npx.cmd wrangler deployments list`.
3. Roll back Worker using Cloudflare deployment history when failure is code-only.
4. For database recovery, create a separate Supabase recovery project and restore schema/data there first.
5. Validate RLS, Auth, private resume access, and smoke checks before switching traffic.

## Secret rotation

- Worker uses modern Supabase secret API key stored through Wrangler secrets.
- Disable legacy Supabase JWT API keys only after every client uses modern publishable/secret keys.
- Update all dependent secrets before revoking old keys.
- Rotate `JWT_SECRET` only during a maintenance window; existing portal sessions will become invalid.

## Free-tier security exception

Supabase Security Advisor reports leaked-password protection disabled. Supabase documents this feature as Pro-only. Keep the free pilot at ₹0 by enforcing long admin passwords, login throttling, and lockouts; reassess this exception before production use.

## Release gate

```powershell
npm.cmd run check
npx.cmd supabase db lint --linked --level warning
npx.cmd supabase migration list --linked
npx.cmd wrangler deploy --dry-run
```

Then deploy, run live smoke checks, inspect logs, and commit exact release state.
