# Certificate Vault (R2) - Release Plan

Status: staged on `feature/certificate-vault-r2`. Do not merge or deploy until release review.

## Goal

Store student certificate proof images privately without increasing normal dashboard latency or consuming Supabase file storage.

## Final v1 rules

- Student input: JPG, JPEG, or PNG only.
- PDF certificate evidence is not supported.
- Browser-side processing converts the selected image to an optimized JPEG before upload.
- Target optimized size: about 300 KB.
- Hard stored-file limit: 400 KB.
- Compression dimensions step down through roughly 1800, 1600, and 1400 px on the long side when required.
- Per-student certificate evidence quota: 15 MB.
- Actual files live in private Cloudflare R2.
- Supabase stores certificate metadata and the R2 object path only.
- Certificate proof images are never preloaded with profile, overview, ranking, or certificate-list data.
- One image is fetched only when an authorized user selects `View proof`.
- Existing certificate records remain valid without evidence and can add proof later.
- New certificate UI requires an image proof.
- Replacing proof replaces the previous R2 object.
- Deleting a certificate cleans its R2 object through the evidence route mounted before legacy CRUD.

## Cloudflare configuration

Expected private R2 bucket:

`ait-certificate-vault`

Expected Worker binding:

`CERTIFICATE_EVIDENCE`

The branch `wrangler.jsonc` contains this binding. The production bucket must exist before this branch is merged/deployed.

Do not make the bucket public. Reads go through authenticated Worker routes.

## Supabase metadata

Release migration:

`supabase/migrations/20260902191500_add_certificate_evidence_metadata.sql`

It adds these nullable columns to `public.certificates`:

- `evidence_path`
- `evidence_mime`
- `evidence_bytes`
- `evidence_sha256`
- `evidence_uploaded_at`

The migration also restricts stored evidence MIME to `image/jpeg` or `image/png`, limits metadata size to 409600 bytes, and indexes populated evidence paths.

The migration must be applied during the release procedure, not merely because the branch exists.

## API

Student routes are implemented in `src/routes/certificateEvidence.js` and mounted before the legacy student router.

- `GET /api/student/certificate-evidence/status`
  - returns R2 readiness and the student's 15 MB quota usage
- `POST /api/student/certificate-evidence/:id`
  - owner-only image upload
  - multipart field: `evidence`
  - verifies file magic, size, ownership, quota, and SHA-256
- `GET /api/student/certificate-evidence/:id`
  - owner-only lazy private image read
- `DELETE /api/student/certificate-evidence/:id`
  - removes proof metadata and R2 object
- `DELETE /api/student/certificates/:id`
  - shadows legacy certificate deletion so proof cleanup runs with certificate deletion

## Client behavior

`public/js/certificate-vault-ui.js` is loaded only on Student Workspace.

It does not make a Certificate Vault request on login. The only status request is made when the Add/Edit Certificate modal is opened. Certificate image bytes are requested only when `View proof` is selected.

This is deliberate. Stored object count should not affect normal portal performance because images are not part of profile/ranking payloads.

## Release checklist for tomorrow

1. Review branch diff against `master`.
2. Create the private R2 bucket `ait-certificate-vault` if it does not already exist.
3. Confirm Worker R2 binding `CERTIFICATE_EVIDENCE` points to that bucket.
4. Apply `20260902191500_add_certificate_evidence_metadata.sql` to the production Supabase project.
5. Run syntax/tests and `wrangler deploy --dry-run` from the branch.
6. Test with a non-production/sample student flow:
   - JPG upload
   - PNG upload
   - PDF rejection
   - large source image browser compression
   - >400 KB server rejection
   - proof view
   - proof replacement
   - certificate deletion/R2 cleanup
   - 15 MB quota handling
   - existing certificate without proof
   - no certificate requests during student login
7. Confirm Student Workspace, Ranking, TPO, and existing certificate metadata still work.
8. Merge to `master` only after the above passes.
9. Verify GitHub CI and Cloudflare production deployment after merge.

## Follow-up scope

TPO/Admin proof viewing and verification UX can be added as a separate follow-up after student upload/storage is stable. Keeping staff review separate reduces risk in the first release.
