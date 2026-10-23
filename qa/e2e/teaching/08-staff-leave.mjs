// Workflow 7 on a phone: the subject teacher (Prakash Kulkarni) applies for leave; mistakes (too many days,
// overlap); the principal sees the periods needing cover in Approvals and approves; balance, Staff Attendance.
import { as, visit, text, report, shot, VIEWPORTS, sql, sleep, messages, SUNRISE } from "./h.mjs";
import { close } from "../../lib.mjs";

const ME = "eb875a8c-e843-4289-b29c-a4d1a3f681ed";
const D = process.env.D ?? "2026-10-28";
const t = await as("subjectteacher", VIEWPORTS.phone390);
async function openForm() {
  await visit(t, "/staff-hr-management/leave", 1500);
  await t.getByRole("button", { name: /Apply for leave/ }).first().click(); await sleep(1000);
  return t.getByRole("dialog");
}
async function apply(dlg, label) {
  await dlg.getByRole("button", { name: "Apply", exact: true }).click(); await sleep(3000);
  const open = await dlg.isVisible().catch(() => false);
  console.log(`${label} -> ${open ? "still open: " + (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 700) : "closed"} | ${await messages(t)}`);
}
let dlg = await openForm();
console.log("form:", (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 700));
await shot(t, "staffleave-form-phone", false);
await report(t, "apply form");
await apply(dlg, "empty");
const types = await dlg.getByLabel("Leave type").locator("option").allInnerTexts();
console.log("types:", types);
// 13 casual days (balance 12)
await dlg.getByLabel("Leave type").selectOption({ label: types.find((x) => /Casual/.test(x)) });
await dlg.getByLabel("From date").fill("2026-11-02"); await dlg.getByLabel("To date").fill("2026-11-17");
await dlg.getByLabel("Reason").fill("Long trip"); await sleep(2000);
console.log("preview (too many):", (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 900));
await apply(dlg, "more than balance");
// The real one: Wed 28 Oct, one day
await dlg.getByLabel("From date").fill(D); await dlg.getByLabel("To date").fill(D);
await dlg.getByLabel("Reason").fill("Attending my cousin's wedding in Vijayawada"); await sleep(2000);
console.log("preview (1 day):", (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 900));
await shot(t, "staffleave-preview-phone", false);
await apply(dlg, "one day");
console.log("db:", sql(`select r.id, r.status, r.from_date, r.to_date, r.days, r.approval_id from leave_request r where r.staff_id='${ME}' order by r.created_at desc limit 2`));
// Overlap
dlg = await openForm();
await dlg.getByLabel("Leave type").selectOption({ label: types.find((x) => /Sick/.test(x)) });
await dlg.getByLabel("From date").fill(D); await dlg.getByLabel("To date").fill(D);
await dlg.getByLabel("Reason").fill("Fever"); await sleep(2000);
await apply(dlg, "overlap");
await dlg.getByRole("button", { name: "Cancel" }).click().catch(() => {});
await visit(t, "/staff-hr-management/leave", 1200);
console.log("\nmy leave:", (await text(t, 1500)));
await report(t, "my leave");
await close();
