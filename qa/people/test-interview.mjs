// Admission entrance test and interview for APP/2026/0001 (Demo మేఘన Lanka), as cems.admissions,
// after the Test and Interview stages were switched on in Admission Settings.
import { go, close, shot } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const M = "Admission Management", P = "Test & Interview", R = "Admission Counsellor";
const page = await as("cems.admissions");
const T = async (sel = "main") => ((await page.locator(sel).allInnerTexts().catch(() => [])).join(" ")).replace(/\s+/g, " ");
const sheet = () => page.locator("dialog[open]").last();

let t = "";
if (!process.env.SKIP_SCHEDULE) {
await go(page, "/admission-management/tests");
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Schedule test" }).first().click();
await page.waitForTimeout(800);
const tomorrow = new Date(Date.now() + 86400000 + 5.5 * 3600000).toISOString().slice(0, 10);
const def = await sheet().locator("input[type=date]").first().inputValue();
console.log("DEFAULT DATE", def);
if (!process.env.QA_URL) res({ module: M, page: P, action: "Schedule test sheet: default date and time", role: R, expected: "A time in the future (tomorrow 9:30)", actual: `default ${def} 9:30 at ${new Date().toISOString()} (UTC); submitting it unchanged says: The test date and time must be in the future.`, status: def > new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10) ? "PASS" : "FAIL", defect: "PEOPLE-20" });
await sheet().locator("input[type=date]").first().fill(tomorrow);
// nobody chosen
await sheet().locator("button[type=submit]").last().click();
await page.waitForTimeout(1500);
t = await T("dialog[open]");
res({ module: M, page: P, action: "Schedule a test with no applicant chosen", role: R, expected: "Refused: choose applicants", actual: t.slice(0, 250), status: /(Choose|Pick)[^.]*applicant/i.test(t) && !/scheduled/i.test(t) ? "PASS" : "FAIL" });
await sheet().getByRole("button", { name: /Demo మేఘన Lanka/ }).click();
await sheet().locator("input[name=venue]").fill("Demo exam hall");
await sheet().locator("input[name=maxMarks]").fill("50");
await sheet().locator("button[type=submit]").last().click();
await page.waitForTimeout(3500);
t = `${await T("[role=status]")} || ${await T("dialog[open]")}`;
await shot(page, "test-scheduled");
res({ module: M, page: P, action: "Schedule an entrance test (max 50) for Demo మేఘన Lanka, no SMS/WhatsApp connected", role: R, expected: "Scheduled; says plainly the parent was not sent the details", actual: t.slice(0, 300), status: /Test scheduled for 1 applicant/.test(t) ? (/0 parents were sent/.test(t) ? "PASS" : "FAIL") : "FAIL" });

}
if (!process.env.SKIP_SCORES) {
// Scores
await go(page, `/admission-management/tests/${process.env.TEST_ID}`);
await page.waitForTimeout(1500);
const score = page.locator("input[aria-label^='Score for']").first();
await score.fill("75");
await page.locator("main button[type=submit]").filter({ hasText: /Save/ }).first().click();
await page.waitForTimeout(2000);
t = `${await T("[role=status], [role=alert]")} || ${(await T()).slice(0, 200)}`;
res({ module: M, page: P, action: "Enter score 75 for a test out of 50", role: R, expected: "Refused: score above the maximum", actual: t.slice(0, 300), status: /50|maximum|more than/i.test(t) && !/Scores saved/i.test(t) ? "PASS" : "FAIL" });
await score.fill("41");
await page.locator("input[aria-label^='Remarks for']").first().fill("Demo: good in maths");
await page.locator("main button[type=submit]").filter({ hasText: /Save/ }).first().click();
await page.waitForTimeout(2500);
t = `${await T("[role=status], [role=alert]")}`;
await shot(page, "test-scores");
res({ module: M, page: P, action: "Enter score 41 / 50 with remarks", role: R, expected: "Saved", actual: t.slice(0, 250), status: /saved/i.test(t) ? "PASS" : "FAIL" });

}
// Interview
await go(page, "/admission-management/tests?tab=interviews");
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Schedule interview" }).first().click();
await page.waitForTimeout(2500);
const app = sheet().locator("select[name=applicationId]");
const opts = await app.locator("option").allInnerTexts();
await app.selectOption({ label: opts.find((o) => /Demo మేఘన Lanka/.test(o)) });
await page.waitForTimeout(1500);
console.log("INTERVIEW SHEET", (await T("dialog[open]")).slice(0, 600));
await sheet().locator("button[type=submit]").last().click();
await page.waitForTimeout(3500);
t = `${await T("[role=status]")} || ${await T("dialog[open]")}`;
await shot(page, "interview-booked");
res({ module: M, page: P, action: "Schedule an interview slot for Demo మేఘన Lanka", role: R, expected: "Booked in a free 15-minute slot", actual: t.slice(0, 300), status: /booked|scheduled/i.test(t) ? "PASS" : "FAIL" });
console.log(page.problems);
await close();
