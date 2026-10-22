# Running School OS for real schools

This page is for whoever sets up the servers. Nothing here has been deployed
yet: the owner chooses the hosting (decision 0001).

## What runs

| Part | Command | Notes |
|---|---|---|
| Web app | `npm run build && npm start` | Node.js 22. Put it behind HTTPS (the app sends HSTS). Two or more copies behind a load balancer for the 8 AM peak. |
| Background worker | `npm run worker` | Exactly the same code and settings as the web app. Runs messages, reminders, imports, exports, escalations. Run one or two copies; jobs are claimed safely. |
| Database | PostgreSQL 16 | Managed service in India (for example AWS RDS ap-south-1, Azure, GCP) with point-in-time recovery switched on. |
| Files | S3-compatible storage | Private bucket, India region. |
| Browser for PDFs | Chromium | Receipts, certificates, report cards. Set `CHROMIUM_PATH`. |

## First-time setup

1. Create the database, then, as a database superuser: `npm run db:setup`
   (makes the `school_os_owner` and `school_os_app` roles; set their passwords in the environment first).
2. `npm run db:migrate` with `MIGRATION_DATABASE_URL` (owner). Run this on every release before starting the new version.
3. Never run `npm run db:seed` or `db:reset` on a real database (both refuse to).
4. Create the first Super Admin (Owner) from the console's setup command, see the console section in README.

## Settings (from the host's secret store, never a file in the repository)

| Name | What it is |
|---|---|
| `DATABASE_URL` | Connection as `school_os_app` (cannot bypass the school walls). Use a pooler for many web copies. |
| `MIGRATION_DATABASE_URL` | Connection as `school_os_owner`, used only for migrations. |
| `FIELD_ENCRYPTION_KEY` | 32 random bytes, base64. Encrypts Aadhaar, bank accounts, gateway and messaging keys. Back it up separately: without it those fields cannot be read. |
| `FILE_LINK_SECRET` | Random secret that signs the 15-minute file links. |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` (optional; Cloudflare R2 works), `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` (or `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) | File storage. Without them files go to `STORAGE_DIR` on local disk (only for one-server setups). |
| `CHROMIUM_PATH` | Path to the Chromium binary for PDFs. |
| `APP_URL` | The public web address, used in links sent to parents and staff. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Email for invites and one-time codes. |
| `NODE_ENV=production` | Always, on real servers. |

School-specific keys (Razorpay, SMS, WhatsApp) are not environment settings:
each school enters its own in Settings, where they are stored encrypted.

The AI service is DREAM TEAM's, not a school's (gap list G28). All optional; with no key every school keeps School OS's own rules:

| Setting | What it is |
|---|---|
| `ANTHROPIC_API_KEY` | DREAM TEAM's platform key for the AI service. Empty: "not connected". |
| `AI_MODEL` | The model id, exactly as written (default `claude-opus-5-5`). |
| `AI_DAILY_LIMIT` | Most AI requests a day for any one school (default 100). |
| `AI_TIMEOUT_MS` | How long one request may take (default 20000). |
| `AI_INR_PER_USD` | Rupees to a dollar, for the estimated cost schools see (default 88). |
| `AI_GLOBAL_OFF` | `on` switches AI off for every school at once. |

Before setting the key: the AI service is outside India. Only what each task needs is sent (Smart Import sends column headings and descriptions of their values, never a value), restricted fields never are, and every request is logged without its content. Decide with the owner whether the consent texts (Settings, Data Backup & Security) need a new version naming the AI service before features that send personal details are built.

## Backups (08-platform-security.md §4)

- Switch on the database service's point-in-time recovery (7 days) and nightly snapshots (30 days), with a copy in a second Indian region.
- `scripts/backup.sh` makes an extra encrypted logical copy and uploads it; run it nightly. Record each monthly restore test.
- File storage: turn on versioning and a nightly copy to a second region.

## Before the first school goes live

- Security check of the whole product and a load test of the 8 AM attendance peak (§14).
- `npm test` green, including the isolation tests.
