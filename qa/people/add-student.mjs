// Add Student form: the full validation list in the browser. Each case fills the
// real form, clicks Add student, and reads what the server answered (the form
// state in the action's response) and what the browser itself refused.
//   QA_URL=... node qa/people/add-student.mjs
import { go, close, shot } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const dev = (process.env.QA_URL ?? "").includes("3102");
const M = "Student Management", P = dev ? "Add student (fixed build, dev server)" : "Add student", R = "School Admin";
const page = await as("cems.admin");
let last = null;

async function attempt(over, opts = {}) {
  await go(page, "/student-management/new");
  await page.locator("input[name=fullName]").waitFor();
  if (opts.more) await page.getByText("More details", { exact: true }).click();
  const v = { fullName: "Demo Varun Teja", dateOfBirth: "2016-05-12", guardianName: "Demo Prasad Teja", guardianPhone: "9876502001", ...over };
  if (!opts.empty) {
    for (const [k, val] of Object.entries(v)) await page.locator(`[name=${k}]`).fill(val);
    const sec = page.locator("select[name=sectionId]");
    const id = await sec.evaluate((el, w) => [...el.options].find((o) => o.text.startsWith(w + " "))?.value, opts.section ?? "Grade 5 A");
    await sec.selectOption(id);
    await page.locator("input[name=gender][value=Male]").check();
  }
  // Native checks first (required, date limits): what the browser itself says.
  const native = await page.evaluate(() => [...document.querySelectorAll("form input, form select, form textarea")].filter((e) => !e.checkValidity()).map((e) => `${e.name}: ${e.validationMessage}`));
  last = null;
  const resp = page.waitForResponse(async (r) => r.request().method() === "POST" && r.url().includes("/student-management/new") && /"ok":|students\//.test(await r.text().catch(() => "")), { timeout: 20000 }).catch(() => null);
  await page.locator("form").filter({ has: page.locator("input[name=fullName]") }).getByRole("button", { name: "Add student" }).click();
  if (!native.length) {
    const r = await resp;
    const t = r ? await r.text().catch(() => "") : "";
    const m = t.match(/^\w+:(\{"ok":.*\})$/m);
    if (m) last = JSON.parse(m[1]);
    await page.waitForTimeout(1500);
  } else await page.waitForTimeout(800);
  const saved = /students\/[0-9a-f-]{36}/.test(page.url());
  const shown = last ? `${last.message} ${JSON.stringify(last.errors ?? {})}` : native.length ? `browser: ${native.join("; ")}` : "(nothing)";
  return { saved, shown, url: page.url() };
}

const cases = [
  ["every field empty", {}, { empty: true }, (r) => !r.saved && /fullName|Full name|fill out/i.test(r.shown)],
  ["phone 98765 (5 digits)", { guardianPhone: "98765" }, {}, (r) => !r.saved && /10 digits/.test(r.shown)],
  ["phone 5876502001 (starts with 5)", { guardianPhone: "5876502001" }, {}, (r) => !r.saved && /6, 7, 8 or 9/.test(r.shown)],
  ["phone with letters 98765abcde", { guardianPhone: "98765abcde" }, {}, (r) => !r.saved && /digits/.test(r.shown)],
  ["birth date 01-01-2030 (future)", { dateOfBirth: "2030-01-01" }, {}, (r) => !r.saved && /past|future|must be/i.test(r.shown)],
  ["name of spaces only", { fullName: "     " }, {}, (r) => !r.saved && /name/i.test(r.shown)],
  ["205-character name", { fullName: "Demo " + "Ab".repeat(100) }, {}, (r) => !r.saved && /120|at most/i.test(r.shown)],
  ["roll number 0", { rollNo: "0" }, {}, (r) => !r.saved && /roll/i.test(r.shown)],
  ["roll number -3", { rollNo: "-3" }, {}, (r) => !r.saved && /roll/i.test(r.shown)],
  ["roll number 2.5", { rollNo: "2.5" }, {}, (r) => !r.saved && /roll/i.test(r.shown)],
  ["Aadhaar of 11 digits", { aadhaar: "12345678901" }, { more: true }, (r) => !r.saved && /aadhaar/i.test(r.shown)],
  ["admission number already used (CEMS/2026/0001)", { admissionNo: "CEMS/2026/0001" }, {}, (r) => !r.saved && /already belongs/i.test(r.shown)],
];
for (const [name, over, opts, ok] of cases) {
  const r = await attempt(over, opts);
  res({ module: M, page: P, action: `Save with ${name}`, role: R, expected: "Refused with a plain message naming the field", actual: r.saved ? `SAVED ${r.url}` : r.shown, status: ok(r) ? "PASS" : "FAIL" });
}
await shot(page, `add-student-validation${dev ? "-dev" : ""}`);
console.log(page.problems);
await close();
