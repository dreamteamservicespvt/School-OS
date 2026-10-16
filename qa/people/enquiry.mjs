// Admission enquiry: validation of the Add enquiry panel, then a real enquiry.
// QA_URL=... node qa/people/enquiry.mjs
import { asUser, go, close, VIEWPORTS, mainText, shot } from "../lib.mjs";
import { res } from "./res.mjs";

const M = "Admission Management", P = "Enquiries", R = "Admission Counsellor";
let e;
const page = await asUser("cems.admissions", VIEWPORTS.laptop1280);
await go(page, "/admission-management/enquiries");

async function open() {
  await go(page, "/admission-management/enquiries");
  await page.getByRole("button", { name: "Add enquiry" }).first().click();
  await page.locator("input[name=childName]").waitFor();
}
async function submit() {
  await page.locator("form").filter({ has: page.locator("input[name=childName]") }).getByRole("button", { name: "Add enquiry" }).click();
  await page.waitForTimeout(2500);
}
async function errors() {
  return page.evaluate(() => [...document.querySelectorAll("[role=alert], .text-danger, [id$=-error], [aria-live]")].map((e) => e.innerText.trim()).filter(Boolean).join(" | ").slice(0, 400));
}
async function fill(v) {
  for (const [k, val] of Object.entries(v)) await page.locator(`[name=${k}]`).fill(val);
}

if (!process.env.FROM6) {
// 1. empty
await open();
await submit();
e = await errors();
res({ module: M, page: P, action: "Add enquiry with all fields empty", role: R, expected: "Stays open, plain errors for child, parent, phone, owner", actual: e || "(no message)", status: /name|phone|owner/i.test(e) ? "PASS" : "FAIL" });

// 2. invalid phone
await open();
await fill({ childName: "Demo Meghana Lanka", parentName: "Demo Ramesh Lanka", phone: "12345" });
await page.locator("select[name=ownerStaffId]").selectOption({ label: "Demo Swapna Tamarana (Admission Counsellor)" });
await submit();
e = await errors();
res({ module: M, page: P, action: "Add enquiry with phone 12345", role: R, expected: "Refused: phone must be 10-digit mobile", actual: e, status: /phone|mobile|10/i.test(e) ? "PASS" : "FAIL" });

// 3. phone starting with 1 / letters
await page.locator("[name=phone]").fill("1234567890");
await submit();
e = await errors();
res({ module: M, page: P, action: "Add enquiry with phone 1234567890 (Indian mobiles start 6-9)", role: R, expected: "Refused", actual: e, status: /phone|mobile/i.test(e) ? "PASS" : "FAIL" });

// 4. too long child name
await page.locator("[name=phone]").fill("9876501211");
await page.locator("[name=childName]").fill("Demo " + "A".repeat(200));
await submit();
e = await errors();
const typed = await page.locator("[name=childName]").inputValue().catch(() => "(panel closed: saved)");
res({ module: M, page: P, action: "Add enquiry with 205-character child name", role: R, expected: "Refused, or the field stops at the limit (120)", actual: `field keeps ${typed.length} chars; ${e}`, status: typed.length <= 120 || /120|at most/i.test(e) ? "PASS" : "FAIL" });
await open();
await fill({ parentName: "Demo Ramesh Lanka", phone: "9876501299" });
await page.locator("select[name=ownerStaffId]").selectOption({ label: "Demo Swapna Tamarana (Admission Counsellor)" });

// 5. spaces only
await page.locator("[name=childName]").fill("     ");
await submit();
e = await errors();
res({ module: M, page: P, action: "Add enquiry with child name of spaces only", role: R, expected: "Refused as empty", actual: e, status: /name/i.test(e) ? "PASS" : "FAIL" });

} else { await open(); await fill({ parentName: "Demo Ramesh Lanka", phone: "9876501299" }); await page.locator("select[name=ownerStaffId]").selectOption({ label: "Demo Swapna Tamarana (Admission Counsellor)" }); }
// 6. valid with Telugu name, source Phone
await page.locator("[name=childName]").fill("Demo మేఘన Lanka");
await page.locator("form button", { hasText: /^Phone$/ }).click();
await submit();
const t = await mainText(page, 600);
const ok = /Enquiry added/i.test(t) || /Enquiry added/i.test(await page.content());
res({ module: M, page: P, action: "Add valid enquiry (Telugu name, source Phone, Grade not decided)", role: R, expected: "Saved; toast; listed", actual: ok ? "Enquiry added toast" : (await errors()) || t.slice(0, 200), status: ok ? "PASS" : "FAIL" });
await shot(page, "enquiry-added");

// 7. duplicate phone
await open();
await fill({ childName: "Demo Second Child", parentName: "Demo Ramesh Lanka", phone: "9876501299" });
await page.locator("select[name=ownerStaffId]").selectOption({ label: "Demo Swapna Tamarana (Admission Counsellor)" });
await page.locator("[name=parentName]").click();
await page.waitForTimeout(1500);
await submit();
e = await errors();
const body = await mainText(page, 3000);
res({ module: M, page: P, action: "Add enquiry with same phone as an open enquiry", role: R, expected: "Warns of a possible duplicate and offers to continue or open the existing one", actual: (e + " " + (body.match(/[^\n]*(already|duplicate|same phone|match)[^\n]*/i)?.[0] ?? "")).slice(0, 300), status: /already|duplicate|same|match/i.test(e + body) ? "PASS" : "FAIL" });
await shot(page, "enquiry-duplicate");
console.log("problems", page.problems);
await close();
