# School OS Assistant: build and test log

Branch `claude/ai-assistant` (worktree D:/all/Projects/School-OS-assistant). Design: docs/assistant/plan.md
(section 10 says what is built). Tests use database worker 6 (`node qa/vitest-worker.mjs 6 <files>`, PowerShell).

## 15 Nov 2026: conversation core

Built: language module, read tools, planner and composer prompts, number guard, Assistant Conversation record
(migration 20261115120000_assistant_conversation, row-level security), add-enquiry card, server actions,
panel (mounted only when the switch allows), eval set (37 cases) with a fake model, live eval (skipped).

Runs:
- `npx tsc --noEmit -p .`: clean. ESLint on the new files: clean (after 2 small fixes).
- tests/assistant + tests/assistant-eval + tests/ai/one-gateway: 6 files, 90 passed, 1 skipped (the live eval).
- With tests/isolation, campus-guard, i18n, ai, ask, settings: 444 passed, 2 timed out: the i18n key scan
  (20 s limit; passes with a longer limit, the D: drive is slow) and settings/documents "prints the preview to a
  PDF" (60 s browser print; untouched by this work).

No live (paid) model call was made. Live check, after the owner's OK:
`$env:ASSISTANT_EVAL_LIVE="1"; $env:ASSISTANT_EVAL_KEY="<platform key>"; node qa/vitest-worker.mjs 6 tests/assistant-eval/live.test.ts`

Not checked yet: the panel in a real browser (screenshots at 390 and 1440 px, light and dark), real voice
recognition and voices on a phone (plan section 5 test), the live eval.
