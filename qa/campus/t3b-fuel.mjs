// Transport: fuel with a bill reaches Finance; cancelling a cost cancels the expense.
import { asUser, go, mainText, close, result, sleep } from "./util.mjs";
import { submit, clickB, openSheet } from "./util2.mjs";
const M = "Transport Management", P = "Vehicles & Drivers", R = "Transport In-charge";
const V = "/transport-management/vehicles";
const FILES = "/home/claude/qa-out/campus/files";
const page = await asUser("cems.transport");
const D = (k) => page.locator(`dialog[open] [name=${k}]`);
const sel = async (k, label) => { const o = await D(k).evaluate((e) => [...e.options].map((x) => ({ v: x.value, t: x.text }))); await D(k).selectOption(o.find((x) => x.t.includes(label)).v); };

await openSheet(page, go, `${V}?view=costs&do=cost`);
await clickB(page, "Fuel");
await sel("vehicleId", "BUS-DEMO-01"); await D("date").fill("2026-10-15"); await D("amount").fill("3,500.50");
await D("litres").fill("35.5"); await D("odometerKm").fill("45500"); await D("what").fill("Demo Fuel Station");
await D("bill").setInputFiles(`${FILES}/puc-demo.png`);
let s = await submit(page, "Record", { wait: 3500 });
result({ module: M, page: P, action: "Record fuel ₹3,500.50 with bill photo", role: R, expected: "Saved and added to Finance, Expenses", actual: s, status: /₹3,500\.50 recorded/.test(s) && /Finance/.test(s) ? "PASS" : "FAIL" });

// Cancel the repair entry.
await go(page, `${V}?view=costs`);
await page.locator("main").getByRole("row", { name: /Demo brake pad/ }).getByRole("link", { name: "Cancel" }).or(page.locator("main").getByRole("row", { name: /Demo brake pad/ }).getByRole("button", { name: "Cancel" })).first().click();
await page.waitForSelector("dialog[open]");
await sleep(400);
await page.locator("dialog[open] [name=reason]").fill("abc");
s = await submit(page, /Cancel (the )?entry|Cancel repair|Cancel/);
result({ module: M, page: P, action: "Cancel a repair entry with a 3-letter reason", role: R, expected: "Refused: reason at least 5 characters", actual: s, status: /at least 5/.test(s) ? "PASS" : "FAIL" });
await page.locator("dialog[open] [name=reason]").fill("Demo entry made twice by mistake");
s = await submit(page, /Cancel (the )?entry|Cancel repair|Cancel/);
result({ module: M, page: P, action: "Cancel a repair entry", role: R, expected: "Cancelled here and in Finance, both kept on record", actual: s, status: /Entry cancelled/.test(s) ? "PASS" : "FAIL" });
await go(page, `${V}?view=costs`);
console.log((await mainText(page, 3000)).split("Fuel and repairs").slice(1).join(" | "));
console.log("PROBLEMS", page.problems);
await close();
