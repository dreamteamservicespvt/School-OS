// Self-test B item 3: Ananya Verma moves from Class 5 A to 5 B (School Admin, phone size), then her fees,
// attendance and marks are checked on screen; DB counts are compared by the caller (see the findings file).
//   MSYS_NO_PATHCONV=1 node qa/full/selftest-B-section-change.mjs
import { asB, go, mainText, close, sleep, PHONE, DESK, snap, rec, phoneCheck } from "./selftest-B-h.mjs";
const ID = "eafa5014-839a-46ef-947d-2058ff2eccab";
const flat = async (p, n = 2500) => (await mainText(p, n)).replace(/\n+/g, " | ");
const a = await asB("admin", PHONE);
await go(a, `/student-management/students/${ID}`); await sleep(1500);
const before = await flat(a, 900);
console.log("BEFORE", before.slice(0, 400));
await go(a, `/student-management/students/${ID}/section`); await sleep(1500);
const c = await phoneCheck(a);
rec("section change page fits a phone", c.scrollWidth <= 390, `small: ${c.small.join(", ")}`);
await a.getByRole("button", { name: "Change section" }).last().tap(); await sleep(1200);
const e1 = await flat(a, 2000);
rec("section change: empty submit says choose a section", /Choose|choose|pick/i.test(e1.replace(/New section \* \| Choose/, "")), e1.match(/[^|]*(Choose|choose|Pick)[^|]*/g)?.join(" / "));
await snap(a, "sec-1-empty");
await a.locator("select[name=sectionId]").selectOption({ label: /Class 5 B/ }).catch(async () => {
  const v = await a.locator("select[name=sectionId] option").evaluateAll((os) => os.find((o) => /Class 5 B/.test(o.text))?.value);
  await a.locator("select[name=sectionId]").selectOption(v);
});
await a.getByLabel("Reason").fill("Parents asked: closer to her friends' bus stop (QA self-test B)");
await snap(a, "sec-2-filled");
await a.getByRole("button", { name: "Change section" }).last().tap(); await sleep(4000);
const after = await flat(a, 1500);
console.log("AFTER", new URL(a.url()).pathname, after.slice(0, 400));
rec("section change: profile now says 5 B", /5 B/.test(after), after.match(/5 [AB] · Roll \d+/)?.[0]);
await snap(a, "sec-3-done");
// Her own tabs: attendance %, fees due, exams.
for (const tab of ["Attendance", "Fees", "Exams"]) {
  await go(a, `/student-management/students/${ID}?tab=${tab.toLowerCase()}`); await sleep(1500);
  const t = await flat(a, 3000);
  console.log(`TAB ${tab}:`, t.slice(0, 600));
  await snap(a, `sec-4-tab-${tab.toLowerCase()}`, true);
}
await a.context().close();
// Class teacher of 5 A: today's sheet no longer lists her, the saved counts still make sense.
const t = await asB("teacher", PHONE);
await go(t, "/attendance-management"); await sleep(2000);
const tt = await flat(t, 6000);
rec("5 A Take Attendance no longer lists her", !/Ananya Verma/.test(tt), tt.slice(0, 300));
console.log("5A TODAY", tt.match(/Saved at[^|]*\|[^|]*|\d+ \| Present \| \d+ \| Absent \| \d+ \| Late/g));
await snap(t, "sec-5-teacher-5A-today", true);
await go(t, "/attendance-management?date=2026-11-11"); await sleep(2000);
const ty = await flat(t, 6000);
console.log("5A YESTERDAY has her:", /Ananya Verma/.test(ty), ty.match(/\d+ \| Present \| \d+ \| Absent/)?.[0]);
await snap(t, "sec-6-teacher-5A-yesterday", true);
await t.context().close();
await close();
