// Duplicate enquiry warning (same phone as an open enquiry).
import { asUser, go, close, VIEWPORTS, mainText, shot } from "../lib.mjs";
import { res } from "./res.mjs";

const page = await asUser("cems.admissions", VIEWPORTS.laptop1280);
await go(page, "/admission-management/enquiries");
await page.getByRole("button", { name: "Add enquiry" }).first().click();
await page.locator("input[name=childName]").fill("Demo Second Child");
await page.locator("input[name=parentName]").fill("Demo Ramesh Lanka");
await page.locator("input[name=phone]").fill("9876501299");
await page.locator("input[name=parentName]").click();
await page.waitForTimeout(2500);
const dialog = page.locator("form").filter({ has: page.locator("input[name=childName]") });
const t1 = await dialog.innerText();
console.log("AFTER BLUR:\n", t1.slice(0, 1500));
await shot(page, "enquiry-dup-blur");
const buttons = await dialog.locator("button").allInnerTexts();
console.log("BUTTONS", buttons);
res({ module: "Admission Management", page: "Enquiries", action: "Type a phone that an open enquiry already has", role: "Admission Counsellor", expected: "Warns while typing and shows the earlier enquiry", actual: (t1.match(/[^\n]*(already|same|match|duplicate|Demo మేఘన)[^\n]*/gi) ?? []).join(" | "), status: /already|same|match|duplicate|మేఘన/i.test(t1) ? "PASS" : "FAIL" });
await close();
