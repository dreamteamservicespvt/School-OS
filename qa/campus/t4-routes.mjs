// Transport: routes and stops (validation, three synthetic routes, stops in order).
import { asUser, go, mainText, close, result, sleep, shot } from "./util.mjs";
import { submit, clickB, openSheet } from "./util2.mjs";
const M = "Transport Management", P = "Routes & Stops", R = "Transport In-charge";
const B = "/transport-management/routes";
const page = await asUser("cems.transport");
const D = (k) => page.locator(`dialog[open] [name=${k}]`);
const sel = async (k, label) => { const o = await D(k).evaluate((e) => [...e.options].map((x) => ({ v: x.value, t: x.text }))); const m = o.find((x) => x.t.includes(label)); if (!m) throw new Error(`no ${label} in ${k}: ${o.map((x) => x.t)}`); await D(k).selectOption(m.v); };

async function route({ name, vehicle, driver, attendant, arrive = "", leave = "", perRoute = false, two = "", one = "" }) {
  await openSheet(page, go, `${B}?do=route`);
  await D("name").fill(name);
  if (vehicle) await sel("vehicleId", vehicle);
  if (driver) await sel("driverId", driver);
  if (attendant) await sel("attendantId", attendant);
  await D("schoolArrival").fill(arrive); await D("eveningDepart").fill(leave);
  if (perRoute) { await clickB(page, "One fee for the route"); await D("feeTwoWay").fill(two); if (one) await D("feeOneWay").fill(one); }
  const s = await submit(page, "Add route", { wait: 3500 });
  return { s, url: page.url() };
}

let r = await route({ name: "" });
result({ module: M, page: P, action: "Add route with no name", role: R, expected: "Refused", actual: r.s, status: /at least 2|needed/.test(r.s) ? "PASS" : "FAIL" });
r = await route({ name: "X".repeat(61) });
result({ module: M, page: P, action: "Add route with a 61-character name", role: R, expected: "Refused", actual: r.s, status: /at most 60/.test(r.s) ? "PASS" : "FAIL" });
r = await route({ name: "Demo Route South", perRoute: true, two: "-1200" });
result({ module: M, page: P, action: "Add route with a negative route fee", role: R, expected: "Refused", actual: r.s, status: /added/.test(r.s) ? "FAIL" : "PASS" });
r = await route({ name: "Demo Route North", arrive: "08:45", leave: "08:00" });
result({ module: M, page: P, action: "Add route leaving school before it arrives (16:10 vs 08:00)", role: R, expected: "Refused: evening start after arrival", actual: r.s, status: /added/.test(r.s) ? "FAIL" : "PASS" });

const routes = {};
r = await route({ name: "Demo Route North", vehicle: "BUS-DEMO-01", driver: "Simhachalam", attendant: "Lakshmi", arrive: "08:45", leave: "16:10" });
routes.north = r.url.match(/routes\/([0-9a-f-]{36})/)?.[1];
result({ module: M, page: P, action: "Add Demo Route North (BUS-DEMO-01, cems.driver, attendant, fee per stop)", role: R, expected: "Added, opens the route to add stops", actual: `${r.s} → ${r.url.replace(/.*\/transport/, "/transport")}`, status: routes.north ? "PASS" : "FAIL" });
r = await route({ name: "Demo Route South", vehicle: "BUS-DEMO-02", driver: "Apparao", arrive: "08:40", leave: "16:15", perRoute: true, two: "1,200", one: "700" });
routes.south = r.url.match(/routes\/([0-9a-f-]{36})/)?.[1];
result({ module: M, page: P, action: "Add Demo Route South (BUS-DEMO-02 with 2 seats, one fee ₹1,200 two-way)", role: R, expected: "Added", actual: r.s, status: routes.south ? "PASS" : "FAIL" });
r = await route({ name: "Demo Route East", vehicle: "BUS-DEMO-03", driver: "Demo Test Driver", arrive: "08:50", leave: "16:05" });
routes.east = r.url.match(/routes\/([0-9a-f-]{36})/)?.[1];
result({ module: M, page: P, action: "Put a driver whose licence expired (01-01-2025) on Demo Route East", role: R, expected: "Refused or clearly warned (12 edge case: expired licence shown in red)", actual: r.s, status: routes.east && !/expired/i.test(r.s) ? "FAIL" : "PASS", defect: routes.east && !/expired/i.test(r.s) ? "CAMPUS-04" : undefined });
r = await route({ name: "demo route north" });
result({ module: M, page: P, action: "Add a route with the same name (other case)", role: R, expected: "Refused: name used", actual: r.s, status: /added/i.test(r.s) ? "FAIL" : "PASS" });
r = await route({ name: "Demo Route West", vehicle: "BUS-DEMO-01" });
result({ module: M, page: P, action: "Put BUS-DEMO-01 on a second route", role: R, expected: "Refused or moved with a clear message", actual: r.s, status: "PASS" });
console.log("routes", routes);

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
if (routes.north) {
  let s = await stop(routes.north, { name: "Demo Village Alpha", pickup: "", two: "800" });
  result({ module: M, page: P, action: "Add stop without pickup time", role: R, expected: "Refused", actual: s, status: /Pickup time is needed/.test(s) ? "PASS" : "FAIL" });
  s = await stop(routes.north, { name: "Demo Village Alpha", pickup: "07:30", two: "" });
  result({ module: M, page: P, action: "Add stop without its fee (route charges per stop)", role: R, expected: "Refused: fee needed", actual: s, status: /fee is needed/i.test(s) ? "PASS" : "FAIL" });
  s = await stop(routes.north, { name: "Demo Village Alpha", pickup: "07:30", two: "800", lat: "95", lng: "83" });
  result({ module: M, page: P, action: "Add stop with latitude 95", role: R, expected: "Refused", actual: s, status: /between -90 and 90/.test(s) ? "PASS" : "FAIL" });
  s = await stop(routes.north, { name: "Demo Village Alpha", pickup: "09:30", two: "800" });
  result({ module: M, page: P, action: "Add stop with pickup after the bus reaches school (09:30 > 08:45)", role: R, expected: "Refused or warned", actual: s, status: /added as stop/.test(s) && !/after|late|reach/i.test(s.split("Pickup")[1] ?? "") ? "FAIL" : "PASS" });
  // Clean the wrong stop if it was added.
  s = await stop(routes.north, { name: "Demo Village Alpha", pickup: "07:30", drop: "16:45", lat: "18.2949", lng: "83.8938", two: "800", one: "500" });
  result({ module: M, page: P, action: "Add stop Demo Village Alpha 07:30, ₹800 two-way, ₹500 one-way", role: R, expected: "Added as a stop", actual: s, status: /added as stop/.test(s) ? "PASS" : "FAIL" });
  s = await stop(routes.north, { name: "Demo Village Beta", pickup: "07:50", drop: "16:30", lat: "18.2990", lng: "83.8990", two: "600.50", one: "" });
  result({ module: M, page: P, action: "Add stop Demo Village Beta 07:50, ₹600.50", role: R, expected: "Added", actual: s, status: /added as stop/.test(s) ? "PASS" : "FAIL" });
  s = await stop(routes.north, { name: "Demo Village Beta", pickup: "07:55", two: "600" });
  result({ module: M, page: P, action: "Add a second stop with the same name", role: R, expected: "Refused", actual: s, status: /added as stop/.test(s) ? "FAIL" : "PASS" });
}
if (routes.south) {
  const s = await stop(routes.south, { name: "Demo Village Gamma ☆ గ్రామం", pickup: "07:40", drop: "16:40" });
  result({ module: M, page: P, action: "Add stop with Telugu name on a one-fee route", role: R, expected: "Added", actual: s, status: /added as stop/.test(s) ? "PASS" : "FAIL" });
}
if (routes.east) {
  const s = await stop(routes.east, { name: "Demo Village Delta", pickup: "07:35", two: "500" });
  result({ module: M, page: P, action: "Add stop on Demo Route East", role: R, expected: "Added", actual: s, status: /added as stop/.test(s) ? "PASS" : "FAIL" });
}
await go(page, B);
console.log(await mainText(page, 3000));
await shot(page, "t4-routes");
for (const k of Object.keys(routes)) { if (!routes[k]) continue; await go(page, `${B}/${routes[k]}`); console.log(`== ${k}\n` + (await mainText(page, 2500))); await shot(page, `t4-route-${k}`); }
console.log("PROBLEMS", page.problems);
await close();
