// Transport: remove a stop, a student on the bus today, then the driver runs the morning trip on /driver.
import { asUser, go, mainText, close, result, sleep, shot, VIEWPORTS, layoutIssues } from "./util.mjs";
import { submit, said, openSheet, clickB } from "./util2.mjs";
const M = "Transport Management", R = "Transport In-charge";
const NORTH = "5c05a200-cb2c-468a-a2ac-749e1ba50cdc";
const page = await asUser("cems.transport");
const D = (k) => page.locator(`dialog[open] [name=${k}]`);
const sel = async (loc, label) => { const o = await loc.evaluate((e) => [...e.options].map((x) => ({ v: x.value, t: x.text }))); const m = o.find((x) => x.t.includes(label)); if (!m) throw new Error(`no ${label}: ${o.map((x) => x.t)}`); await loc.selectOption(m.v); };

// 1. Remove the stop that was added with a pickup after school arrival.
await go(page, `/transport-management/routes/${NORTH}`);
await page.locator("main details", { hasText: "Demo Village Late" }).locator("summary").click(); await sleep(400);
await page.locator("main details", { hasText: "Demo Village Late" }).getByRole("button", { name: "Remove stop" }).click();
await page.waitForSelector("dialog[open]"); await sleep(300);
let s = await submit(page, "Remove Demo Village Late", { wait: 3000 });
result({ module: M, page: "Routes & Stops", action: "Remove a stop with no students", role: R, expected: "Removed, kept in history", actual: s, status: /removed from the route/.test(s) ? "PASS" : "FAIL" });

// 2. Pranav Korada on Route 2 from today, so today's trip has a student.
await openSheet(page, go, "/transport-management/students?do=assign");
const dlg = page.locator("dialog[open]");
await dlg.getByLabel("Find a student").fill("Pranav Korada"); await sleep(1500);
await dlg.getByRole("option", { name: /Pranav Korada/ }).or(dlg.locator("button, li", { hasText: /Pranav Korada/ })).first().click(); await sleep(400);
await sel(D("routeId"), "Demo Route North"); await sleep(400); await sel(D("stopId"), "Demo Village Beta");
await D("fromDate").fill("2026-10-16");
await dlg.getByRole("button", { name: "Give transport", exact: true }).click(); await sleep(1500);
const c = page.locator("dialog[open]").getByRole("button", { name: /^(Give|Confirm|Yes)/ });
if (await c.count()) { await c.last().click(); await sleep(3000); }
s = await said(page);
result({ module: M, page: "Student Transport", action: "Give Pranav Korada transport from today (16-10-2026), Route 2, Demo Village Beta", role: R, expected: "Saved, October fee added", actual: s, status: /Pranav Korada: Route 2/.test(s) ? "PASS" : "FAIL" });
await close();

// 3. The driver on the phone.
const dp = await asUser("cems.driver", VIEWPORTS.phone375);
await go(dp, "/driver"); await sleep(1500);
let t = await mainText(dp, 3000);
console.log("DRIVER HOME:\n" + t);
result({ module: M, page: "Driver page", action: "Driver home shows only own trips", role: "Driver", expected: "Route 2 trips only (not Route 3/4)", actual: t.slice(0, 300).replace(/\s+/g, " "), status: /Demo Route North|Route 2/.test(t) && !/Demo Route South|Demo Route East/.test(t) ? "PASS" : "FAIL" });
const lay = await layoutIssues(dp);
result({ module: M, page: "Driver page", action: "Driver page at 375px", role: "Driver", expected: "No sideways scroll", actual: lay.join("; ") || "no layout issues", status: lay.some((x) => /sideways/.test(x)) ? "FAIL" : "PASS" });
await dp.context().grantPermissions(["geolocation"]);
await dp.context().setGeolocation({ latitude: 18.2949, longitude: 83.8938 });
await dp.getByRole("button", { name: "Start trip" }).first().click(); await sleep(3000);
t = await mainText(dp, 3000);
result({ module: M, page: "Driver page", action: "Start trip as cems.driver", role: "Driver", expected: "Trip running, stops listed", actual: (await said(dp)) + " / " + t.slice(0, 200).replace(/\s+/g, " "), status: /End trip/.test(t) ? "PASS" : "FAIL" });
await shot(dp, "t8-driver-running");
// Boarding at Beta and reaching Alpha.
const boarded = dp.getByRole("button", { name: "Boarded" });
if (await boarded.count()) { await boarded.first().click(); await sleep(2500); }
t = await mainText(dp, 3000);
result({ module: M, page: "Driver page", action: "Mark Pranav Korada boarded", role: "Driver", expected: "Marked boarded", actual: (await said(dp)).slice(0, 200), status: /boarded/i.test(await said(dp)) || /Boarded/.test(t) ? "PASS" : "FAIL" });
const reached = dp.getByRole("button", { name: "Reached" });
if (await reached.count()) { await reached.first().click(); await sleep(2500); }
result({ module: M, page: "Driver page", action: "Mark first stop reached (pickup)", role: "Driver", expected: "Stop marked reached", actual: (await said(dp)).slice(0, 200), status: /reached/i.test(await said(dp)) ? "PASS" : "FAIL" });
console.log("DRIVER RUNNING:\n" + (await mainText(dp, 3000)));
// Leave it running so Live Tracking can be checked; the next script ends it.
console.log("PROBLEMS", dp.problems);
await close();
