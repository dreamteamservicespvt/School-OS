// Time Table: clash checks when editing by hand, publish with validation, teacher view, permissions.
import { mainText, shot, close, layoutIssues, VIEWPORTS } from "../lib.mjs";
import { res, login, open, messages, sleep } from "./r.mjs";
import { callAction, callFormAction } from "./action.mjs";

const M = "Academic Management", P = "Time Table", R = "Principal";
const G5A = "949e25d2-78bc-48aa-a6b6-7fd678175201";
const page = await login("cems.principal");
await open(page, `/academic-management/time-table?section=${G5A}`);
await page.locator("#cell-1\\:5").click();
const dlg = page.getByRole("dialog");
await dlg.getByLabel("Subject").selectOption({ label: "Science" }).catch(async () => console.log(await dlg.getByLabel("Subject").locator("option").allInnerTexts()));
await sleep(500);
const teachers = await dlg.locator("select[name=staffId]").locator("option").allInnerTexts();
console.log("teachers", teachers.slice(0, 8));
await dlg.locator("select[name=staffId]").selectOption({ label: teachers.find((t) => t.startsWith("Demo Pavan Seela")) });
await sleep(2500);
let txt = (await dlg.innerText()).replace(/\s+/g, " ");
res(M, P, "Live clash check: Monday P5 Grade 5 A with Demo Pavan Seela (busy in Grade 6 B)", R, "Warns 'This would clash' naming the other class", txt.match(/This would clash.{0,160}/)?.[0] ?? txt.slice(0, 200), /would clash/.test(txt) && /Grade 6 B/.test(txt) ? "PASS" : "FAIL");
await dlg.getByRole("button", { name: "Save period" }).click();
await sleep(2000);
txt = (await dlg.isVisible().catch(() => false)) ? (await dlg.innerText()).replace(/\s+/g, " ") : "(closed) " + (await messages(page));
res(M, P, "Save a clashing period anyway", R, "Refused on the server with a plain message", txt.slice(0, 250), /clash|already|another/i.test(txt) && !/closed/.test(txt) ? "PASS" : "FAIL");
// Room clash: free teacher but room R-?? used by Grade 5 B? Use a free teacher, no room clash -> saves
const free = teachers.find((t) => /free/i.test(t) && !t.startsWith("Demo Pavan"));
console.log("free option", free);
await close();
