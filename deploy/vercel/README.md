# School OS test copy on Vercel

Import the repository into Vercel, attach a free Neon database, and School OS
sets itself up with the demo school (Sunrise Public School). Nothing else to
fill in.

**It is for trying the software only.** For a real school use the setup in
[docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md).

## Steps

1. On <https://vercel.com/new>, sign in with GitHub, **Import** the
   `school-os` repository and press **Deploy**. This first build stops with
   an error because there is no database yet. That is expected.
2. In the new project open **Storage → Create Database → Neon** (free plan),
   create it and connect it to the project for all environments.
3. Optional: **Settings → Environment Variables**, add `DEMO_PASSWORD` with
   the password everyone will sign in with. Without it the password is
   `SchoolOS@2026`.
4. **Deployments → the failed one → ⋯ → Redeploy.** The build makes the
   database roles, builds the tables, loads the demo school (about 5 minutes
   the first time) and builds the app.
5. Open the project's address, for example `https://school-os.vercel.app`.

## How it works

`vercel.json` runs [scripts/vercel-build.ts](../../scripts/vercel-build.ts).
When the app is on Vercel and neither `MIGRATION_DATABASE_URL` nor
`FIELD_ENCRYPTION_KEY` is set, [src/lib/test-copy-env.ts](../../src/lib/test-copy-env.ts)
works out every setting from the Neon password: the `school_os_owner` and
`school_os_app` roles and their connections, the encryption and link keys,
file storage in `/tmp` and the app's address. The app still connects as
`school_os_app`, so the school walls hold. Redeploys keep the data; the demo
is loaded only once.

## What does not work on Vercel

- **PDFs** (fee receipts, certificates, report cards): Vercel has no Chromium.
- **The background worker** does not run on Vercel. Instead, due jobs run
  right after the request that queued them, and the GitHub workflow
  `.github/workflows/job-tick.yml` calls `/api/v1/jobs/tick` every 5 minutes
  for reminders (src/lib/job-tick.ts). Long jobs (full exports, big imports)
  may hit Vercel's time limit.
- **Uploaded files** (photos, documents) are kept only briefly in `/tmp` and
  may not open later, unless file storage is set (`S3_BUCKET`, `S3_ENDPOINT`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`; Cloudflare R2 works).

The one-container copy in [deploy/test-copy](../test-copy/README.md) runs all
of these.

## Signing in

Usernames: `principal`, `admin`, `accountant`, `teacher`, `subjectteacher`,
`librarian`, `reception`, `transport`, `driver`, `warden`, `boyswarden`,
`store` and `viceprincipal`, all with `DEMO_PASSWORD`.

The Super Admin console is at `/console/sign-in` with the mobile number
`9849012345` and the same password. The test copy has no SMS or email, so the
code page shows the 6-digit code itself (the owner's choice); real deployments
never show or log codes.
