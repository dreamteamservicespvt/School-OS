// Library fines: waive (reason needed, fee line removed), staff fine from salary, collect at the desk with a receipt.
import { asUser, go, close, result, sleep } from "./util.mjs";
const M = "Library Management", P = "Fines & Stock Check", R = "Librarian";
const said = async (page) => (await page.evaluate(() => [...document.querySelectorAll("[role=status],[role=alert],[id$=-error]")].map((e) => e.innerText.trim()).filter(Boolean).join(" | ")).catch(() => "")).replace(/\s+/g, " ");
async function waitSaid(page, re, n = 40) { for (let i = 0; i < n; i++) { await sleep(800); const s = await said(page); if (re.test(s)) return s; } return await said(page); }
const rec = (action, expected, actual, ok, extra = {}) => result({ module: M, page: P, action, role: R, expected, actual: actual.slice(0, 600), status: ok ? "PASS" : "FAIL", ...extra });
async function sheet(page, url) {
  await go(page, url);
  for (let i = 0; i < 30 && !(await page.locator("dialog[open]").count()); i++) await sleep(800);
  return (await page.locator("dialog[open]").innerText().catch(() => "")).replace(/\s+/g, " ");
}
const submit = (page) => page.locator("dialog[open] button[type=submit]").last().click();

const sps = await asUser("librarian");
// 1. Waive LF-0019 (in the fees): a too-short reason, then a real one.
let d = await sheet(sps, "/library-management/fines?waive=f6423c61-9138-49df-b155-16f8e46a1f0d");
console.log("WAIVE SHEET", d.slice(0, 400));
await sps.locator("dialog[open] [name=reason]").fill("no");
await submit(sps);
let s = await waitSaid(sps, /reason|at least|waived/i);
rec("Waive LF-0019 with reason 'no'", "Refused: a longer reason is needed", s, /reason/i.test(s) && !/Fine waived/i.test(s));
await sps.locator("dialog[open] [name=reason]").fill("Demo: book was returned by the sibling on time");
await submit(sps);
s = await waitSaid(sps, /waived/i);
rec("Waive LF-0019 (₹10, added to fees) with a reason", "Fine waived; its fee line is no longer due", s, /Fine waived/i.test(s));

// 2. LF-0021: a staff member's fine taken from salary.
d = await sheet(sps, "/library-management/fines?salary=6b6eac94-feb6-471e-914b-e24d65447fed");
console.log("SALARY SHEET", d.slice(0, 400));
await submit(sps);
s = await waitSaid(sps, /salary|cannot/i);
rec("Send LF-0021 (₹12, staff Lakshmi Rao) to be taken from salary", "Will be taken from the next salary", s, /will be taken from .* next salary/i.test(s));

// 3. CEMS: collect Aarav Patel's ₹150 damage charge in cash at the desk.
const cems = await asUser("cems.librarian");
d = await sheet(cems, "/library-management/fines?collect=c8b83b92-8697-47df-a26c-21cd3a0ed55b");
console.log("COLLECT SHEET", d.slice(0, 400));
await submit(cems);
s = await waitSaid(cems, /how it was paid|collected|choose/i);
rec("Collect LF-0001 without choosing how it was paid", "Refused: choose how it was paid", s, /how it was paid/i.test(s));
const cash = cems.locator("dialog[open]").getByText("Cash", { exact: true });
if (await cash.count()) await cash.first().click(); else await cems.locator("dialog[open] [name=mode]").selectOption("CASH").catch(() => {});
await submit(cems);
s = await waitSaid(cems, /collected/i);
rec("Collect LF-0001 (₹150 damage, Aarav Patel) in cash", "₹150 collected, receipt number given", s, /₹150(\.00)? collected from Aarav Patel/i.test(s));
console.log("done");
await close();
