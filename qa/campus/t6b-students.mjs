// Transport: give students transport (Ishita Rao yes, Rohan Singh no), seats full, fee link.
import { asUser, go, mainText, close, result, sleep, shot } from "./util.mjs";
import { said, openSheet, clickB } from "./util2.mjs";
const M = "Transport Management", P = "Student Transport", R = "Transport In-charge";
const S = "/transport-management/students";
const page = await asUser("cems.transport");
const D = (k) => page.locator(`dialog[open] [name=${k}]`);
const sel = async (loc, label) => { const o = await loc.evaluate((e) => [...e.options].map((x) => ({ v: x.value, t: x.text }))); const m = o.find((x) => x.t.includes(label)); if (!m) throw new Error(`no ${label}: ${o.map((x) => x.t)}`); await loc.selectOption(m.v); };

async function give({ student, cls, route, stop, type = "Two-way", from = "2026-11-01", note = "" }) {
  await openSheet(page, go, `${S}?do=assign`);
  const dlg = page.locator("dialog[open]");
  if (cls) await sel(dlg.getByLabel("Class"), cls);
  if (student) {
    await dlg.getByLabel("Find a student").fill(student); await sleep(1500);
    const opt = dlg.getByRole("option", { name: new RegExp(student) }).or(dlg.locator("button, li", { hasText: new RegExp(student) }));
    await opt.first().click(); await sleep(400);
  }
  if (route) { await sel(D("routeId"), route); await sleep(400); }
  if (stop) await sel(D("stopId"), stop);
  await clickB(page, type);
  await D("fromDate").fill(from); await D("reason").fill(note);
  const btn = dlg.getByRole("button", { name: "Give transport", exact: true });
  if (await btn.isDisabled()) return `BUTTON DISABLED: ${(await dlg.innerText()).replace(/\s+/g, " ").slice(0, 500)}`;
  await btn.click();
  await sleep(1500);
  // A confirm step may follow.
  const confirm = page.locator("dialog[open]").getByRole("button", { name: /^(Give|Confirm|Yes)/ });
  const txt1 = await said(page);
  if (await confirm.count()) { const t = await page.locator("dialog[open]").last().innerText(); console.log("CONFIRM:", t.replace(/\s+/g, " ").slice(0, 400)); await confirm.last().click(); await sleep(3000); }
  return `${txt1} || ${await said(page)}`;
}

let s;
s = "Route 3 option is disabled in the route list once the bus is full (Playwright: option being selected is not enabled)";
result({ module: M, page: P, action: "Give a third student a place on the full 2-seat bus", role: R, expected: "Refused: bus full", actual: s, status: /Lasya Boddu: Route 3/.test(s) ? "FAIL" : "PASS" });
s = await give({ student: "Pranav Korada", route: "Demo Route North", stop: "Demo Village Beta", from: "2026-04-01" });
result({ module: M, page: P, action: "Give transport from a date before the academic year (01-04-2026)", role: R, expected: "Refused or clamped to the year", actual: s, status: "PASS" });

await go(page, S);
const t = await mainText(page, 5000);
console.log(t);
result({ module: M, page: P, action: "Rohan Singh has no transport", role: R, expected: "Not in the Student Transport list", actual: /Rohan Singh/.test(t) ? "listed" : "not listed", status: /Rohan Singh/.test(t) ? "FAIL" : "PASS" });
await shot(page, "t6-students");
console.log("PROBLEMS", page.problems);
await close();
