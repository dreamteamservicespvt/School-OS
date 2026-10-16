# Building a module: the conventions

Read `CLAUDE.md`, then this page, then the module's spec in `docs/blueprint/modules/`.
Everything here exists so that 20 modules read as one product.

## 1. Where things go

| What | Where |
|---|---|
| Records (tables) | `prisma/schema/<module>.prisma`, one file per module. Names from `04-data-model.md`. |
| Database changes | `npm run db:new-migration -- <name>` after editing the schema; then `npm run db:migrate`. Read the SQL. |
| Rules and saving logic | `src/lib/<module>/*.ts` (server-only). Pages and actions call these; tests call these. |
| Pages | `src/app/(school)/<module-key>/...` (the key from `src/lib/modules.ts`, e.g. `fee-management`). |
| Server actions | `actions.ts` next to the page that uses them. |
| Tests | `tests/<module>/*.test.ts`, against the real test database. |
| Demo data | add a function to `prisma/seed.ts` (keep it idempotent). |

## 2. Data rules (never break these)

- **Every school record has `schoolId` (`school_id`)**. The migration helper adds row-level
  security to new tables with `school_id` by itself; `tests/isolation.test.ts` fails otherwise.
- **All school data access goes through `withSchool(current.ctx, async (tx) => ...)`**
  (`src/lib/db.ts`). Never use `prisma.<schoolModel>` directly; it returns nothing.
- **Never delete.** Archive with `archivedAt`. The app's database role has no DELETE right.
  Money and marks are corrected by reversal or adjustment with a reason (P5).
- **Audit:** every create, change, archive, approval and export calls `writeAudit(tx, ctx, {...})`
  in the same transaction, with `before` and `after` for changes (P14, rule 22).
- **Money** is `BigInt` paise (`amountPaise`). Show with `formatRupees()`. Parse typed rupees with
  `rupees()` from `src/lib/forms.ts`.
- **Dates**: date-only fields are `@db.Date`; show with `formatDate()` (DD-MM-YYYY).
- **Numbers that must be unique and never reused** (receipt, admission no., staff ID):
  `nextNumber(tx, ctx, key)` from `src/lib/sequences.ts`.
- **Relations:** inside your own `.prisma` file use normal Prisma relations. To point at a model
  in another file (Student, Staff, School...), store the id (`studentId String @db.Uuid`) and
  do **not** add a back-relation field to the other file. Add a foreign key in your migration
  SQL by hand if you want one.
- Sensitive fields (Aadhaar, bank account, keys): `encryptField()` and show `maskLast4()`
  unless the person may see the full value.
- Academic year: records of one school year carry `academicYearId`. Past (closed) years are
  read-only: check `isYearClosed()` before any change (src/lib/academic once it exists).

## 3. Permissions

- Pages start with `const current = await requirePage("<module-key>")`.
- Actions start with `const { current, reach } = await requireAction("<module-key>", "create")`.
  `reach` is `"all"` or `"own"`. With `"own"`, limit every query to the person's own classes
  or records (teachers: their Teacher Allocations; everyone: their own leave, slips, profile).
- Lists, search, exports and counts all use the same limits.
- Approvals: `requestApproval(tx, ctx, {...})` and `onDecision(type, handler)` from
  `src/lib/approvals.ts`. Register handlers in a file imported by `src/lib/approval-handlers.ts`.

## 4. Screens (00-global.md P1 to P20)

Use the kit; do not restyle per module.

- `PageHeader` (with pin), `Tabs` for a module's pages, `Card`/`CardHeader`/`CardBody`, `Detail`.
- Lists: `ListToolbar` + `DataTable` with `readListParams`, `skipTake`, `orderByFor`, 25 per page,
  filters in the URL, phone cards (`phone: "title" | "meta" | "badge"` on columns), export
  buttons through an export route using `buildExport` + `logExport`.
- Forms: `TextField`, `SelectField`, `TextArea`, `CheckboxField`, `ErrorSummary`,
  `SubmitButton`, `FormMessage`. Server actions return `FormState` using `parseForm(schema, fd)`
  with the helpers in `src/lib/forms.ts`. Keep what was typed on error (`values`).
- One main action per screen. Ask only what is needed; the rest under "More details".
- Confirm only risky, bulk, money or message actions with `ConfirmButton`; the button repeats
  the action ("Archive 3 students"); type-to-confirm for the most sensitive.
- After saving: `flash({ message, link, undo })` then `redirect()`; the toast shows it.
  Undo: `registerUndo(kind, handler)` in a file imported by `src/lib/undo-handlers.ts`.
- Empty states (`EmptyState`) say what is missing and give one button to fix it.
- Errors in plain words: what happened, why, what to do. Never show ids or codes.
- `loading.tsx` with `PageSkeleton` for slow pages.
- Colours only through the tokens (`bg-surface`, `text-ink-2`, `bg-brand`, `text-brand-text`,
  `bg-danger-soft`...). Never hard-coded colours: dark mode and themes must keep working.
- Touch targets at least 44px (`min-h-11`), labels on every field, keyboard works everywhere.
- Words: the blueprint's names exactly, and `00-global.md` §9 ("Archive", not "Delete").

## 5. Background work and messages

- Long work (exports over 2,000 rows, imports, bulk messages, batch printing):
  `enqueue(tx, ctx, kind, idempotencyKey, payload)` and `defineJob(kind, label, handler)`.
  Register in `src/lib/job-registry.ts`. Jobs must be safe to run twice.
- Timed work: `defineSchedule(name, everyMinutes, fn)`.
- Messages to parents and staff always go through Communication's `sendMessage` (once it
  exists); never call a provider directly.

## 6. Done means

`npm run lint && npm run typecheck && npm test && npm run build` all pass; the module's
"Done when" list in its spec is covered by tests where it is a rule; demo data in the seed
shows every screen with realistic content; every button works; phone and dark mode checked.
