// Student leaving, part 1: Harini Inti (CEMS/2026/0181) leaves by transfer. Validation, clearance
// shows the fee due, the TC is refused while fees are due (button hidden AND the certificate form
// refuses), then a waiver is asked. LOGIN picks who does it (default cems.office).
import { go, close, shot, VIEWPORTS, layoutIssues } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const M = "Student Management", LOGIN = process.env.LOGIN ?? "cems.office", R = process.env.ROLE_NAME ?? "Office Staff";
const SID = "8259c702-6c07-40a6-a6b7-a606a696305e";
const page = await as(LOGIN);
const txt = async (sel) => ((await page.locator(sel).allInnerTexts().catch(() => [])).join(" ")).replace(/\s+/g, " ");

await go(page, `/student-management/leaving/new?student=${SID}`);
await page.waitForTimeout(1200);
const main0 = await txt("main");
console.log("NEW:", main0.slice(0, 700));
if (!(await page.locator("select[name=reason]").count())) {
  res({ module: M, page: "Leaving & Alumni", action: "Open Start leaving for Harini Inti", role: R, expected: "Form opens (or a plain refusal for a role that may not)", actual: main0.slice(0, 300), status: /not allowed|cannot|no access|permission/i.test(main0) ? "PASS" : "BLOCKED" });
  await close();
  process.exit(0);
}
// student chosen?
const sv = await page.locator("input[name=studentId]").inputValue().catch(() => "");
if (sv !== SID) {
  await page.getByPlaceholder(/name|admission/i).first().fill("Harini Inti").catch(() => {});
  await page.waitForTimeout(1500);
  await page.getByRole("option", { name: /Harini Inti/ }).first().click().catch(() => {});
}
await page.locator("select[name=reason]").selectOption({ index: 1 });
await page.locator("input[name=destinationSchool]").fill("");
await page.locator("main button[type=submit]").last().click();
await page.waitForTimeout(2500);
let t = await txt("main [role=alert], main .text-bad, [role=status]");
res({ module: M, page: "Leaving & Alumni", action: "Start a transfer without the destination school", role: R, expected: "Refused: write the school the student is going to", actual: t.slice(0, 300), status: /school the student is going to/.test(t) ? "PASS" : "FAIL" });
await page.locator("input[name=destinationSchool]").fill("Demo Public School, Visakhapatnam");
await page.locator("main button[type=submit]").last().click();
await page.waitForURL(/leaving\/[0-9a-f-]{36}/, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
t = await txt("main");
const reqUrl = page.url();
await shot(page, "leaving-started");
res({ module: M, page: "Leaving & Alumni", action: "Start leaving (transfer) for Harini Inti with fees due", role: R, expected: "Leaving request made; clearance shows fees due in rupees and blocks the TC", actual: `${reqUrl.replace(/.*:\d+/, "")} ${(t.match(/Clearance pending.{0,250}/) ?? [t.slice(0, 250)])[0]}`, status: /leaving\/[0-9a-f-]{36}/.test(reqUrl) && /₹/.test(t) && /TC blocked/.test(t) ? "PASS" : "FAIL" });
const issueBtn = await page.getByRole("link", { name: "Issue TC" }).count();
res({ module: M, page: "Leaving & Alumni", action: "Issue TC button while clearance is pending", role: R, expected: "Not offered", actual: `Issue TC links: ${issueBtn}`, status: issueBtn === 0 ? "PASS" : "FAIL" });

// Try the certificate form directly
await go(page, `/student-management/certificates/new?student=${SID}&type=TC`);
await page.waitForTimeout(1500);
const c0 = await txt("main");
const submit = page.locator("main button[type=submit]").last();
if (await submit.count() && await submit.isEnabled()) { await submit.click(); await page.waitForTimeout(2500); }
const c1 = await txt("main");
await shot(page, "tc-blocked");
res({ module: M, page: "Certificates & ID Cards", action: "Ask for a TC straight from the certificate form while fees are due", role: R, expected: "Refused: TC blocked, with the amount due", actual: (c1.match(/TC blocked.{0,200}/) ?? [c1.slice(0, 300)])[0], status: /TC blocked/.test(c1) && !/requested|waiting for approval/i.test(c1.replace(/TC blocked.*/, "")) ? "PASS" : "FAIL" });

// Ask for a waiver
await go(page, reqUrl);
await page.waitForTimeout(1000);
await page.getByRole("button", { name: "Ask for waiver" }).first().click();
await page.waitForTimeout(800);
const dlg = page.locator("dialog[open]").last();
await dlg.getByRole("button", { name: "Send for approval" }).click();
await page.waitForTimeout(1200);
const e1 = await txt("dialog[open]");
res({ module: M, page: "Leaving & Alumni", action: "Ask for a fee waiver with no reason", role: R, expected: "Refused: reason needed", actual: e1.slice(0, 250), status: /reason|5 characters|at least/i.test(e1) ? "PASS" : "FAIL" });
await dlg.locator("textarea, input[type=text]").first().fill("Demo: family moving city; fees settled by cheque, QA test");
await dlg.getByRole("button", { name: "Send for approval" }).click();
await page.waitForTimeout(3000);
t = await txt("main");
res({ module: M, page: "Leaving & Alumni", action: "Ask for a fee waiver with a reason", role: R, expected: "Check shows Waiver asked, with a link to Approvals", actual: (t.match(/Clearance.{0,300}/) ?? [""])[0], status: /Waiver asked|See in Approvals/i.test(t) ? "PASS" : "FAIL" });
await page.setViewportSize(VIEWPORTS.phone375);
await page.waitForTimeout(800);
const li = await layoutIssues(page);
await shot(page, "leaving-375");
res({ module: M, page: "Leaving & Alumni", action: "Leaving request at 375px", role: R, expected: "No sideways scroll", actual: JSON.stringify(li).slice(0, 300), status: li.some((x) => x.includes("sideways")) ? "FAIL" : "PASS" });
console.log("REQ", reqUrl, page.problems);
await close();
