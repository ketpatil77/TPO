# TPO Placement Portal

Secure student and Training & Placement Officer portal with profiles, resumes, roster administration, exports, placement drives, deterministic candidate matching, shortlists, and audit logs.

Live pilot: https://ait.ait-placement-portal.workers.dev

Operations and recovery: [`docs/OPERATIONS.md`](docs/OPERATIONS.md)

## Local development

1. Copy `.env.example` to `.env` and set a random `JWT_SECRET` of at least 32 characters.
2. Leave Supabase values empty for local JSON development. Resume upload and admin email login require Supabase.
3. Run `npm install`, then `npm start`.
4. Open `http://localhost:3000`.

Tests use isolated `data/db.test.json` and never use configured Supabase:

```powershell
npm.cmd test
npm.cmd run check
```

## Supabase setup

1. Create a development Supabase project.
2. Apply all versioned migrations using `npx.cmd supabase db push`.
3. Invite an admin through Supabase Auth.
4. Insert its UUID into `public.profiles` with role `admin` and status `active`.
5. Put project URL and server-only service-role key in backend secrets. Never expose service role to browser code.

## Cloudflare free pilot

Set secrets:

```powershell
npx.cmd wrangler secret put JWT_SECRET
npx.cmd wrangler secret put SUPABASE_URL
npx.cmd wrangler secret put SUPABASE_KEY
```

Set `ALLOWED_ORIGINS` to deployed origin, test with `npm.cmd run deploy:dry-run`, then run `npm.cmd run deploy`.

Production deploys use Cloudflare Workers Builds connected to `ketpatil77/TPO`:

- Production branch: `master`
- Build command: `npm run check`
- Deploy command: `npm run deploy`
- Worker: `ait`

Every push to `master` now triggers the production build automatically.

`keep_vars` is enabled in `wrangler.jsonc` so Git-triggered deploys preserve runtime variables configured on the existing Worker. Encrypted values remain Worker secrets and must never be committed or added as build variables.

The current pilot Worker is deployed at the live URL above. After deployment, verify `/api/health` returns 200, `/api/roster` returns 404, and an unauthenticated `/api/admin/students` request returns 401.

Cloudflare Workers serves static assets and Express API using current Node HTTP compatibility. Supabase Free may pause inactive projects and has storage/database quotas. Free pilot has no uptime SLA.

## Security and operations

- Export database and `resumes` bucket before migrations.
- Never run legacy scripts against production; they mutate records.
- Review Supabase Security and Performance Advisors after each migration.
- Rotate any secret accidentally shared or committed.
