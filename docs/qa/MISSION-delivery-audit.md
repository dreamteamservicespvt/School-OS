# Final client-delivery audit (from the user, 2026-10-30 night; client demo and delivery on 2026-10-31)

Do not ask the user anything (asleep). Decide yourself and write each decision in the report.
Local demo only. Local commits only; never push, deploy, or touch the live site, the Meta webhook or the gym setup.
It extends docs/qa/MISSION-autonomous-qa.md (read it too).

## The question
"If I give this software to the school tomorrow, what can go wrong?" Find it first. For every problem ask:
would the client be embarrassed to find it during the presentation? If yes, fix it (reproduce → root cause →
fix → regression test → rerun related tests). Never fake a PASS: PASS · FAIL · BLOCKED · NOT IMPLEMENTED ·
NEEDS EXTERNAL SERVICE · NEEDS PRODUCT DECISION.

## Priorities (in this order)
1. Financial safety: one payment = one transaction = one receipt. Partial, full, advance, discount, concession,
   fine, refund, cancellation, duplicate payment (double click, two tabs), failed payment, retry, online callback
   replayed. Ledger, receipt, Finance/Day Book, dashboard, reports, Parent Link and Audit Log must agree.
2. Cross-school isolation: two schools; search, URLs, API routes, server actions, exports, downloads, reports,
   documents, Ask/AI, notifications. Zero access either way.
3. Role permissions, server side: every role in docs/blueprint/05-roles.md sees what it should and nothing else;
   server actions called directly by a role that lacks the action.
4. Demo embarrassments: test123/asdf/dummy/"Self-test"/QA leftovers in the DEMO data the client will see;
   TODO/FIXME/console.log/lorem/placeholder/debug text that reaches a screen; dead links; broken images;
   technical or stack-trace errors; console errors. Clean the demo data (seed or scripted cleanup), never real
   children's data.
5. Daily-work speed for a first-time user: Principal (30 s: what needs me?), Accountant (collect a fee now),
   Teacher (take attendance), Receptionist (parent at the desk), Parent (fee balance).
6. End-to-end flows: Admission; Student; Attendance → absence message → report; Fees; Finance; Exams → report
   card; Staff → leave → payroll → payslip; Communication; Transport; Front Office visitors; Student exit/TC;
   Academic year promotion.
7. Breaking input, double submit, refresh/back, session expiry, concurrency, large lists, failure states
   (message failure, upload failure, payment failure) never shown as success.
8. Mobile 320/375/390/414/768/1024/1280/1440: overflow, modals, forms that cannot be finished.
9. Final: lint, typecheck (NODE_OPTIONS=--max-old-space-size=8192 if it runs out of memory), npm test, build.

## Report
docs/qa/2026-10-31-delivery-audit.md: platform status, modules/workflows/roles tested, security, financial
integrity, data integrity, UI/UX, mobile, AI, bugs found/fixed/remaining, blocked tests, client risks, and a gate:
GREEN READY / YELLOW READY WITH KNOWN LIMITATIONS / RED NOT READY. Never READY just because the build passes.
