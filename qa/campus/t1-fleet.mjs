// Transport: vehicles (validation, add, edit), drivers and attendants.
import { asUser, go, mainText, close, result, sleep, shot } from "./util.mjs";
import { submit, fillL, clickB, said } from "./util2.mjs";
const M = "Transport Management", P = "Vehicles & Drivers", R = "Transport In-charge";
const page = await asUser("cems.transport");
const V = "/transport-management/vehicles";

async function openVehicle() { await go(page, `${V}?do=vehicle`); await sleep(600); }

// Validation cases on Add vehicle.
const cases = [
  ["empty form", {}, /needed|required|at least/i],
  ["capacity 0", { number: "AP39ZZ9001", capacity: "0" }, /between 1 and 100/i],
  ["capacity negative", { number: "AP39ZZ9001", capacity: "-5" }, /whole number|between/i],
  ["capacity decimal", { number: "AP39ZZ9001", capacity: "1.5" }, /whole number/i],
  ["capacity huge", { number: "AP39ZZ9001", capacity: "99999999999" }, /between/i],
  ["capacity letters", { number: "AP39ZZ9001", capacity: "abc" }, /whole number/i],
  ["number too long", { number: "AP39ZZ9001XXXXXXXXXXXXX", capacity: "40" }, /at most 20/i],
  ["number too short", { number: "AP", capacity: "40" }, /at least 4/i],
  ["odometer negative", { number: "AP39ZZ9001", capacity: "40", odometerKm: "-1" }, /between|whole/i],
  ["service days 3", { number: "AP39ZZ9001", capacity: "40", serviceEveryDays: "3" }, /between 7/i],
];
for (const [name, vals, expect] of cases) {
  await openVehicle();
  for (const [k, v] of Object.entries(vals)) await page.locator(`dialog[open] [name=${k}]`).fill(v);
  const s = await submit(page, "Add vehicle");
  const ok = expect.test(s) && !/problem on our side/i.test(s);
  result({ module: M, page: P, action: `Add vehicle validation: ${name}`, role: R, expected: `Refused in plain words (${expect})`, actual: s.slice(0, 200), status: ok ? "PASS" : "FAIL" });
}

// Add three synthetic vehicles.
const vehicles = [
  { number: "AP39ZZ9001", label: "BUS-DEMO-01", capacity: "40", model: "Demo Tata Starbus", ins: "2027-03-31", fit: "2026-10-25", permit: "2027-05-01", puc: "2026-10-10", odo: "45200", km: "10000", type: "Bus" },
  { number: "AP39ZZ9002", label: "BUS-DEMO-02", capacity: "2", model: "Demo Eicher", ins: "2027-03-31", fit: "2027-03-31", permit: "2027-03-31", puc: "2027-03-31", odo: "", km: "", type: "Bus" },
  { number: "AP39ZZ9003", label: "BUS-DEMO-03", capacity: "12", model: "Demo Force Traveller ☆ వ్యాన్", ins: "", fit: "", permit: "", puc: "", odo: "", km: "", type: "Van" },
];
for (const v of vehicles) {
  await openVehicle();
  const d = page.locator("dialog[open]");
  await d.locator("[name=number]").fill(v.number);
  await d.locator("[name=label]").fill(v.label);
  await clickB(page, v.type);
  await d.locator("[name=capacity]").fill(v.capacity);
  await d.locator("[name=model]").fill(v.model);
  if (v.ins) await d.locator("[name=paper_INSURANCE]").fill(v.ins);
  if (v.fit) await d.locator("[name=paper_FITNESS]").fill(v.fit);
  if (v.permit) await d.locator("[name=paper_PERMIT]").fill(v.permit);
  if (v.puc) await d.locator("[name=paper_POLLUTION]").fill(v.puc);
  if (v.odo) await d.locator("[name=odometerKm]").fill(v.odo);
  if (v.km) await d.locator("[name=serviceEveryKm]").fill(v.km);
  const s = await submit(page, "Add vehicle");
  const ok = new RegExp(`${v.label} added`).test(s);
  result({ module: M, page: P, action: `Add vehicle ${v.label} (${v.type}, ${v.capacity} seats)`, role: R, expected: "Saved, toast names it", actual: s.slice(0, 200), status: ok ? "PASS" : "FAIL" });
}

// Duplicate number (with spaces/lower case).
await openVehicle();
await page.locator("dialog[open] [name=number]").fill("ap 39 zz 9001");
await page.locator("dialog[open] [name=capacity]").fill("30");
let s = await submit(page, "Add vehicle");
result({ module: M, page: P, action: "Add vehicle with a number already used (spaces, lower case)", role: R, expected: "Refused: already added", actual: s.slice(0, 200), status: /already|exists|same/i.test(s) && !/added$/.test(s) ? "PASS" : "FAIL" });

// Double submit.
await openVehicle();
await page.locator("dialog[open] [name=number]").fill("AP39ZZ9009");
await page.locator("dialog[open] [name=capacity]").fill("30");
const btn = page.locator("dialog[open]").getByRole("button", { name: "Add vehicle", exact: true });
await Promise.all([btn.click(), btn.click({ force: true }).catch(() => {}), btn.click({ force: true }).catch(() => {})]);
await sleep(3000);
await go(page, V);
const txt = await mainText(page, 8000);
const count = (txt.match(/AP ?39 ?ZZ ?9009/gi) ?? []).length;
result({ module: M, page: P, action: "Double/triple click on Add vehicle", role: R, expected: "One vehicle saved", actual: `vehicle list shows ${count} row(s) with AP39ZZ9009`, status: count <= 1 ? "PASS" : "FAIL" });
console.log(txt.slice(0, 2500));
await shot(page, "t1-vehicles");
console.log("PROBLEMS", page.problems);
await close();
