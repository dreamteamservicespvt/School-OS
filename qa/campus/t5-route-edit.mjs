// Transport: archive and restore routes, edit a route's crew and times, renew a licence, stops on North.
import { asUser, go, mainText, close, result, sleep, shot } from "./util.mjs";
import { submit, openSheet } from "./util2.mjs";
const M = "Transport Management", P = "Routes & Stops", R = "Transport In-charge";
const B = "/transport-management/routes";
const ID = { r1: "09b0b740-b418-4747-acb4-b42b19f76ad3", north: "5c05a200-cb2c-468a-a2ac-749e1ba50cdc", south: "7cbee390-c2b6-4a92-bca2-642adeae3c53", east: "55c41b91-39de-4602-9d59-5b8db602013e", west: "32a0215e-64d8-4b9e-a566-e574c7e6bb98", testDriver: "741096ce-99d8-42d6-9a58-9a348bc6e4b8" };
const page = await asUser("cems.transport");
const D = (k) => page.locator(`dialog[open] [name=${k}]`);
const sel = async (k, label) => { const o = await D(k).evaluate((e) => [...e.options].map((x) => ({ v: x.value, t: x.text }))); const m = o.find((x) => x.t.includes(label)); if (!m) throw new Error(`no ${label} in ${k}: ${o.map((x) => x.t)}`); await D(k).selectOption(m.v); };

async function archive(id) {
  await go(page, `${B}/${id}`);
  await page.locator("main").getByRole("button", { name: /Archive route/ }).click();
  await page.waitForSelector("dialog[open]"); await sleep(300);
  return submit(page, /^Archive Route \d+$/, { wait: 3000 });
}
let s = await archive(ID.r1);
result({ module: M, page: P, action: "Archive a route with no students (test route 1)", role: R, expected: "Archived, kept with its history", actual: s, status: /archived/.test(s) ? "PASS" : "FAIL" });
s = await archive(ID.west);
result({ module: M, page: P, action: "Archive Demo Route West (frees BUS-DEMO-01)", role: R, expected: "Archived, vehicle freed", actual: s, status: /archived/.test(s) ? "PASS" : "FAIL" });
await go(page, B);
let t = await mainText(page, 4000);
result({ module: M, page: P, action: "Archived routes listed separately", role: R, expected: "Both archived routes under Archived routes", actual: t.split("Archived routes").pop().slice(0, 200), status: /Demo Route West/.test(t.split("Archived routes").pop()) ? "PASS" : "FAIL" });

// Edit North: crew and times.
await openSheet(page, go, `${B}/${ID.north}?do=edit`);
await sel("vehicleId", "BUS-DEMO-01"); await sel("driverId", "Simhachalam"); await sel("attendantId", "Lakshmi");
await D("schoolArrival").fill("08:45"); await D("eveningDepart").fill("16:10");
s = await submit(page, "Save route", { wait: 3000 }).catch(async () => submit(page, /^Save/, { wait: 3000 }));
result({ module: M, page: P, action: "Edit Demo Route North: BUS-DEMO-01, cems.driver, attendant, 08:45 / 16:10", role: R, expected: "Saved", actual: s, status: /saved/.test(s) ? "PASS" : "FAIL" });

// Renew the expired licence by editing the driver.
await openSheet(page, go, `/transport-management/vehicles?view=people&driver=${ID.testDriver}`);
await D("licenceExpiry").fill("2031-12-31");
s = await submit(page, /^Save/, { wait: 3000 });
result({ module: M, page: "Vehicles & Drivers", action: "Edit driver: renew licence to 31-12-2031", role: R, expected: "Saved", actual: s, status: /saved/.test(s) ? "PASS" : "FAIL" });

// Stops on North (fee per stop).
async function stop(routeId, { name, pickup = "", drop = "", lat = "", lng = "", two = "", one = "" }) {
  await openSheet(page, go, `${B}/${routeId}?do=stop`);
  await D("name").fill(name); await D("pickup").fill(pickup);
  if (await D("drop").count()) await D("drop").fill(drop);
  if (await D("lat").count()) { await D("lat").fill(lat); await D("lng").fill(lng); }
  if (await D("feeTwoWay").count()) await D("feeTwoWay").fill(two);
  if (await D("feeOneWay").count()) await D("feeOneWay").fill(one);
  return submit(page, /^Add stop/, { wait: 3000 });
}
s = await stop(ID.north, { name: "Demo Village Alpha", pickup: "", two: "800" });
result({ module: M, page: P, action: "Add stop without pickup time", role: R, expected: "Refused", actual: s, status: /Pickup time is needed/.test(s) ? "PASS" : "FAIL" });
s = await stop(ID.north, { name: "Demo Village Alpha", pickup: "07:30", two: "" });
result({ module: M, page: P, action: "Add stop without its fee (route charges per stop)", role: R, expected: "Refused: fee needed", actual: s, status: /fee is needed/i.test(s) ? "PASS" : "FAIL" });
s = await stop(ID.north, { name: "Demo Village Alpha", pickup: "07:30", two: "800", lat: "95", lng: "83" });
result({ module: M, page: P, action: "Add stop with latitude 95", role: R, expected: "Refused", actual: s, status: /between -90 and 90/.test(s) ? "PASS" : "FAIL" });
s = await stop(ID.north, { name: "Demo Village Alpha", pickup: "07:30", drop: "16:45", lat: "18.2949", lng: "83.8938", two: "800", one: "500" });
result({ module: M, page: P, action: "Add stop Demo Village Alpha 07:30, ₹800 two-way, ₹500 one-way", role: R, expected: "Added as a stop", actual: s, status: /added as stop/.test(s) ? "PASS" : "FAIL" });
s = await stop(ID.north, { name: "Demo Village Beta", pickup: "07:50", drop: "16:30", lat: "18.2990", lng: "83.8990", two: "600.50" });
result({ module: M, page: P, action: "Add stop Demo Village Beta 07:50, ₹600.50", role: R, expected: "Added", actual: s, status: /added as stop/.test(s) ? "PASS" : "FAIL" });
s = await stop(ID.north, { name: "demo village beta", pickup: "07:55", two: "600" });
result({ module: M, page: P, action: "Add a second stop with the same name (other case)", role: R, expected: "Refused", actual: s, status: /added as stop/.test(s) ? "FAIL" : "PASS" });
s = await stop(ID.north, { name: "Demo Village Late", pickup: "09:30", two: "300" });
result({ module: M, page: P, action: "Add stop with pickup after the bus reaches school (09:30 > 08:45)", role: R, expected: "Refused or warned", actual: s, status: /added as stop/.test(s) ? "FAIL" : "PASS" });

await go(page, `${B}/${ID.north}`);
t = await mainText(page, 3000);
console.log(t);
await shot(page, "t5-north");
console.log("PROBLEMS", page.problems);
await close();
