// The teacher's pages at phone320, tablet768 and laptop1280 (phone390 was used for the journeys):
// sideways scrolling, unnamed controls, page errors, and words like undefined/NaN/null on screen.
import { as, visit, text, VIEWPORTS, shot, layoutIssues } from "./h.mjs";
import { close } from "../../lib.mjs";

const S5A = "b07ca58e-2716-4729-ab56-3cdf783e5598";
const PAGES = [
  "/dashboard",
  `/attendance-management?section=${S5A}&date=2026-10-18`,
  "/attendance-management/register",
  "/attendance-management/register/absences?date=2026-10-18",
  "/attendance-management/student-leave?status=all",
  "/attendance-management/reports",
  "/examination-results/marks",
  `/examination-results/marks/31218111-601c-49d2-b3b9-c8cbdf28bd7c/${S5A}`,
  "/examination-results/results",
  "/examination-results/report-cards",
  "/homework-learning",
  "/homework-learning/submissions?hw=dd2720d9-0ad1-474d-aba3-322cf1c40a6f",
  "/reports-analytics/early-warnings",
  "/staff-hr-management/leave",
  "/academic-management/time-table/mine?date=2026-10-28",
];
const vps = (process.env.VPS ?? "phone320,tablet768,laptop1280").split(",");
const who = process.env.WHO ?? "teacher";
const out = [];
for (const vp of vps) {
  const p = await as(who, VIEWPORTS[vp]);
  for (const u of PAGES) {
    const r = await visit(p, u, 1200);
    const li = await layoutIssues(p);
    const t = await text(p, 20000);
    const words = t.match(/\b(undefined|NaN|null|\[object Object\])\b|\{\{|\}\}/g);
    const probs = p.problems.splice(0);
    if (li.length || probs.length || words || (r && r.status() >= 400)) out.push({ vp, u, status: r?.status(), li, probs, words });
    console.log(`${vp} ${u} -> ${r?.status()} layout=${JSON.stringify(li)} problems=${JSON.stringify(probs)} words=${JSON.stringify(words)}`);
    await shot(p, `vp-${who}-${vp}-${u.replace(/[^a-z0-9]+/gi, "_").slice(0, 50)}`, false);
  }
  await p.context().close();
}
console.log("\nSUMMARY", JSON.stringify(out, null, 1));
await close();
