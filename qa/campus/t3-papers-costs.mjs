// Transport: vehicle papers, fuel and repair costs (to Finance), vendors, edit and archive a vehicle.
import { asUser, go, mainText, close, result, sleep, shot } from "./util.mjs";
import { submit, clickB, openSheet } from "./util2.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
const M = "Transport Management", P = "Vehicles & Drivers", R = "Transport In-charge";
const V = "/transport-management/vehicles";
const page = await asUser("cems.transport");
const D = (k) => page.locator(`dialog[open] [name=${k}]`);
const FILES = "/home/claude/qa-out/campus/files"; mkdirSync(FILES, { recursive: true });
// A 1x1 PNG and a fake program.
writeFileSync(`${FILES}/puc-demo.png`, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
writeFileSync(`${FILES}/virus-demo.exe`, Buffer.from("MZ this is not a real program"));
writeFileSync(`${FILES}/fake.png`, Buffer.from("MZ this is a program renamed to png"));
const sel = async (k, label) => { const o = await D(k).evaluate((e) => [...e.options].map((x) => ({ v: x.value, t: x.text }))); await D(k).selectOption(o.find((x) => x.t.includes(label)).v); };

async function paper({ vehicle, kind, no = "", exp = "", file = null }) {
  await openSheet(page, go, `${V}?view=papers&do=paper`);
  await sel("vehicleId", vehicle); await sel("kind", kind);
  await D("paperNo").fill(no); await D("expiresOn").fill(exp);
  if (file) await D("file").setInputFiles(file);
  return submit(page, "Save paper", { wait: 3500 });
}
let s = await paper({ vehicle: "BUS-DEMO-01", kind: "PUC", no: "PUC-DEMO-1", exp: "" });
result({ module: M, page: P, action: "Upload paper without expiry date", role: R, expected: "Refused: expiry needed", actual: s, status: /needed/i.test(s) ? "PASS" : "FAIL" });
s = await paper({ vehicle: "BUS-DEMO-01", kind: "PUC", no: "PUC-DEMO-1", exp: "2027-04-10", file: `${FILES}/virus-demo.exe` });
result({ module: M, page: P, action: "Upload paper with a .exe file", role: R, expected: "Refused in plain words", actual: s, status: /saved for/i.test(s) ? "FAIL" : "PASS" });
s = await paper({ vehicle: "BUS-DEMO-01", kind: "PUC", no: "PUC-DEMO-1", exp: "2027-04-10", file: `${FILES}/fake.png` });
result({ module: M, page: P, action: "Upload paper with a program renamed to .png", role: R, expected: "Refused (content is not an image)", actual: s, status: /saved for/i.test(s) ? "FAIL" : "PASS" });
s = await paper({ vehicle: "BUS-DEMO-01", kind: "PUC", no: "PUC-DEMO-1", exp: "2025-01-01" });
result({ module: M, page: P, action: "Renew paper with an expiry date in the past", role: R, expected: "Refused or warned", actual: s, status: /saved for/i.test(s) && !/expired|past/i.test(s) ? "FAIL" : "PASS" });
s = await paper({ vehicle: "BUS-DEMO-01", kind: "PUC", no: "PUC-DEMO-1", exp: "2027-04-10", file: `${FILES}/puc-demo.png` });
result({ module: M, page: P, action: "Renew expired PUC with a photo", role: R, expected: "Saved, valid till 10-04-2027", actual: s, status: /saved for BUS-DEMO-01/.test(s) && /10-04-2027/.test(s) ? "PASS" : "FAIL" });

// Fuel and repairs: money validation, then real entries that reach Finance.
async function cost({ kind = "Fuel", vehicle = "BUS-DEMO-01", date = "2026-10-15", amount, litres = "", odo = "", what = "" }) {
  await openSheet(page, go, `${V}?view=costs&do=cost`);
  await clickB(page, kind);
  await sel("vehicleId", vehicle); await D("date").fill(date); await D("amount").fill(amount);
  if (await D("litres").count()) await D("litres").fill(litres);
  await D("odometerKm").fill(odo); await D("what").fill(what);
  return submit(page, "Record", { wait: 3500 });
}
for (const [n, a, re] of [["negative", "-500", /amount in rupees/i], ["zero", "0", /more than|at least|zero|needed|greater/i], ["three decimals", "100.555", /amount in rupees/i], ["huge", "99999999999", /too large/i], ["letters", "abc", /amount in rupees/i]]) {
  s = await cost({ amount: a, litres: "10" });
  result({ module: M, page: P, action: `Record fuel validation: amount ${n} (${a})`, role: R, expected: `Refused (${re})`, actual: s, status: re.test(s) && !/recorded for/.test(s) ? "PASS" : "FAIL", ...(re.test(s) ? {} : { defect: n === "zero" ? "CAMPUS-03" : undefined }) });
}
s = await cost({ amount: "3500.50", litres: "-3", odo: "45500" });
result({ module: M, page: P, action: "Record fuel with negative litres", role: R, expected: "Refused", actual: s, status: /recorded for/.test(s) ? "FAIL" : "PASS" });
s = await cost({ amount: "3500.50", litres: "35.5", odo: "45500", what: "Demo Fuel Station", date: "2027-01-01" });
result({ module: M, page: P, action: "Record fuel with a future date", role: R, expected: "Refused: date in the future", actual: s, status: /recorded for/.test(s) ? "FAIL" : "PASS" });
s = await cost({ amount: "3,500.50", litres: "35.5", odo: "45500", what: "Demo Fuel Station" });
result({ module: M, page: P, action: "Record fuel ₹3,500.50 for BUS-DEMO-01", role: R, expected: "Saved and added to Finance, Expenses", actual: s, status: /₹3,500\.50 recorded/.test(s) && /Finance/.test(s) ? "PASS" : "FAIL" });
s = await cost({ kind: "Repair", amount: "1200", odo: "", what: "Demo brake pad change" });
result({ module: M, page: P, action: "Record repair ₹1,200 for BUS-DEMO-01", role: R, expected: "Saved and added to Finance, Expenses", actual: s, status: /₹1,200(\.00)? recorded/.test(s) ? "PASS" : "FAIL" });

await go(page, `${V}?view=costs`);
console.log((await mainText(page, 3000)).split("Search").pop());
await shot(page, "t3-costs");

// Vendors.
async function vendor(v) {
  await openSheet(page, go, `${V}?view=vendors&do=vendor`);
  for (const [k, x] of Object.entries(v)) await D(k).fill(x);
  return submit(page, "Add vendor");
}
s = await vendor({ name: "Demo Travels", email: "not-an-email", phone: "12345" });
result({ module: M, page: P, action: "Add vendor with a bad email and phone", role: R, expected: "Refused in plain words", actual: s, status: /saved/i.test(s) ? "FAIL" : "PASS" });
s = await vendor({ name: "Demo Travels", gstin: "NOTAGSTIN" });
result({ module: M, page: P, action: "Add vendor with an invalid GSTIN", role: R, expected: "Refused: GSTIN format", actual: s, status: /saved/i.test(s) ? "FAIL" : "PASS" });
s = await vendor({ name: "Demo Travels", gstin: "37ABCDE1234F1Z5", phone: "9000099301", monthlyCharge: "-100" });
result({ module: M, page: P, action: "Add vendor with a negative monthly charge", role: R, expected: "Refused", actual: s, status: /saved/i.test(s) ? "FAIL" : "PASS" });
s = await vendor({ name: "Demo Travels", contactName: "Demo Contact", gstin: "37ABCDE1234F1Z5", phone: "9000099301", monthlyCharge: "25000", contractEnd: "2027-03-31", bankAccountNo: "000111222333", ifsc: "SBIN0000001", bankName: "Demo Bank" });
result({ module: M, page: P, action: "Add vendor Demo Travels with bank details", role: R, expected: "Saved", actual: s, status: /Demo Travels saved/.test(s) ? "PASS" : "FAIL" });
await go(page, `${V}?view=vendors`);
const vt = await mainText(page, 3000);
result({ module: M, page: P, action: "Vendor bank account is masked in the list", role: R, expected: "Only the last 4 digits shown", actual: vt.match(/.*2333.*|.*000111222333.*/)?.[0] ?? "account not shown", status: /000111222333/.test(vt) ? "FAIL" : "PASS" });
console.log("PROBLEMS", page.problems);
await close();
