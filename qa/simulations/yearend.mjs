// Academic year transition, look only (Chaitanya): the Principal opens the "Open 2027-28" sheet
// and the Promotion review for Grade 5 A, reads what they say, and stops before confirming.
// Nothing is confirmed; the year and the students are checked to be unchanged afterwards.
//   node qa/simulations/yearend.mjs
import { as, visit, text, shot, record, done, close, sql, SCHOOL_A } from "./sim-lib.mjs";

const A = "sim-yearend";
const years = () => sql(`select name, status from academic_year where school_id='${SCHOOL_A}' and archived_at is null order by name`).map((r) => r.join(":")).join(", ");
const batches = () => sql(`select count(*) from promotion_batch where school_id='${SCHOOL_A}'`)[0][0];
const g5aActive = () => sql(`select count(*) from enrolment e join student s on s.id=e.student_id where e.section_id='949e25d2-78bc-48aa-a6b6-7fd678175201' and e.archived_at is null and s.status='ACTIVE'`)[0][0];
const before = { years: years(), batches: batches(), g5a: g5aActive() };

const pr = await as("cems.principal");
await visit(pr, "/academic-management/settings");
const open = pr.getByRole("button", { name: /^Open 2027-28/ }).or(pr.getByRole("link", { name: /^Open 2027-28/ })).first();
let sheet = "no Open 2027-28 control";
if (await open.count()) {
  await open.click();
  await pr.waitForTimeout(1500);
  const dlg = pr.locator("dialog[open], [role=dialog]").last();
  sheet = (await dlg.innerText().catch(() => "")).replace(/\s+/g, " ");
  await shot(pr, "yearend-01-open-year-sheet");
  const cancel = dlg.getByRole("button", { name: /^(Cancel|Close|Not now)$/ });
  if (await cancel.count()) await cancel.first().click(); else await pr.keyboard.press("Escape");
  await pr.waitForTimeout(800);
}
record({ area: A, role: "Principal", check: "Academic Settings: 'Open 2027-28' sheet explains what happens; cancelled without confirming", status: sheet.length > 40 && years() === before.years ? "PASS" : "FAIL", note: `sheet: ${sheet.slice(0, 500)} | years before ${before.years}; after ${years()}` });

await visit(pr, "/student-management/promotion");
await pr.locator("select[name=fromYear]").selectOption({ label: "2026-27" });
const from = pr.locator("select[name=from]");
const opt = (await from.locator("option").allInnerTexts()).find((o) => /^Grade 5 A/.test(o));
await from.selectOption({ label: opt });
await pr.getByRole("button", { name: "Show the students" }).click();
await pr.waitForTimeout(4000);
const rv = await text(pr, 5000);
await shot(pr, "yearend-02-promotion-review", true);
const hasHarini = /Harini Inti/.test(rv);
record({ area: A, role: "Principal", check: "Promotion review for Grade 5 A (2026-27 → Grade 6, 2027-28) lists the students with results, attendance and fees; stopped before Confirm", status: /Aarav Kumar/.test(rv) && batches() === before.batches ? "PASS" : "FAIL", note: `option "${opt}"; review shows ${(rv.match(/\d+ students?/) ?? [""])[0]}; mentions Harini Inti (TRANSFERRED) ${hasHarini}; text: ${rv.replace(/\s+/g, " ").slice(0, 400)}` });
record({ area: A, role: "Principal", check: "After looking: academic years, promotion batches and Grade 5 A students unchanged", status: years() === before.years && batches() === before.batches && g5aActive() === before.g5a ? "PASS" : "FAIL", note: `years ${years()}; batches ${before.batches} -> ${batches()}; Grade 5 A active ${before.g5a} -> ${g5aActive()}` });
await done(pr);
await close();
