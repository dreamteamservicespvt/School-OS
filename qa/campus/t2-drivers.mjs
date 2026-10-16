// Transport: drivers and attendants, vehicle edit/archive, papers, fuel and repair costs.
import { asUser, go, mainText, close, result, sleep, shot } from "./util.mjs";
import { submit, clickB, said, openSheet } from "./util2.mjs";
const M = "Transport Management", P = "Vehicles & Drivers", R = "Transport In-charge";
const page = await asUser("cems.transport");
const V = "/transport-management/vehicles";
const D = (k) => page.locator(`dialog[open] [name=${k}]`);

async function driver({ role = "Driver", name, phone, emp = "On the staff", lic = "", exp = "", invite = true }) {
  await openSheet(page, go, `${V}?view=people&do=driver`);
  await clickB(page, role);
  await D("name").fill(name); await D("phone").fill(phone);
  await clickB(page, emp);
  if (await D("licenceNo").count()) { await D("licenceNo").fill(lic); await D("licenceExpiry").fill(exp); }
  // The invite switch is on by default.
  if (!invite && await page.locator("dialog[open]").getByText("Send the driver app invite").count()) await page.locator("dialog[open]").getByText("Send the driver app invite").click();
  return submit(page, /^Add (driver|attendant)$/);
}

const bad = [
  ["empty name and phone", { name: "", phone: "" }, /needed|at least/i],
  ["phone 9 digits", { name: "Demo Test Driver", phone: "900001002", lic: "AP3920260001", exp: "2028-01-01" }, /mobile|phone|10/i],
  ["phone with letters", { name: "Demo Test Driver", phone: "90000abcde", lic: "AP3920260001", exp: "2028-01-01" }, /mobile|phone|10/i],
  ["licence already expired", { name: "Demo Test Driver", phone: "9000099101", lic: "AP3920260001", exp: "2025-01-01" }, /expired|past|ended/i],
  ["driver without licence", { name: "Demo Test Driver", phone: "9000099102", lic: "", exp: "" }, /licence/i],
];
for (const [n, d, re] of bad) {
  const s = await driver(d);
  result({ module: M, page: P, action: `Add driver validation: ${n}`, role: R, expected: `Refused in plain words (${re})`, actual: s, status: re.test(s) && !/added as/.test(s) ? "PASS" : "FAIL" });
}

// Real (synthetic) drivers: the cems.driver login's staff phone links the login.
let s = await driver({ name: "Demo Simhachalam Mylapalli", phone: "9000010020", lic: "AP3920150001", exp: "2029-06-30" });
result({ module: M, page: P, action: "Add driver who is already staff with a login (cems.driver)", role: R, expected: "Added, linked to the staff record and their staff login, no second staff", actual: s, status: /added as driver/.test(s) ? "PASS" : "FAIL" });
s = await driver({ name: "Demo Apparao Driver", phone: "+91 90000 10023", lic: "AP3920160002", exp: "2026-11-05", invite: true });
result({ module: M, page: P, action: "Add driver with app invite (no SMS account)", role: R, expected: "Added; the invite is not claimed as sent when no message channel exists", actual: s, status: /added as driver/.test(s) ? (/invite sent/i.test(s) ? "FAIL" : "PASS") : "FAIL" });
s = await driver({ role: "Attendant", name: "Demo Lakshmi Attendant", phone: "9000010021" });
result({ module: M, page: P, action: "Add attendant (staff)", role: R, expected: "Added as attendant", actual: s, status: /added as attendant/.test(s) ? "PASS" : "FAIL" });
s = await driver({ name: "Demo Hired Driver Suresh", phone: "9000099201", emp: "Hired", lic: "AP3920170003", exp: "2028-02-02" });
result({ module: M, page: P, action: "Add hired driver (not staff)", role: R, expected: "Added, not put in Staff & HR", actual: s, status: /added as driver/.test(s) ? "PASS" : "FAIL" });
s = await driver({ name: "Demo Duplicate Ravi", phone: "9000010020", lic: "AP3920150009", exp: "2029-06-30" });
result({ module: M, page: P, action: "Add driver with a phone already used by a driver", role: R, expected: "Refused: already added", actual: s, status: /already/i.test(s) && !/added as/.test(s) ? "PASS" : "FAIL" });

await go(page, `${V}?view=people`);
const t = await mainText(page, 4000);
console.log(t);
await shot(page, "t2-drivers");
console.log("PROBLEMS", page.problems);
await close();
