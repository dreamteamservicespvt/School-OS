# School OS code audit, 2026-10-31 (light version, one reviewer, local only)

The two earlier audits (2026-10-30 full test, 2026-10-31 delivery audit) tested behaviour in the browser.
This one read the code for security problems. No multi-agent `security-audit` run was made (ultracode off).

## Result
3 problems found, 3 fixed (commit b625e12c). Lint, typecheck and 2,333 of 2,333 tests passed before the
fixes; after them, typecheck plus 234 of 234 affected tests (headers, email, Communication) passed.

| # | Problem | Severity | Fix |
|---|---|---|---|
| 1 | No Content-Security-Policy header | Low (hardening) | `base-uri 'self'; object-src 'none'; frame-ancestors 'none'` on every page; tests/security-headers.test.ts |
| 2 | nodemailer 10.0.16 address-parser advisories (mail can go to a domain the header does not name) | Medium | 10.3.1 (same major) |
| 3 | re2js advisory | Low | npm audit fix |

## Checked and sound
- 13 of 13 API routes: Razorpay webhooks (HMAC, constant-time compare, per-school gateway lookup under
  row-level security), messaging webhooks, attendance devices (hashed keys), driver API, file links and
  calendar feed (HMAC with expiry), job tick (rate-limited, no data shown).
- Money: an online payment is posted once per gateway payment id under a row lock on the payment link.
- Sign-in (school and console): limits by address and by account, lockout, code tries capped.
- Public pages: Parent Link, /r receipt link, /pay, online admission form (code limits per address and per
  phone), uploads (content sniffed, web pages refused, files served with a sandbox CSP).
- Client address: X-Forwarded-For read from the right by TRUSTED_PROXY_HOPS, so limits cannot be dodged.
- Database: every table with school_id has row-level security on and forced, with a policy; the app's
  login has no DELETE or TRUNCATE on any table.
- Server actions: 136 of 136 files reach requireAction / requireCurrent / a link check before any change
  (scan followed helper functions across files); the one exception, console "Back", only clears a cookie.
- Raw SQL: every `$queryRawUnsafe` is parameterised or constant. No eval. The 3 `dangerouslySetInnerHTML`
  uses are QR SVGs made on the server. No secrets in git.

## Left as they are (reason)
`npm audit --omit=dev` still lists 16 entries; none is reachable in the live app:
- firebase → @firebase/firestore → @grpc/grpc-js: Firestore is never imported (only push messaging is used).
- prisma → @prisma/config → deepmerge-ts: the command-line tool reading our own config file.
- exceljs → archiver → minimatch/glob: glob patterns are never user input.
- zod 3.25.76 (memory use on oversized arrays; fixed only in zod 4): used in 18 signed-in academic forms,
  each behind requireAction. Moving to zod 4 changes error messages (`errorMap`), so do it as its own task.
