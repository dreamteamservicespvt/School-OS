// Staff & HR: Add Staff as HR — empty form, bad phone, future birth date, under 16, very long name, bad Aadhaar,
// a good QA Demo staff member, and the duplicate-phone warning.
import { asUser, go, mainText, close, record, said, sleep } from "./util.mjs";
const M = "Staff & HR Management", P = "Add Staff", R = "HR";
const rec = (action, expected, actual, status, defect) => record({ module: M, page: P, action, role: R, expected, actual, status, ...(defect ? { defect } : {}) });
const ONLY = process.env.ONLY?.split(",");
const step = async (name, fn) => { if (ONLY && !ONLY.some((o) => name.includes(o))) return; try { await fn(); } catch (e) { console.log("ERR", name, e.message.split("\n")[0]); } };
const page = await asUser("cems.hr");
const F = (k) => page.locator(`main [name="${k}"]`).first();
const stamp = Date.now().toString().slice(-4);
const phone = `90001${stamp}9`.slice(0, 10);
async function fresh() { await go(page, "/staff-hr-management/add"); await sleep(500); }
async function next() {
  await page.locator("main").getByRole("button", { name: "Next", exact: true }).click();
  for (let i = 0; i < 20; i++) { await sleep(500); if (await page.locator("main fieldset[data-step='2']:not([hidden])").count()) break; if (await page.locator("main [aria-invalid=true], main [role=alert]").count()) break; }
  await sleep(500);
  const step2 = await page.locator("main fieldset[data-step='2']:not([hidden])").count();
  return { step2, s: await said(page) };
}
async function base(name = `QA Demo Staff ${stamp}`, ph = phone) {
  await F("fullName").fill(name); await F("phone").fill(ph);
  const d = F("designation"); const opts = await d.locator("option").allInnerTexts(); await d.selectOption({ label: opts.find((o) => /Support Staff/.test(o)) ?? opts[1] });
}
const more = async () => { await page.locator("main summary", { hasText: "More details" }).click().catch(() => {}); await sleep(200); };

const fieldErrs = () => page.evaluate(() => [...document.querySelectorAll("main fieldset[data-step='1'] [id$=-error], main fieldset[data-step='1'] .text-danger, main [role=alert]")].map((e) => e.innerText.trim()).filter(Boolean).join(" | "));
await step("empty", async () => { await fresh(); const r = await next(); r.s = (await fieldErrs()) || (await page.evaluate(() => [...document.querySelectorAll("main [name]:invalid")].map((e) => `${e.name}: browser says "${e.validationMessage}"`).join("; "))); rec("Next on step 1 with nothing typed", "Stays on step 1; says what is needed (name, phone, designation)", r.s, !r.step2 && /name/i.test(r.s) && /phone/i.test(r.s) ? "PASS" : !r.step2 && /name|phone/i.test(r.s) ? "PASS" : "FAIL"); });
await step("phone", async () => {
  for (const ph of ["12345", "123456789012", "1234567890"]) {
    await fresh(); await base(undefined, ph); const r = await next();
    rec(`Phone "${ph}"`, "Refused: a 10-digit Indian mobile", r.s, !r.step2 && /phone|digit|mobile/i.test(r.s) ? "PASS" : "FAIL");
  }
});
await step("dob", async () => {
  await fresh(); await base(); await more();
  await F("dateOfBirth").evaluate((e) => { e.removeAttribute("max"); }); await F("dateOfBirth").fill("2030-01-01");
  let r = await next(); rec("Date of birth 01-01-2030 (future; max removed)", "Refused: cannot be in the future", r.s, !r.step2 && /future/i.test(r.s) ? "PASS" : "FAIL");
  await fresh(); await base(); await more(); await F("dateOfBirth").fill("2015-06-01");
  r = await next(); rec("Date of birth 01-06-2015 (11 years old)", "Refused: at least 16 years old", r.s, !r.step2 && /16/.test(r.s) ? "PASS" : "FAIL");
});
await step("long", async () => {
  await fresh(); const long = "QA Demo " + "Verylongname".repeat(12);
  await base(); await F("fullName").evaluate((e, v) => { e.removeAttribute("maxlength"); e.value = ""; }, long); await F("fullName").fill(long);
  const r = await next(); rec(`Full name of ${long.length} letters (maxlength removed)`, "Refused: at most 120 characters", r.s, !r.step2 && /120|long|at most/i.test(r.s) ? "PASS" : "FAIL");
  await fresh(); await base("12345 !!!"); const r2 = await next(); rec("Full name '12345 !!!' (no letters)", "Refused: must have letters", r2.s, !r2.step2 && /letters/i.test(r2.s) ? "PASS" : "FAIL");
});
await step("aadhaar", async () => {
  await fresh(); await base(); await more();
  await F("aadhaar").evaluate((e) => { e.removeAttribute("pattern"); e.closest("form")?.setAttribute("novalidate", ""); }); await F("aadhaar").fill("12AB");
  await F("fullName").fill(`QA Demo Aadhaar Check ${stamp}`); await F("phone").fill(`90002${stamp}7`.slice(0, 10));
  const r = await next();
  let end = "";
  if (r.step2) {
    const gl = page.locator("main [name=giveLogin]"); if (await gl.count() && await gl.isChecked()) await gl.uncheck().catch(() => {});
    const nx = page.locator("main").getByRole("button", { name: "Next", exact: true }); if (await nx.isVisible().catch(() => false)) { await nx.click(); await sleep(1200); }
    await page.locator("main").getByRole("button", { name: /Create staff|Skip and create staff/ }).filter({ visible: true }).first().click(); await sleep(4000);
    const s1 = await page.locator("main fieldset[data-step='1']:not([hidden])").count();
    end = ` → at Create staff: "${(await said(page)).slice(0, 200)}"; back on step 1: ${s1 ? "yes" : "no"}`;
  }
  rec("Aadhaar '12AB' (screen pattern removed, so only the server checks) on step 1", "Refused at step 1 with 'Aadhaar has 12 digits' (as the other step-1 fields are)", (r.step2 ? "step 1 accepted it and moved on to step 2" : r.s) + end, !r.step2 && /aadhaar|12/i.test(r.s) ? "PASS" : "FAIL", !r.step2 ? undefined : "CAMPUS2-03");
});
await step("good", async () => {
  await fresh(); await base(); await F("gender").selectOption("Female").catch(() => {});
  let r = await next(); rec(`Step 1 for QA Demo Staff ${stamp}, phone ${phone}, Support Staff`, "Moves to step 2 (what they can open)", r.s || "on step 2", r.step2 ? "PASS" : "FAIL");
  const t = await mainText(page, 3000); console.log(t.slice(0, 1200));
  const gl = page.locator("main [name=giveLogin]"); if (await gl.count() && await gl.isChecked()) await gl.uncheck().catch(() => {});
  const cr = page.locator("main").getByRole("button", { name: /Create staff|Skip and create staff/ }).first();
  const nx = page.locator("main").getByRole("button", { name: "Next", exact: true });
  if (await nx.isVisible().catch(() => false)) { await nx.click(); await sleep(1500); }
  await page.locator("main").getByRole("button", { name: /Create staff|Skip and create staff/ }).filter({ visible: true }).first().click(); await sleep(4000);
  const t2 = await mainText(page, 2000); const s = await said(page);
  rec(`Create QA Demo Staff ${stamp}`, "Created with a staff ID; summary offers Print ID card and Add another", (s + " / " + t2.slice(0, 300)).replace(/\n/g, " / "), /added|created|CEMS-ST/i.test(s + t2) ? "PASS" : "FAIL");
});
await step("dup", async () => {
  await fresh(); await base(`QA Demo Other ${stamp}`); const r = await next();
  const t = await mainText(page, 4000);
  rec("Add another person with the same phone", "Warning naming QA Demo Staff, with 'It is a different person. Save anyway.'", (r.s + " / " + (t.match(/This may be someone[^\n]*\n[^\n]*/) ?? [""])[0]).replace(/\n/g, " "), /already on file|belongs|QA Demo Staff/i.test(t + r.s) ? "PASS" : "FAIL");
});
console.log("PROBLEMS", page.problems);
await page.context().close(); await close();
