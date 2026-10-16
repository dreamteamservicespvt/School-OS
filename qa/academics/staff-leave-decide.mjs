// Staff leave decisions and edge cases: self approval, wrong approver, approve, duplicate approval,
// reject, already rejected, cancelled request, send back, balance, notification.
import { mainText, shot, close } from "../lib.mjs";
import { res, login, open, messages, sleep, sql, uuidOf } from "./r.mjs";
import { callFormAction } from "./action.mjs";

const M = "Staff & HR Management", P = "Staff Leave (decisions)";
const F = "src/app/(school)/staff-hr-management/leave/actions.ts";
const rows = sql("select lr.id, lr.from_date, a.id from leave_request lr join approval a on a.record_id=lr.id::text where lr.staff_id is not null and lr.status='WAITING' order by lr.created_at;");
const list = rows.split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((x) => /^[0-9a-f]{8}-/.test(x[0]));
const [full, half] = list; // 26-27 Oct, 2 Nov half day
const msgOf = (r) => (r.text.match(/"message":"[^"]*"/)?.[0] ?? r.text.replace(/\s+/g, " ").slice(-200));

const teacher = await login("cems.teacher");
let r = await callFormAction(teacher, F, "decideLeave", { approvalId: full[2], decision: "approve" });
res(M, P, "Teacher approves own leave (crafted call)", "Teacher", "Refused", msgOf(r), /"ok":false/.test(r.text) ? "PASS" : "FAIL");
for (const who of ["cems.viceprincipal", "cems.academichead", "cems.hr", "cems.classteacher"]) {
  const p = await login(who);
  r = await callFormAction(p, F, "decideLeave", { approvalId: full[2], decision: "approve" });
  res(M, P, `Wrong approver ${who} approves (crafted call; rule says Principal)`, who, "Refused: waiting for someone else", msgOf(r), /"ok":false/.test(r.text) ? "PASS" : "FAIL");
  await p.context().close();
}

const pr = await login("cems.principal");
await open(pr, "/staff-hr-management/leave?view=requests");
let t = await mainText(pr, 3000);
console.log(t.slice(0, 1200));
const card = pr.locator("li, tr, article", { hasText: "26-10-2026" }).filter({ has: pr.getByRole("button", { name: /^Approve/ }) }).first();
const tab2 = await pr.context().newPage();
await tab2.goto(pr.url());
await card.getByRole("button", { name: /^Approve/ }).click();
await sleep(3000);
let m = await messages(pr);
res(M, P, "Principal approves Casual Leave 26-27 Oct on Staff Leave", "Principal", "Approved; balance 12 -> 10; substitutions raised", m.slice(0, 200), /approved/i.test(m) ? "PASS" : "FAIL");
// second tab still shows the old Approve button
const card2 = tab2.locator("li, tr, article", { hasText: "26-10-2026" }).filter({ has: tab2.getByRole("button", { name: /^Approve/ }) }).first();
await card2.getByRole("button", { name: /^Approve/ }).click();
await sleep(3000);
m = (await messages(tab2)) + " " + (await mainText(tab2, 600)).replace(/\s+/g, " ");
res(M, P, "Approve again from a second tab (stale page)", "Principal", "Refused: already decided; nothing changes", m.slice(0, 250), /already decided/i.test(m) ? "PASS" : "FAIL");
console.log(sql(`select status from leave_request where id='${full[0]}';`));
console.log(sql(`select count(*) subs from substitution where created_at > now() - interval '10 minutes';`));

// Reject the half day: short reason first
await open(pr, "/staff-hr-management/leave?view=requests");
const hc = pr.locator("li, tr, article", { hasText: "02-11-2026" }).filter({ has: pr.getByRole("button", { name: "Reject" }) }).first();
await hc.getByRole("button", { name: "Reject" }).click();
let dlg = pr.getByRole("dialog");
await dlg.getByLabel("Reason").fill("no");
await dlg.getByRole("button", { name: "Reject" }).click();
await sleep(2500);
let out = (await dlg.isVisible().catch(() => false)) ? (await dlg.innerText()).replace(/\s+/g, " ") : "(closed) " + (await messages(pr));
res(M, P, "Reject with a 2-letter reason", "Principal", "Refused: reason of at least 5 characters", out.slice(0, 200), /at least 5/.test(out) ? "PASS" : "FAIL");
await dlg.getByLabel("Reason").fill("Demo: exams that week, please choose another day.");
await dlg.getByRole("button", { name: "Reject" }).click();
await sleep(3000);
out = (await dlg.isVisible().catch(() => false)) ? (await dlg.innerText()).replace(/\s+/g, " ") : "(closed) " + (await messages(pr));
res(M, P, "Reject the half-day leave with a reason", "Principal", "Rejected; teacher told why", out.slice(0, 200), /not approved/i.test(out) ? "PASS" : "FAIL");
r = await callFormAction(pr, F, "decideLeave", { approvalId: half[2], decision: "approve" });
res(M, P, "Approve an already rejected leave (crafted call)", "Principal", "Refused: already decided", msgOf(r), /already decided/.test(r.text) ? "PASS" : "FAIL");

// Teacher sees the outcome, balance and notification
await open(teacher, "/staff-hr-management/leave");
t = (await mainText(teacher, 3000)).replace(/\s+/g, " ");
res(M, P, "Teacher sees balance after approval", "Teacher", "Casual Leave 10 of 12 left", t.match(/Casual Leave [^A-Z]*left/)?.[0] ?? t.slice(0, 200), /Casual Leave 10 of 12 left/.test(t) ? "PASS" : "FAIL");
console.log(sql("select n.text, n.created_at from notification n join user_login u on u.id=n.user_login_id where u.username='cems.teacher' order by n.created_at desc limit 4;"));
await close();
