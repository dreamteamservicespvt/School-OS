# 0001. Technology and project layout

Decided: 9 October 2026, at the start of Stage 1. The blueprint leaves the technology open
(README, "How to give this to Claude Code", step 3), so this records the choice and why.

## In plain words

School OS is a website that installs on phones like an app. It is written in one language
(TypeScript) from screen to database, uses the most widely used tools for this kind of
software, and keeps each school's data apart inside the database itself, not only in the code.

## The choices

| Part | Choice | Why |
|---|---|---|
| Screens and server | Next.js 16 with React 19, TypeScript | The most used way to build a web app that works on phones, tablets and computers and installs as an app (00-global.md §6). One language end to end; easy to hire for. |
| Database | PostgreSQL 16 | Reliable, free, offered by every cloud in India with continuous backup and point-in-time restore (08 §4). Its row-level security enforces "each school's data stays its own" (08 §1) even if the app code has a bug. |
| Database access | Prisma 6 | Typed access to the records in 04-data-model.md, and numbered migrations so every change keeps existing schools' data working (08 §14 rule 2). |
| Passwords | Argon2id (`@node-rs/argon2`) | The current recommended way to store passwords so they cannot be read back (08 §2). |
| Sensitive fields | AES-256-GCM, key from the secret store | Extra encryption for Aadhaar, bank account and gateway keys, shown masked (08 §3). |
| Styling | Tailwind CSS 4 | Consistent screens with little code; easy to meet WCAG 2.1 AA (08 §14 rule 6). |
| Tests | Vitest, against a real PostgreSQL database | The isolation tests must run against the real database rules, not a pretend one. |
| Checks on every change | GitHub Actions | Lint, type check, tests and a full build on every pull request. |

## How each school's data is kept apart

1. Every school record has a `school_id`.
2. The running app connects to the database as `school_os_app`. That role cannot switch off
   row-level security and has no permission to delete anything.
3. All school work goes through `withSchool()` (src/lib/db.ts). It tells the database the
   school and person for one transaction. The database then shows and accepts only that
   school's rows.
4. tests/isolation.test.ts tries to read, search, count, change, write and delete another
   school's records, and checks each attempt fails.

## Project layout

```text
docs/blueprint/        the product blueprint (source of truth)
docs/source/           the plan and feature map the blueprint came from
docs/decisions/        technology decisions like this one
prisma/schema.prisma   the records (names from 04-data-model.md)
prisma/migrations/     numbered database changes, with the security rules
prisma/seed.ts         a demo school for trying the screens
src/app/               pages: sign-in, invite, and the school screens under (school)/
src/components/        the top bar, menu, search and shared screen pieces
src/lib/               rules: database walls, roles, permissions, audit log, sign-in
tests/                 checks for the key rules
```

## Hosting (open)

Not chosen yet; needed before the first school's real data goes in (08 §13). It must keep
data in India (08 §1) and give continuous database backup with point-in-time restore,
nightly copies and a second region (08 §4). Any managed PostgreSQL in an Indian region
(for example AWS Mumbai or Google Cloud Mumbai) with a Node.js host fits this code without changes.
