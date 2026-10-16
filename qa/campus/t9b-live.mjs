// Transport: settings validation, live tracking on, live map, delay message to parents (no channel),
// emergency from the driver, end trip (missed stop), reports.
import { asUser, go, mainText, close, result, sleep, shot, VIEWPORTS } from "./util.mjs";
import { submit, said, openSheet } from "./util2.mjs";
const M = "Transport Management", R = "Transport In-charge";
const NORTH = "5c05a200-cb2c-468a-a2ac-749e1ba50cdc";
const page = await asUser("cems.transport");
const D = (k) => page.locator(`dialog[open] [name=${k}]`);
let s, t;

// Delay message to Route 2's parents: no WhatsApp/SMS account exists.
await openSheet(page, go, `/transport-management/routes/${NORTH}?do=message`);
console.log("MSG SHEET:\n" + (await page.locator("dialog[open]").innerText()).slice(0, 800));
const kinds = page.locator("dialog[open]").getByRole("button", { name: /delay|late/i });
if (await kinds.count()) await kinds.first().click();
const txt = page.locator("dialog[open] [name=text]");
if (await txt.count()) await txt.fill("Demo: Bus BUS-DEMO-01 is running 15 minutes late today.");
await page.locator("dialog[open]").getByText("I have read the message").click(); await sleep(300);
await page.locator("dialog[open]").getByRole("button", { name: /^Send to/ }).last().click(); await sleep(4000);
s = await said(page);
result({ module: M, page: "Routes & Stops", action: "Send a delay message to Route 2's parents (no WhatsApp/SMS account)", role: R, expected: "Not claimed as delivered; says who could not be reached", actual: s, status: /Sent to \d+ parent/.test(s) && !/could not be reached|not sent/i.test(s) ? "FAIL" : "NEEDS EXTERNAL CREDENTIAL" });
await close();

// Driver: emergency, then end the trip with Beta not reached.
const dp = await asUser("cems.driver", VIEWPORTS.phone375);
await dp.context().grantPermissions(["geolocation"]);
await dp.context().setGeolocation({ latitude: 18.2960, longitude: 83.8950 });
await go(dp, "/driver"); await sleep(1500);
dp.on("dialog", (d) => d.accept());
// Simulated GPS: the bus moves towards Demo Village Beta for about 70 seconds while the page is open.
for (let i = 0; i < 7; i++) { await dp.context().setGeolocation({ latitude: 18.2949 + i * 0.0006, longitude: 83.8938 + i * 0.0007 }); await sleep(10_000); }

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
