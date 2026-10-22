# School OS

The complete software for running a school, by DREAM TEAM SERVICES.

> Don't make people learn the software. Make the software understand people.

The product is described in full in [docs/blueprint](docs/blueprint/README.md). It is built one
piece at a time, in the order in [06-build-order.md](docs/blueprint/06-build-order.md), and each
piece arrives as its own pull request.

## What is built so far

**Stage 1, piece 1: the foundation** (`08-platform-security.md` and `modules/00-global.md`)

- Sign in, sign out, sign out everywhere, signed-in devices and change password.
- New users set their own password from an invite link. Passwords are stored so nobody can read them.
- Five wrong passwords lock a login for 15 minutes, and the School Admin is told.
- Each school's data is walled off inside the database itself, with tests that try to break the walls.
- The ten ready roles and ten role templates from `05-roles.md`. The menu shows only what a role allows, and the server checks again.
- The top bar on every screen: Search, Approvals, Notifications, Messages, Profile, School switcher and Academic year.
- The phone layout: slide-out menu and the bottom bar with Home, Search, Approvals, Notifications and Me.
- An audit log that can never be changed or deleted.

Next: module 1, **Settings**.

## Running it on a computer

You need Node.js 22 and PostgreSQL 16.

```bash
cp .env.example .env          # then fill in every value
npm install
npm run db:setup              # once, as a PostgreSQL superuser: makes the database roles
npm run db:migrate            # builds the tables
npm run db:seed               # a demo school with a few users
npm run dev                   # open http://localhost:3000
```

Demo usernames: `principal` (two schools), `admin`, `accountant`, `teacher`, `librarian`, `viceprincipal` (sees, never changes),
and one for each other ready role: `subjectteacher`, `reception`, `transport` (Transport In-charge), `driver`, `warden` and
`boyswarden` (Hostel Warden), `store` (Store Keeper).
Their password is `DEMO_PASSWORD` from your `.env`.

## Backups

What School OS expects from hosting, and what it does itself (08-platform-security.md §4):

- **The database** is backed up by the hosting service: continuous backup with point-in-time restore
  (any moment of the last 7 days), a nightly copy kept 30 days, a monthly copy kept 1 year, in a second
  place in India. School OS does not do this itself. `scripts/backup.sh` makes an extra, encrypted nightly
  copy with `pg_dump` and records it, so every school sees "Last backup" in Data Backup & Security.
  It needs `BACKUP_DATABASE_URL`: a login that can read past row-level security (BYPASSRLS), because the
  owner login cannot dump the school tables.
- **Files** (photos, documents, receipts, report cards) are copied by the worker every hour
  (`schedule:file-backup`) to `BACKUP_S3_BUCKET` (or `BACKUP_FILES_DIR` on a computer), each with its
  SHA-256 checksum. `npm run backup:files` does it at once. Until one of them is set, file copies are off
  and Data Backup & Security says so.
- **Restore tests**: `npm run restore:test` makes a fresh dump (or takes `-- --dump FILE`), restores it into a
  scratch database `<database>_restore_test` on the same server, checks rows per school and that every file a
  record points to is in the file backup with the right checksum, writes a report to `restore-reports/`,
  records the result (shown to every school) and drops the scratch database. It needs `pg_dump` and
  `pg_restore` (`PG_BIN`) and `RESTORE_ADMIN_URL` (on a computer, the local `postgres` login is used).
  Run it once a month, and after any change to hosting.
- **Retention**: the worker's nightly `schedule:retention-check` lists records past the school's keeping
  periods for the School Admin (Settings, Data Backup & Security, Privacy) and clears old one-time codes and
  expired export files by itself.
- **Upload checks**: every upload is checked by its content, not its name; programs, web pages, scripts and
  Excel files with macros are refused, and photos lose their location data. A virus scanner (ClamAV's
  `clamd`) is used when `CLAMAV_HOST` is set; until then uploads are not scanned for viruses.

## Checks

```bash
npm run lint
npm run typecheck
npm test        # uses a separate school_os_test database
npm run build
```

The same checks run on every pull request.
