// Journey E8: a teacher applies for casual leave (wrong dates first), the approver decides it.
import { as } from "./look.mjs";
import { go, shot, close } from "./h.mjs";
const rec = (c, pass, note = "") => console.log(`${pass ? "PASS" : "FAIL"} ${c}${note ? " :: " + note : ""}`);
const p = await as("subjectteacher");
const open = async () => { await go(p, "/staff-hr-management/leave"); await p.getByRole("button", { name: "Apply for leave" }).click(); await p.waitForTimeout(1200); return p.getByRole("dialog").last(); };
async function tryDates(from, to) {
  const d = await open();
  await d.locator("select[name=leaveTypeId]").selectOption({ label: "Casual Leave" });
  const f = d.locator('input[id$="-from"]'), t = d.locator('input[id$="-to"]');
  await f.fill(""); await f.pressSequentially(from, { delay: 20 }); await t.fill(""); await t.pressSequentially(to, { delay: 20 });
  await d.locator("textarea[name=reason]").fill("Family function in Warangal.");
  await d.getByRole("button", { name: "Check days and balance" }).click(); await p.waitForTimeout(2500);
  return d;
}
let d = await tryDates("06-11-2026", "05-11-2026");
let txt = (await d.innerText()).replace(/\n+/g, " | ");
rec("To before From refused", /before|after|earlier|later/i.test(txt), txt.match(/[^|]*(before|after|earlier|later)[^|]*/i)?.[0]);
d = await tryDates("31-02-2026", "31-02-2026");
txt = (await d.innerText()).replace(/\n+/g, " | ");
console.log("31-02 MESSAGE:", txt.match(/[^|]*(DD-MM-YYYY|does not exist|not a real|date)[^|]*/gi)?.slice(0, 3));
d = await tryDates("05-11-2026", "06-11-2026");
txt = (await d.innerText()).replace(/\n+/g, " | ");
console.log("CHECK:", txt.slice(txt.indexOf("Check days") - 300, txt.indexOf("Check days") + 50));
const ap = d.getByRole("button", { name: "Apply", exact: true });
await ap.click(); await ap.click({ timeout: 800 }).catch(() => {});
await p.waitForTimeout(4000);
const mine = (await p.locator("main").innerText()).replace(/\n+/g, " | ");
rec("Leave listed under My requests", /05-11-2026/.test(mine), mine.match(/My requests.{0,400}/s)?.[0]);
await shot(p, "j8-leave", false);
console.log("PROBLEMS", p.problems);
await close();
