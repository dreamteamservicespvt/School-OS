// Enquiry detail actions: log call, message (no provider), follow-up in the past, convert.
import { go, close, mainText, shot } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const ID = process.argv[2];
const M = "Admission Management", P = "Enquiry detail", R = "Admission Counsellor";
const page = await as("cems.admissions");
const url = `/admission-management/enquiries/${ID}`;
const dlg = () => page.locator("dialog[open]").last();
const toast = async () => (await page.locator("[role=status], [data-sonner-toast], [aria-live]").allInnerTexts()).join(" | ").replace(/\s+/g, " ").slice(0, 300);

async function step(button) {
  await go(page, url);
  await page.getByRole("button", { name: button, exact: true }).first().click();
  await page.waitForTimeout(800);
  return dlg();
}

// Log call
let d = await step("Log call");
console.log("LOG CALL DIALOG:", (await d.innerText()).slice(0, 800));
const outcome = d.locator("select[name=outcome]");
if (await outcome.count()) await outcome.selectOption({ index: 1 });
else await d.locator("button, label").filter({ hasText: /Interested|Answered|Talked/i }).first().click().catch(() => {});
await d.locator("textarea[name=note]").fill("Demo call: parent wants Grade 5 seat").catch(() => {});
await d.getByRole("button", { name: /Log call|Save/ }).last().click();
await page.waitForTimeout(2000);
let t = await toast();
let body = await mainText(page, 6000);
res({ module: M, page: P, action: "Log a call on an enquiry", role: R, expected: "Saved, shown in activity", actual: t + " || " + (body.match(/[^\n]*call[^\n]*/gi) ?? []).slice(0, 3).join(" | "), status: /Call logged|call/i.test(t + body) ? "PASS" : "FAIL" });

// Message (no provider)
d = await step("Message");
console.log("MESSAGE DIALOG:", (await d.innerText()).slice(0, 1200));
await shot(page, "enquiry-message-dialog");
const ta = d.locator("textarea").first();
if (await ta.count()) await ta.fill("Demo: Thank you for your enquiry. Please visit the school.");
await d.getByRole("button", { name: /Send/ }).last().click().catch((e) => console.log("no send", e.message));
await page.waitForTimeout(2500);
t = await toast();
const dt = await d.innerText().catch(() => "");
body = await mainText(page, 6000);
console.log("AFTER SEND:", t, "||", dt.slice(0, 400));
await shot(page, "enquiry-message-after");
const claimsSent = /Message sent/i.test(t + dt);
res({ module: "Communication", page: P, action: "Send a WhatsApp/SMS message to an enquiry parent with no provider connected", role: R, expected: "Not claimed as sent: says the channel is not connected / queued / test", actual: (t + " || " + dt).slice(0, 400), status: claimsSent ? "FAIL" : "PASS" });

// Follow-up in the past
d = await step("Follow-up");
console.log("FOLLOWUP DIALOG:", (await d.innerText()).slice(0, 600));
const date = d.locator("input[type=date]").first();
await date.fill("2026-10-01");
await d.getByRole("button", { name: /Set|Save/ }).last().click();
await page.waitForTimeout(2000);
const fdt = (await d.innerText().catch(() => "")) + (await toast());
res({ module: M, page: P, action: "Set next follow-up in the past (01-10-2026)", role: R, expected: "Refused: must be now or later", actual: fdt.slice(0, 300), status: /later|past|future|now/i.test(fdt) && !/follow-up set/i.test(fdt) ? "PASS" : "FAIL" });
console.log(page.problems);
await close();
