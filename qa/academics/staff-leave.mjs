// Staff leave: cems.teacher applies (validation, preview with balance and periods), then edge cases.
import { mainText, shot, close, layoutIssues, VIEWPORTS } from "../lib.mjs";
import { res, login, open, messages, sleep, sql } from "./r.mjs";

const M = "Staff & HR Management", P = "Staff Leave", R = "Teacher";
const page = await login("cems.teacher");
await open(page, "/staff-hr-management/leave");

async function apply(type, from, to, reason, half) {
  await page.getByRole("button", { name: /Apply for leave/ }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Leave type").selectOption({ label: type });
  if (half) await dlg.getByLabel("Half day").selectOption(half);
  await dlg.getByLabel("From date").fill(from);
  if (!half) await dlg.getByLabel("To date").fill(to);
  await dlg.getByLabel("Reason").fill(reason);
  await sleep(2500);
  const preview = (await dlg.innerText()).replace(/\s+/g, " ");
  await dlg.getByRole("button", { name: "Apply", exact: true }).click();
  await sleep(3000);
  const out = (await dlg.isVisible().catch(() => false)) ? "(still open) " + (await dlg.innerText()).replace(/\s+/g, " ") : "(closed) " + (await messages(page));
  if (out.startsWith("(still open)")) await page.keyboard.press("Escape");
  return { preview, out };
}

let r = await apply("Casual Leave", "2026-10-27", "2026-10-26", "Demo: family function");
res(M, P, "Apply with To before From", R, "Refused in plain words", r.out.slice(0, 220), /still open/.test(r.out) && /before|after/i.test(r.out) ? "PASS" : "FAIL");
r = await apply("Casual Leave", "2026-10-26", "2026-10-27", "");
res(M, P, "Apply with empty reason", R, "Refused: reason needed", r.out.slice(0, 220), /still open/.test(r.out) ? "PASS" : "FAIL");
r = await apply("Casual Leave", "2026-10-25", "2026-10-25", "Demo: Sunday only");
res(M, P, "Apply for a Sunday inside the Dasara holidays only", R, "Refused: no working day in the range", r.out.slice(0, 220), /still open/.test(r.out) ? "PASS" : "FAIL");
r = await apply("Casual Leave", "2026-10-26", "2026-10-27", "Demo: family function in Vizag (synthetic)");
res(M, P, "Apply Casual Leave 26-27 Oct", R, "Preview shows days, balance and periods needing a substitute; applied and waiting", `${r.preview.match(/\d+ days? of Casual Leave[^.]*\./)?.[0] ?? "(no preview)"} => ${r.out.slice(0, 160)}`, /closed/.test(r.out) && /waiting/i.test(r.out) ? "PASS" : "FAIL");
r = await apply("Casual Leave", "2026-10-27", "2026-10-28", "Demo: overlapping");
res(M, P, "Apply overlapping leave (27-28 Oct)", R, "Refused: already applied for 27 Oct", r.out.slice(0, 220), /still open/.test(r.out) && /already|overlap/i.test(r.out) ? "PASS" : "FAIL");
r = await apply("Sick Leave", "2026-10-29", "2026-11-30", "Demo: long sick leave above the balance");
res(M, P, "Sick Leave longer than the balance (10 days)", R, "Refused or the extra shown as loss of pay", `${r.preview.slice(r.preview.indexOf("days"), 200)} => ${r.out.slice(0, 200)}`, /loss of pay|not enough|only/i.test(r.preview + r.out) ? "PASS" : "FAIL");
r = await apply("Casual Leave", "2026-11-02", "2026-11-02", "Demo: bank work, half day", "first");
res(M, P, "Apply half-day Casual Leave 2 Nov", R, "0.5 day; waiting", r.out.slice(0, 200), /0\.5|half/i.test(r.out) && /closed/.test(r.out) ? "PASS" : "FAIL");
await open(page, "/staff-hr-management/leave");
await shot(page, "staff-leave-applied");
console.log(sql("select lr.from_date, lr.to_date, lr.days, lr.status, a.current_approver_role, a.current_approver_id, a.status from leave_request lr left join approval a on a.record_id=lr.id where lr.staff_id is not null order by lr.created_at;"));
await page.setViewportSize(VIEWPORTS.phone375);
await open(page, "/staff-hr-management/leave");
const li = await layoutIssues(page);
res(M, P, "Staff Leave at 375px", R, "No sideways scroll", li.join("; ") || "no issues", li.length ? "FAIL" : "PASS");
await close();
