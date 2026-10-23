# School OS
Read docs/PROJECT-CONTEXT.md first: where the project stands, open work and how the owner likes to work.
The product blueprint is in docs/blueprint/. Read docs/blueprint/README.md before any work.
Build one module at a time, in the order in docs/blueprint/06-build-order.md.
Module names, page names and record names must match the blueprint exactly.
Never build anything listed under "Not included" in docs/blueprint/README.md.
Follow the "Decisions made" in docs/blueprint/README.md: Razorpay first, fee payments are never deleted, no Transport in version 1, report cards and Parent Link in version 1.
Follow docs/blueprint/08-platform-security.md for every module, and its "Rules for the builder":
never put a password, key or secret in the code; keep every school's existing data working
after each database change; let new features be switched on school by school; test that
one school can never see another school's data.

## How the code keeps those rules

- Technology and layout: docs/decisions/0001-technology.md.
- Every read or write of a school's records goes through `withSchool()` in src/lib/db.ts.
  PostgreSQL row-level security (prisma/migrations/*_foundation) hides every other school's
  rows. A new school table must get `school_id`, row-level security and a policy in its
  migration, and a line in tests/isolation.test.ts.
- The app's database role has no DELETE permission. Records are archived (`archived_at`).
- Audit Log Entries are written with `writeAudit()` in the same transaction as the change.
- Permissions: src/lib/roles.ts copies docs/blueprint/05-roles.md, and
  tests/permissions.test.ts reads that file to prove they match. Check permissions on the
  server with `requireAction()` in src/lib/current.ts before any change.
- New features can be switched on per school with the School Feature record.
- Money is stored in whole paise (BigInt). Show it with `formatRupees()`; dates with `formatDate()`.
- Screen words follow docs/blueprint/modules/00-global.md §9 and patterns P1 to P20.
- When a module's screens are built, add its key to `BUILT_MODULES` in src/lib/modules.ts.

## Commands

npm run lint · npm run typecheck · npm test · npm run build
Tests need PostgreSQL and the roles from `npm run db:setup` (see README.md).
