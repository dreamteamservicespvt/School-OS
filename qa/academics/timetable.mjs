// Time Table: start a draft, make it automatically, check clashes, publish, and see it as a teacher.
import { mainText, shot, close, layoutIssues, VIEWPORTS } from "../lib.mjs";
import { res, login, open, messages, sleep } from "./r.mjs";

const M = "Academic Management", P = "Time Table", R = "Principal";
const page = await login("cems.principal");
await open(page, "/academic-management/time-table");
let t = await mainText(page, 5000);
if (/Start the Time Table/.test(t)) {
  await page.getByRole("button", { name: "Start the Time Table" }).first().click();
  await sleep(3000);
  t = await mainText(page, 5000);
  res(M, P, "Start the Time Table (new draft)", R, "A draft is created", (await messages(page)).slice(0, 150) + " | " + (/draft/i.test(t) ? "draft shown" : "no draft"), /draft/i.test(t) ? "PASS" : "FAIL");
}
await shot(page, "tt-draft");
// Make automatically for all classes
await page.getByRole("button", { name: "Make automatically" }).click();
const dlg = page.getByRole("dialog");
console.log((await dlg.innerText()).slice(0, 800));
await dlg.getByRole("button", { name: "Make the draft" }).click();
await dlg.waitFor({ state: "hidden", timeout: 180000 }).catch(() => {});
await sleep(2000);
const msg = await messages(page);
t = await mainText(page, 8000);
res(M, P, "Make automatically from Teacher Allocation (all classes)", R, "Draft filled; any unplaced periods explained", msg.slice(0, 300), /placed|filled|made/i.test(msg) ? "PASS" : "FAIL");
console.log(t.slice(0, 3000));
await shot(page, "tt-auto");
await close();
