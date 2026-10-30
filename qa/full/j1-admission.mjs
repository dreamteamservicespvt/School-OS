// Journey E1, part 1: the receptionist adds a walk-in enquiry, with mistakes first.
//   node qa/full/j1-admission.mjs
import { as } from "./look.mjs";
import { go, mainText, shot, saveJson, close } from "./h.mjs";

const res = [];
const rec = (check, pass, note = "") => { res.push({ check, pass, note }); console.log(`${pass ? "PASS" : "FAIL"} ${check}${note ? " :: " + note : ""}`); };
const CHILD = "Aarav Reddy", PARENT = "Sravani Reddy", PHONE = "9848012345";
const errs = async (scope) => (await scope.locator('[id$="-error"], [role="alert"], .text-bad').allInnerTexts()).map((x) => x.trim()).filter(Boolean);

const p = await as("reception");
await go(p, "/admission-management/enquiries");
await p.getByRole("button", { name: "Add enquiry", exact: true }).first().click();
const d = p.getByRole("dialog", { name: "Add enquiry" });
await d.waitFor();
// 1. Empty form.
await d.getByRole("button", { name: "Add enquiry", exact: true }).click();
await p.waitForTimeout(1200);
let e = await errs(d);
rec("Empty enquiry form: each missing box is named", e.length >= 3, e.join(" / "));
await shot(p, "j1-enquiry-empty", false);
// 2. Short phone, impossible date.
await d.locator("[name=childName]").pressSequentially(CHILD, { delay: 15 });
await d.locator("[name=parentName]").pressSequentially(PARENT, { delay: 15 });
await d.locator("[name=phone]").pressSequentially("98480", { delay: 15 });
await d.locator("[name=classId]").selectOption({ label: "Class 3 (Main Campus)" });
await d.locator("[name=ownerStaffId]").selectOption({ label: "Naresh Kumar (Receptionist)" });
await d.locator("input[id$=-d]").click();
await d.locator("input[id$=-d]").fill(""); await d.locator("input[id$=-d]").pressSequentially("31-02-2026", { delay: 20 });
await p.keyboard.press("Tab");
await d.getByRole("button", { name: "Add enquiry", exact: true }).click();
await p.waitForTimeout(1500);
e = await errs(d);
rec("Short phone number is refused with a clear message", e.some((x) => /phone|10 digits|mobile/i.test(x)), e.join(" / "));
rec("Impossible date 31-02-2026 is refused or corrected", e.some((x) => /date/i.test(x)) || !(await d.locator("input[id$=-d]").inputValue()).includes("31-02"), `${e.join(" / ")} | box: ${await d.locator("input[id$=-d]").inputValue()}`);
await shot(p, "j1-enquiry-mistakes", false);
// 3. Correct it.
await d.locator("[name=phone]").fill("");
await d.locator("[name=phone]").pressSequentially(PHONE, { delay: 15 });
await d.locator("input[id$=-d]").fill("");
const tomorrow = new Date(Date.now() + 86400000);
const dd = `${String(tomorrow.getDate()).padStart(2, "0")}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${tomorrow.getFullYear()}`;
await d.locator("input[id$=-d]").pressSequentially(dd, { delay: 20 });
await p.keyboard.press("Tab");
await d.locator("select[id$=-t]").selectOption({ label: "10:30 AM" });
// Double click on purpose.
await d.getByRole("button", { name: "Add enquiry", exact: true }).dblclick();
await p.waitForTimeout(3000);
const t = await mainText(p, 3000);
rec("Enquiry saved and listed", t.includes(CHILD), t.slice(0, 200).replace(/\n/g, " | "));
await go(p, `/admission-management/enquiries?q=${encodeURIComponent(CHILD)}`);
const rows = (await mainText(p, 5000)).split(CHILD).length - 1;
rec("Double click made one enquiry, not two", rows === 1, `${rows} rows named ${CHILD}`);
await shot(p, "j1-enquiry-saved", false);
// Refresh and back button keep the list right.
await p.reload(); await p.waitForTimeout(1000);
rec("Refresh keeps the enquiry", (await mainText(p)).includes(CHILD));
saveJson("j1-admission.json", res);
await close();
