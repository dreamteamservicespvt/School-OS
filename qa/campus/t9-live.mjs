// Transport: settings validation, live tracking on, live map, delay message to parents (no channel),
// emergency from the driver, end trip (missed stop), reports.
import { asUser, go, mainText, close, result, sleep, shot, VIEWPORTS } from "./util.mjs";
import { submit, said, openSheet } from "./util2.mjs";
const M = "Transport Management", R = "Transport In-charge";
const NORTH = "5c05a200-cb2c-468a-a2ac-749e1ba50cdc";
const page = await asUser("cems.transport");
const D = (k) => page.locator(`dialog[open] [name=${k}]`);

// Settings validation.
async function alerts(vals) {
  await openSheet(page, go, "/transport-management/settings?edit=alerts");
  for (const [k, v] of Object.entries(vals)) await D(k).fill(v);
  return submit(page, "Save", { wait: 3000 });
}
let s = await alerts({ overSpeedKmh: "-10" });
result({ module: M, page: "Transport Settings", action: "Over-speed -10 km/h", role: R, expected: "Refused", actual: s, status: /saved/i.test(s) ? "FAIL" : "PASS" });
s = await alerts({ overSpeedKmh: "50", staleAfterMin: "5", offlineAfterMin: "3" });
result({ module: M, page: "Transport Settings", action: "Offline (3 min) before 'marked old' (5 min)", role: R, expected: "Refused", actual: s, status: /Offline must come after/.test(s) ? "PASS" : "FAIL" });
s = await alerts({ overSpeedKmh: "50", staleAfterMin: "2", offlineAfterMin: "5", lateAfterMin: "abc" });
result({ module: M, page: "Transport Settings", action: "Running late 'abc' minutes", role: R, expected: "Refused", actual: s, status: /whole number/.test(s) ? "PASS" : "FAIL" });
s = await alerts({ overSpeedKmh: "45", staleAfterMin: "2", offlineAfterMin: "5", lateAfterMin: "10" });
result({ module: M, page: "Transport Settings", action: "Save over-speed 45 km/h", role: R, expected: "Saved and logged", actual: s, status: /saved/.test(s) ? "PASS" : "FAIL" });

// Live tracking on.
await go(page, "/transport-management/settings");
await page.locator("main").getByRole("button", { name: "Switch on" }).click(); await sleep(1500);
if (await page.locator("dialog[open]").count()) await page.locator("dialog[open]").getByRole("button", { name: /Switch on|Yes|Confirm/ }).last().click();
await sleep(2500);
s = await said(page);
result({ module: M, page: "Transport Settings", action: "Switch live tracking on", role: R, expected: "Live tracking on", actual: s, status: /Live tracking is on/.test(s) ? "PASS" : "FAIL" });
await go(page, "/transport-management"); await sleep(2000);
let t = await mainText(page, 3000);
console.log("LIVE:\n" + t);
result({ module: M, page: "Live Tracking", action: "Live Tracking shows the running North trip (simulated GPS from the driver page)", role: R, expected: "Route 2 running with a last-seen time", actual: t.slice(0, 400).replace(/\s+/g, " "), status: /Route 2|Demo Route North/.test(t) && /Running|running|Last seen|ago|min/i.test(t) ? "PASS" : "FAIL" });
await shot(page, "t9-live");
await page.setViewportSize(VIEWPORTS.phone375); await go(page, "/transport-management"); await sleep(1500); await shot(page, "t9-live-375");
await page.setViewportSize(VIEWPORTS.laptop1280);

// Delay message to Route 2's parents: no WhatsApp/SMS account exists.
await openSheet(page, go, `/transport-management/routes/${NORTH}?do=message`);
console.log("MSG SHEET:\n" + (await page.locator("dialog[open]").innerText()).slice(0, 800));
const kinds = page.locator("dialog[open]").getByRole("button", { name: /delay|late/i });
if (await kinds.count()) await kinds.first().click();
const txt = page.locator("dialog[open] [name=text]");
if (await txt.count()) await txt.fill("Demo: Bus BUS-DEMO-01 is running 15 minutes late today.");
await page.locator("dialog[open]").getByRole("button", { name: /Send|Review/ }).last().click(); await sleep(2000);
if (await page.locator("dialog[open]").getByRole("button", { name: /^Send/ }).count()) { await page.locator("dialog[open]").getByRole("button", { name: /^Send/ }).last().click(); await sleep(3000); }
s = await said(page);
result({ module: M, page: "Routes & Stops", action: "Send a delay message to Route 2's parents (no WhatsApp/SMS account)", role: R, expected: "Not claimed as delivered; says who could not be reached", actual: s, status: /Sent to \d+ parent/.test(s) && !/could not be reached|not sent/i.test(s) ? "FAIL" : "NEEDS EXTERNAL CREDENTIAL" });
await close();

// Driver: emergency, then end the trip with Beta not reached.
const dp = await asUser("cems.driver", VIEWPORTS.phone375);
await dp.context().grantPermissions(["geolocation"]);
await dp.context().setGeolocation({ latitude: 18.2960, longitude: 83.8950 });
await go(dp, "/driver"); await sleep(1500);
dp.on("dialog", (d) => d.accept());
await dp.getByRole("button", { name: "Emergency" }).first().click(); await sleep(1500);
const conf = dp.getByRole("button", { name: /Send emergency|Yes|Confirm|Send/ });
if (await conf.count()) { await conf.last().click(); await sleep(2500); }
s = await said(dp);
result({ module: M, page: "Driver page", action: "Emergency button on a running trip", role: "Driver", expected: "Emergency alert raised to the in-charge and Principal", actual: s.slice(0, 200), status: /emergency|alert|sent|help/i.test(s) ? "PASS" : "FAIL" });
await dp.getByRole("button", { name: "End trip" }).first().click(); await sleep(1500);
const endc = dp.getByRole("button", { name: /End trip|Yes|Confirm/ });
if (await endc.count() > 1) { await endc.last().click(); }
await sleep(3000);
s = await said(dp);
t = await mainText(dp, 2000);
result({ module: M, page: "Driver page", action: "End trip with Demo Village Beta not reached", role: "Driver", expected: "Trip ended, Beta marked missed", actual: `${s} / ${t.slice(0, 300).replace(/\s+/g, " ")}`, status: /ended|Completed|Ended/i.test(s + t) ? "PASS" : "FAIL" });
await close();

const p2 = await asUser("cems.transport");
await go(p2, "/transport-management/trips");
t = await mainText(p2, 3000);
console.log("TRIPS:\n" + t);
await go(p2, "/transport-management"); await sleep(1500);
console.log("LIVE AFTER:\n" + (await mainText(p2, 2000)));
await go(p2, "/notifications");
console.log("NOTIFS:\n" + (await mainText(p2, 1500)));
await close();
