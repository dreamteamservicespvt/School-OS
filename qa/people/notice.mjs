// Communication: a notice to Grade 5 A parents, published by the Principal, then seen on Kavya
// Reddy's Parent Link. Validation first. Then Office Staff publishes one (Own: may need approval).
//   node qa/people/notice.mjs <pl-fixture.json>
import { readFileSync } from "node:fs";
import { go, close, shot, newPage, BASE, VIEWPORTS } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const M = "Communication", P = "Notices";
const SECTION = "949e25d2-78bc-48aa-a6b6-7fd678175201";
const [kavya] = JSON.parse(readFileSync(process.argv[2], "utf8").trim().split("\n").pop());
const T = async (p, sel = "main") => ((await p.locator(sel).allInnerTexts().catch(() => [])).join(" ")).replace(/\s+/g, " ");
const TITLE = `Demo notice: PTM for Grade 5 A ${new Date().toISOString().slice(11, 16)}`;

async function fillNotice(page, title) {
  await go(page, "/communication/notices/new");
  await page.waitForTimeout(1200);
  await page.locator("input[name=title]").fill(title);
  await page.locator("textarea[name=body]").fill("Dear parents, the Parent-Teacher Meeting for Grade 5 A is on Saturday 24-10-2026, 9:30 AM to 12:30 PM. Demo notice for QA.");
  const parents = page.locator("input[name=parents]");
  if (!(await parents.isChecked())) await parents.check();
  await page.locator(`input[name=sectionIds][value="${SECTION}"]`).check();
}

const pr = await as("cems.principal");
// validation
await go(pr, "/communication/notices/new");
await pr.waitForTimeout(1200);
await pr.locator("form").getByRole("button", { name: /^(Publish|Send for approval)$/ }).click();
await pr.waitForTimeout(1500);
let t = await T(pr, "main [role=alert], main .text-bad, [role=status]");
res({ module: M, page: P, action: "Publish a notice with no title, text or audience", role: "Principal", expected: "Refused; title, text and who it is for are named", actual: t.slice(0, 250), status: /title|text|fill|who/i.test(t) && !/Published/.test(t) ? "PASS" : "FAIL" });

await fillNotice(pr, TITLE);
const btn = pr.locator("form").getByRole("button", { name: /^(Publish|Send for approval)$/ });
const label = await btn.innerText();
await btn.click();
await pr.waitForURL(/notices\/[0-9a-f-]{36}/, { timeout: 20000 }).catch(() => {});
await pr.waitForTimeout(1500);
t = `${await T(pr, "[role=status]")} || ${(await T(pr)).slice(0, 400)}`;
await shot(pr, "notice-published");
res({ module: M, page: P, action: `Principal publishes a notice to Grade 5 A parents (button "${label}")`, role: "Principal", expected: "Published; reach shown honestly (Parent Link only, no WhatsApp/SMS connected)", actual: t.slice(0, 400), status: /Published/.test(t) ? "PASS" : "FAIL" });

// Kavya's Parent Link shows it
const g = await newPage(VIEWPORTS.phone375);
await g.context().addCookies([{ name: kavya.cookie, value: kavya.key, domain: new URL(BASE).hostname, path: "/p" }]);
await g.goto(`${BASE}${kavya.path}`);
await g.waitForLoadState("networkidle").catch(() => {});
const pl = (await g.locator("body").innerText()).replace(/\s+/g, " ");
await shot(g, "pl-kavya-notice");
res({ module: M, page: "Parent Link (guardian page)", action: "Kavya Reddy's guardian sees the Grade 5 A notice", role: "Parent (no login)", expected: "Notice listed with its title and date", actual: (pl.match(/.{0,80}Demo notice.{0,120}/) ?? [pl.slice(0, 250)])[0], status: pl.includes(TITLE) ? "PASS" : "FAIL" });

// Office Staff (Communication: Own)
const off = await as("cems.office");
await fillNotice(off, `${TITLE} (office)`);
const ob = off.locator("form").getByRole("button", { name: /^(Publish|Send for approval)$/ });
const olabel = (await ob.count()) ? await ob.innerText() : "none";
if (await ob.count()) { await ob.click(); await off.waitForURL(/notices\/[0-9a-f-]{36}/, { timeout: 20000 }).catch(() => {}); await off.waitForTimeout(1500); }
t = `${await T(off, "[role=status], main [role=alert]")} || ${(await T(off)).slice(0, 250)}`;
res({ module: M, page: P, action: `Office Staff publishes a notice to Grade 5 A parents (button "${olabel}")`, role: "Office Staff", expected: "Either published within their scope or sent for approval, in plain words", actual: t.slice(0, 300), status: /Published|Sent for approval|cannot|not allowed/i.test(t) ? "PASS" : "FAIL" });
console.log(pr.problems, off.problems, g.problems);
await close();
