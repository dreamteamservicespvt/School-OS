// Convert an enquiry to an application: validation, then save.
import { go, close, mainText, shot } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const ENQ = process.argv[2];
const M = "Admission Management", P = "New application", R = "Admission Counsellor";
const page = await as("cems.admissions");
const url = `/admission-management/applications/new?enquiry=${ENQ}`;
const save = async () => { await page.getByRole("button", { name: "Save application" }).click(); await page.waitForTimeout(3000); };
const errs = async () => (await page.locator("main").innerText()).split("\n").filter((l) => /needed|must|cannot|not a|invalid|future|choose|at most|digits|start with/i.test(l)).slice(0, 6).join(" | ");

await go(page, url);
// 1. class missing, DOB in future, address empty
await page.locator("input[name=dateOfBirth]").fill("2030-01-01");
await save();
var e = await errs();
res({ module: M, page: P, action: "Save application with no class, future birth date, no address, no gender", role: R, expected: "Refused, each problem named", actual: e, status: e ? "PASS" : "FAIL" });
await page.locator("button", { hasText: /^Girl$/ }).click();
await page.locator("select[name=classId]").selectOption({ label: "Grade 5" });
await page.locator("textarea[name=address]").fill("Demo address, Chekkapalli, Andhra Pradesh");
await save();
e = await errs();
res({ module: M, page: P, action: "Save application with birth date 01-01-2030 (future)", role: R, expected: "Refused: birth date is in the future", actual: e, status: /future|birth/i.test(e) ? "PASS" : "FAIL" });
await shot(page, "application-errors");

// 2. now valid
await page.locator("select[name=classId]").selectOption({ label: "Grade 5" });
await page.locator("input[name=dateOfBirth]").fill("2016-02-14");
await page.locator("input[name=motherName]").fill("Demo Lakshmi Lanka");
await page.locator("textarea[name=address]").fill("Demo address, Chekkapalli, Andhra Pradesh");
await save();
const after = page.url();
const t = await mainText(page, 2500);
console.log(after, "\n", t.slice(0, 1500));
await shot(page, "application-saved");
res({ module: M, page: P, action: "Save a complete application from an enquiry (no consent code: no SMS account)", role: R, expected: "Saved with an application number, or a plain message why consent is needed", actual: `${after.replace(/.*3000/, "")} :: ${t.slice(0, 250)}`, status: /applications\/[0-9a-f-]{36}/.test(after) ? "PASS" : "FAIL" });
console.log(page.problems);
await close();
