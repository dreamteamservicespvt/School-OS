// The Principal decides the attendance corrections: approves the real ones, does not approve the
// ones for a future day, Sunday, holiday, outside the year and the subject teacher's. Class teacher
// cannot approve; a decided correction cannot be decided twice.
import { mainText, close } from "../lib.mjs";
import { res, login, open, messages, sleep, sql, uuidsOf } from "./r.mjs";
import { callFormAction } from "./action.mjs";

const M = "Attendance Management", P = "Attendance Register (corrections)", R = "Principal";
const F = "src/app/(school)/attendance-management/register/actions.ts";
const rows = sql("select id, date, reason from attendance_correction where status='WAITING' order by created_at;");
const list = rows.split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((x) => /^[0-9a-f]{8}-/.test(x[0]));
const ct = await login("cems.classteacher");
const first = list[0][0];
let r = await callFormAction(ct, F, "approveCorrectionAction", { correctionId: first });
res(M, P, "Class teacher approves own correction (crafted call)", "Class Teacher", "Refused", (r.text.match(/"message":"[^"]*"/)?.[0] ?? r.text.slice(-200)), /"ok":false/.test(r.text) ? "PASS" : "FAIL");

const page = await login("cems.principal");
for (const [id, date, reason] of list) {
  await open(page, `/attendance-management/register/corrections/${id}`);
  const legit = /paper register|paper that day/.test(reason) && ["2026-10-14", "2026-10-15"].includes(date);
  if (legit) {
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await sleep(500);
    const dlg = page.getByRole("dialog");
    if (await dlg.isVisible().catch(() => false)) await dlg.getByRole("button", { name: /^Approve/ }).last().click();
  } else {
    await page.getByRole("button", { name: "Not approve" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("Reason").fill("Demo: not a school day or not your register.");
    await dlg.getByRole("button", { name: "Not approve" }).click();
  }
  await sleep(3000);
  const msg = await messages(page);
  res(M, P, `${legit ? "Approve" : "Not approve"} correction ${date} (${reason.slice(0, 40)})`, R, legit ? "Approved; register changes" : "Not approved with reason; register unchanged", msg.slice(0, 160), legit ? /approved/i.test(msg) && !/not approved/i.test(msg) ? "PASS" : "FAIL" : /not approved/i.test(msg) ? "PASS" : "FAIL");
}
// decide again
r = await callFormAction(page, F, "approveCorrectionAction", { correctionId: first });
res(M, P, "Approve an already approved correction (second tab)", R, "Refused: already decided", (r.text.match(/"message":"[^"]*"/)?.[0] ?? r.text.slice(-200)), /already decided/.test(r.text) ? "PASS" : "FAIL");
console.log(sql("select date, status_key, count(*) from attendance_mark where section_id='949e25d2-78bc-48aa-a6b6-7fd678175201' and archived_at is null group by 1,2 order by 1,2;"));
await close();
