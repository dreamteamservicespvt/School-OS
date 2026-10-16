// Staff leave: a cancelled request cannot be approved; "Ask for a change" (send back) and resubmission.
import { mainText, close } from "../lib.mjs";
import { res, login, open, messages, sleep, sql, uuidOf } from "./r.mjs";
import { callFormAction } from "./action.mjs";

const M = "Staff & HR Management", P = "Staff Leave (decisions)";
const F = "src/app/(school)/staff-hr-management/leave/actions.ts";
const msgOf = (r) => (r.text.match(/"message":"[^"]*"/)?.[0] ?? r.text.replace(/\s+/g, " ").slice(-200));
const teacher = await login("cems.teacher");
const leaveTypes = sql("select id, name from leave_type where for_whom='staff';");
const CL = uuidOf(leaveTypes.split("\n").find((l) => l.includes("Casual")));

async function applyUI(date, reason) {
  await open(teacher, "/staff-hr-management/leave");
  await teacher.getByRole("button", { name: /Apply for leave/ }).first().click();
  const dlg = teacher.getByRole("dialog");
  await dlg.getByLabel("Leave type").selectOption({ label: "Casual Leave" });
  await dlg.getByLabel("From date").fill(date);
  await dlg.getByLabel("To date").fill(date);
  await dlg.getByLabel("Reason").fill(reason);
  await sleep(1500);
  await dlg.getByRole("button", { name: "Apply", exact: true }).click();
  await sleep(3000);
  return messages(teacher);
}
await applyUI("2026-11-03", "Demo: to be cancelled");
await applyUI("2026-11-04", "Demo: to be sent back");
const rows = sql("select lr.id, lr.from_date, a.id from leave_request lr join approval a on a.record_id=lr.id::text where lr.staff_id is not null and lr.status='WAITING' order by lr.from_date;");
const list = rows.split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((x) => /^[0-9a-f]{8}-/.test(x[0]));
const c3 = list.find((x) => x[1] === "2026-11-03"), c4 = list.find((x) => x[1] === "2026-11-04");

// Cancel on screen
await open(teacher, "/staff-hr-management/leave");
const row = teacher.locator("li, tr, article", { hasText: "03-11-2026" }).filter({ has: teacher.getByRole("button", { name: "Cancel leave" }) }).first();
await row.getByRole("button", { name: "Cancel leave" }).click();
const dlg = teacher.getByRole("dialog");
await dlg.getByLabel("Reason").fill("Demo: plans changed");
await dlg.getByRole("button", { name: "Cancel leave" }).click();
await sleep(3000);
let m = await messages(teacher);
res(M, P, "Teacher cancels a waiting leave (3 Nov)", "Teacher", "Withdrawn; leaves Approvals", m.slice(0, 200), /cancel/i.test(m) ? "PASS" : "FAIL");
const pr = await login("cems.principal");
let r = await callFormAction(pr, F, "decideLeave", { approvalId: c3[2], decision: "approve" });
res(M, P, "Principal approves the cancelled leave (crafted call)", "Principal", "Refused: already decided", msgOf(r), /already decided/.test(r.text) ? "PASS" : "FAIL");

// Send back from Approvals
await open(pr, `/approvals/${c4[2]}`);
const t = (await mainText(pr, 1500)).replace(/\s+/g, " ");
const hasAsk = await pr.getByRole("button", { name: "Ask for a change" }).count();
if (hasAsk) {
  await pr.getByRole("button", { name: "Ask for a change" }).click();
  await sleep(500);
  await pr.getByRole("textbox").last().fill("Demo: please attach the invitation and change to 5 Nov.");
  await pr.getByRole("button", { name: /Send back|Ask for the change|Send/ }).last().click();
  await sleep(3000);
  m = await messages(pr);
  const st = sql(`select lr.status, a.status from leave_request lr join approval a on a.id=lr.approval_id where lr.id='${c4[0]}';`);
  res(M, P, "Principal asks for a change (send back) on the 4 Nov leave", "Principal", "Sent back to the teacher, who can change and resubmit", `${m.slice(0, 150)} | DB: ${st.replace(/\s+/g, " ").slice(0, 120)}`, /REJECTED/.test(st) ? "FAIL" : "PASS", /REJECTED/.test(st) ? "ACADEMICS-07" : undefined);
  await open(teacher, "/staff-hr-management/leave");
  const tt = (await mainText(teacher, 4000)).replace(/\s+/g, " ");
  res(M, P, "Teacher resubmits a sent-back leave", "Teacher", "An Edit / Resubmit action on the request", tt.match(/04-11-2026.{0,200}/)?.[0] ?? tt.slice(0, 200), /Resubmit|Change and send|Edit/.test(tt) ? "PASS" : "NOT IMPLEMENTED", "ACADEMICS-07");
} else res(M, P, "Ask for a change on staff leave", "Principal", "Ask for a change button", t.slice(0, 200), "NOT IMPLEMENTED");
await close();
