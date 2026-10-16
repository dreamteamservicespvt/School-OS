// Transport: stop a student's transport (fees still to come removed) and change a student's route.
import { asUser, go, mainText, close, result, sleep, shot } from "./util.mjs";
import { submit } from "./util2.mjs";
import { fields as flds } from "./util.mjs";
const M = "Transport Management", P = "Student Transport", R = "Transport In-charge";
const S = "/transport-management/students";
const page = await asUser("cems.transport");
const D = (k) => page.locator(`dialog[open] [name=${k}]`);
const sel = async (loc, label) => { const o = await loc.evaluate((e) => [...e.options].map((x) => ({ v: x.value, t: x.text }))); const m = o.find((x) => x.t.includes(label)); if (!m) throw new Error(`no ${label}: ${o.map((x) => x.t)}`); await loc.selectOption(m.v); };

async function tick(name, link) {
  await go(page, S);
  await page.locator("main").getByRole("checkbox", { name: new RegExp(name) }).first().check();
  await sleep(500);
  await page.getByRole("link", { name: link }).click();
  await page.waitForSelector("dialog[open]"); await sleep(400);
}

await tick("Karthik Pydi", "Stop transport");
console.log((await flds(page, "dialog[open]")).join("\n"));
await D("lastDate").fill("2026-11-30"); await D("reason").fill("ab");
let s = await submit(page, /^(Stop transport|Send for approval)$/, { wait: 3000 });
result({ module: M, page: P, action: "Stop transport with a 2-letter reason", role: R, expected: "Refused", actual: s, status: /at least 3/.test(s) ? "PASS" : "FAIL" });
await D("reason").fill("Demo: family moved closer to school");
s = await submit(page, /^(Stop transport|Send for approval)$/, { wait: 3500 });
result({ module: M, page: P, action: "Stop Karthik Pydi's transport after 30-11-2026 (remove student)", role: R, expected: "Stopped; fees after November removed (₹6,000)", actual: s, status: /Transport stops for 1 student after 30-11-2026/.test(s) && /₹6,000/.test(s) ? "PASS" : (/approval/.test(s) ? "PASS" : "FAIL") });

await tick("Sahithi Gorle", "Change stop or route");
console.log((await flds(page, "dialog[open]")).join("\n"));
await sel(D("routeId"), "Demo Route North"); await sleep(400);
await sel(D("stopId"), "Demo Village Beta");
await D("fromDate").fill("2026-12-01"); await D("reason").fill("Demo: moved to Beta village");
s = await submit(page, /^(Change|Send for approval)$/, { wait: 3500 });
result({ module: M, page: P, action: "Change Sahithi Gorle from Route 3 to Route 2, Demo Village Beta from 01-12-2026", role: R, expected: "Changed (or sent for approval per settings); fee changes from December", actual: s, status: /Transport changed for 1 student|sent for approval/.test(s) ? "PASS" : "FAIL" });

await go(page, S);
console.log(await mainText(page, 3000));
await shot(page, "t7-students");
console.log("PROBLEMS", page.problems);
await close();
