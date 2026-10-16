// Library fines: collect at the desk in cash (Cash is chosen by default).
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

// 3. CEMS: collect Aarav Patel's ₹150 damage charge in cash at the desk.
const cems = await asUser("cems.librarian");
let s; let d = await sheet(cems, "/library-management/fines?collect=c8b83b92-8697-47df-a26c-21cd3a0ed55b");
console.log("COLLECT SHEET", d.slice(0, 400));
await submit(cems);
s = await waitSaid(cems, /collected/i);
rec("Collect LF-0001 (₹150 damage, Aarav Patel) in cash", "₹150 collected, receipt number given", s, /₹150(\.00)? collected from Aarav Patel/i.test(s));
console.log("done");
await close();
