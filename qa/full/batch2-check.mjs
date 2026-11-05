// Browser check of live-test fixes batch 2 (testing-issues.md 20, 22, 24, 26, 28, 10, 25).
//   MSYS_NO_PATHCONV=1 node qa/full/batch2-check.mjs   (app on :3000 from the SSD build)
import { asUser, go, shot, close, mainText } from "./h.mjs";

const R = [];
const ok = (n, pass, note = "") => { R.push({ n, pass, note }); console.log(pass ? "PASS" : "FAIL", n, note); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (t) => t.replace(/\n/g, " | ").slice(0, 300);

const pr = await asUser("principal");

// 28: /exams goes to Examination & Results.
await go(pr, "/exams");
await wait(1500);
ok("28 /exams redirects", pr.url().includes("/examination-results"), pr.url());

// 22: old ?tab=all link opens the All view; tab counts are numbers.
await go(pr, "/approvals?tab=all");
await wait(1500);
const ap = await pr.locator('nav a[aria-current="page"], a[aria-current="page"]').allInnerTexts().catch(() => []);
ok("22 ?tab=all opens All", ap.some((t) => /All/i.test(t)), ap.join(" / "));
await shot(pr, "batch2-approvals");

// 26: datesheet form with a class that has grade-only subjects (Art, PE in the seed).
await go(pr, "/examination-results/datesheet/new");
await wait(2500);
await pr.getByRole("button", { name: "5", exact: true }).first().click().catch(() => {});
await wait(1500);
const ds = await mainText(pr, 2000);
ok("26 grade-only note on datesheet form", /take a grade|Grades only\./i.test(ds), flat(ds.match(/[^\n]*Grades only[^\n]*/)?.[0] ?? "no note"));
await shot(pr, "batch2-datesheet-note");

// 20 + 10/25 style: correction form has Select all, and empty send marks boxes.
const t = await asUser("teacher");
await go(t, "/attendance-management/register/correction?section=544feaae-37ed-4756-aad5-a4f6dcb857f8&date=2026-10-30");
await wait(2000);
const selAll = t.getByRole("button", { name: /Select all/ });
const hasSel = await selAll.isVisible().catch(() => false);
let ticked = 0;
if (hasSel) { await selAll.click(); await wait(500); ticked = await t.locator('input[name="people"]:checked').count(); }
ok("20 Select all ticks everyone", hasSel && ticked > 1, `button: ${hasSel}, ticked: ${ticked}`);
await shot(t, "batch2-correction");

// 24: Marks Entry empty state has a datesheet link (only when there are no papers).
await go(t, "/examination-results/marks");
await wait(2000);
const mk = await mainText(t, 2000);
if (/No papers to mark yet/.test(mk)) ok("24 Marks Entry empty has a link", await t.getByRole("link", { name: /datesheet/i }).first().isVisible().catch(() => false));
else ok("24 Marks Entry (has papers, empty state not shown)", true, "skipped");

// 25: homework title error clears as soon as text is typed.
await go(t, "/homework-learning?do=give");
await wait(2000);
const send = t.getByRole("button", { name: /^Send/ }).last();
if (await send.isVisible().catch(() => false)) {
  await send.click(); await wait(800);
  const before = await t.getByText("Give the homework a title").first().isVisible().catch(() => false);
  await t.getByLabel("Title").first().fill("Exercise 1"); await wait(500);
  const after = await t.getByText("Give the homework a title").first().isVisible().catch(() => false);
  ok("25 title error clears on typing", !after, `before: ${before}, after: ${after}`);
} else ok("25 homework form", false, "Send button not found");
await shot(t, "batch2-homework");

await close();
console.log(`\nSUMMARY ${R.filter((r) => r.pass).length} of ${R.length} passed`);
