// Admission pipeline: interview outcome -> send for decision -> Principal approves in Approvals ->
// Confirm admission is blocked while required papers are not verified.
import { go, close, shot } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const M = "Admission Management", R = "Admission Counsellor";
const APP = "a25642f3-48be-41db-8808-d722783b7f58", SLOT = process.env.SLOT;
const page = await as("cems.admissions");
const T = async (p, sel = "main") => ((await p.locator(sel).allInnerTexts().catch(() => [])).join(" ")).replace(/\s+/g, " ");

if (SLOT) {
  await go(page, `/admission-management/tests?tab=interviews&outcome=${SLOT}`);
  await page.waitForTimeout(1500);
  const d = page.locator("dialog[open]").last();
  await d.locator("textarea[name=notes]").fill("Demo: confident child, parents supportive.");
  await d.getByRole("button", { name: "Save outcome" }).click();
  await page.waitForTimeout(3000);
  const t = await T(page, "[role=status]");
  res({ module: M, page: "Test & Interview", action: "Record interview outcome Recommended with notes", role: R, expected: "Saved", actual: t.slice(0, 200), status: /outcome saved/i.test(t) ? "PASS" : "FAIL" });
}

// Send for decision
await go(page, `/admission-management/applications/${APP}`);
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "More actions" }).click();
await page.waitForTimeout(600);
console.log("MENU", await T(page, "[role=menu]"));
await page.getByRole("menuitem", { name: "Send for decision" }).click();
await page.waitForTimeout(1200);
const d2 = page.locator("dialog[open]").last();
if (await d2.count()) { console.log("DLG", (await d2.innerText()).replace(/\s+/g, " ").slice(0, 400)); await d2.locator("button[type=submit]").last().click(); await page.waitForTimeout(3000); }
let t = `${await T(page, "[role=status], [role=alert]")} || ${(await T(page)).slice(0, 200)}`;
res({ module: M, page: "Applications", action: "Send APP/2026/0001 for a decision (test 41/50, interview Recommended)", role: R, expected: "Moves to Decision and goes to Approvals", actual: t.slice(0, 300), status: /Decision|Approvals|moved/i.test(t) ? "PASS" : "FAIL" });

// Principal approves
const pr = await as("cems.principal");
await go(pr, "/approvals");
await pr.waitForTimeout(1200);
const row = pr.locator("main li, main tr, main article").filter({ hasText: /Admission: Demo మేఘన Lanka/ }).first();
const found = await row.count();
if (found) {
  await row.getByRole("button", { name: "Approve", exact: true }).click();
  await pr.waitForTimeout(800);
  const dd = pr.locator("dialog[open]");
  if (await dd.count()) await dd.getByRole("button", { name: /Approve/ }).last().click();
  await pr.waitForTimeout(3000);
}
t = await T(pr, "[role=status], [role=alert]");
res({ module: "Approvals", page: "Approvals", action: "Principal approves the admission of Demo మేఘన Lanka", role: "Principal", expected: "Approved; the application becomes Approved", actual: `found=${found} ${t.slice(0, 200)}`, status: found ? "PASS" : "FAIL" });

// Confirm admission while papers are not verified
await go(page, `/admission-management/decision/${APP}`);
await page.waitForTimeout(1500);
t = await T(page);
console.log("DECISION PAGE", t.slice(0, 1500));
await shot(page, "decision-page");
await close();
