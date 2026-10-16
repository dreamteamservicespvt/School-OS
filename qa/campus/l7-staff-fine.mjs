// Library: a staff member returns a damaged book; the charge is collected in cash at the desk with a receipt.
import { asUser, go, close, result, sleep } from "./util.mjs";
const M = "Library Management", R = "Librarian";
const page = await asUser("cems.librarian");
const said = async () => (await page.evaluate(() => [...document.querySelectorAll("[role=status],[role=alert],[id$=-error]")].map((e) => e.innerText.trim()).filter(Boolean).join(" | ")).catch(() => "")).replace(/\s+/g, " ");
async function waitSaid(re, n = 50) { for (let i = 0; i < n; i++) { await sleep(800); const s = await said(); if (re.test(s)) return s; } return await said(); }
const rec = (page_, action, expected, actual, ok) => result({ module: M, page: page_, action, role: R, expected, actual: actual.slice(0, 600), status: ok ? "PASS" : "FAIL" });

await go(page, "/library-management?mode=return&copy=00003"); await sleep(1500);
await page.getByRole("radio", { name: "Damaged" }).or(page.getByRole("button", { name: "Damaged" })).first().click();
await sleep(500);
await page.locator("input[name=charge]").fill("40");
await page.locator("input[name=note]").fill("Demo: spine broken");
await page.getByRole("button", { name: /^Return “/ }).click();
let s = await waitSaid(/returned by/i);
rec("Issue & Return", "Return copy 00003 from staff Demo Harika Vadde, damaged, ₹40", "Returned; damage charge ₹40 to collect at the desk", s, /returned by Demo Harika Vadde: damage charge ₹40/i.test(s));

await go(page, "/library-management/fines?status=DUE"); await sleep(1500);
const row = page.locator("tr", { hasText: "Demo Harika" }).first();
const link = row.getByRole("link", { name: "Collect", exact: true });
const has = await link.count();
rec("Fines & Stock Check", "The staff damage charge row offers Collect", "Collect shown", has ? "Collect link shown" : "no Collect link", has > 0);
if (has) {
  await link.click();
  for (let i = 0; i < 30 && !(await page.locator("dialog[open]").count()); i++) await sleep(800);
  await page.locator("dialog[open] [name=reference]").fill("Demo cash").catch(() => {});
  await page.locator("dialog[open] button[type=submit]").last().click();
  s = await waitSaid(/collected|cannot|not/i);
  rec("Fines & Stock Check", "Collect the ₹40 staff damage charge in cash", "₹40 collected, receipt number given", s, /₹40(\.00)? collected from Demo Harika Vadde\. Receipt/i.test(s));
}
console.log("done");
await close();
