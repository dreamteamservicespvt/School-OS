// Library: block a member (desk refuses), stock check (start, scan, close), reports, phone width, wrong roles on the server.
import { asUser, go, close, result, sleep, mainText, layoutIssues, VIEWPORTS } from "./util.mjs";
import { capture, replay } from "./actions.mjs";
const M = "Library Management", R = "Librarian";
const said = async (p) => (await p.evaluate(() => [...document.querySelectorAll("[role=status],[role=alert],[id$=-error]")].map((e) => e.innerText.trim()).filter(Boolean).join(" | ")).catch(() => "")).replace(/\s+/g, " ");
async function waitSaid(p, re, n = 50) { for (let i = 0; i < n; i++) { await sleep(800); const s = await said(p); if (re.test(s)) return s; } return await said(p); }
const rec = (pg, action, role, expected, actual, ok, st) => result({ module: M, page: pg, action, role, expected, actual: String(actual).slice(0, 600), status: st ?? (ok ? "PASS" : "FAIL") });
async function sheet(p, url) { await go(p, url); for (let i = 0; i < 30 && !(await p.locator("dialog[open]").count()); i++) await sleep(800); return (await p.locator("dialog[open]").innerText().catch(() => "")).replace(/\s+/g, " "); }
const TEJA = "S:de3d04c2-5a14-427a-a781-4f5527ec00c1";
const page = await asUser("cems.librarian");

// 1. Block Teja Boddu.
let d = await sheet(page, `/library-management/members?block=${encodeURIComponent(TEJA)}`);
console.log("BLOCK", d.slice(0, 300));
await page.locator("dialog[open] [name=reason]").fill("Demo: test block");
await page.locator("dialog[open] button[type=submit]").last().click();
let s = await waitSaid(page, /blocked|cannot|reason/i);
rec("Members & Cards", "Block Teja Boddu with a reason", R, "Blocked", s, /block/i.test(s) && !/needs/i.test(s));
await go(page, "/library-management?card=CEMS%2F2026%2F0008&copy=00006"); await sleep(1500);
let t = (await mainText(page, 2500)).replace(/\s+/g, " ");
const can = await page.getByRole("button", { name: /^Issue “/ }).count();
rec("Issue & Return", "Issue copy 00006 to blocked member Teja Boddu", R, "No Issue button; says the member is blocked", (t.match(/[^.]*block[^.]*\./i)?.[0] ?? t.slice(0, 300)), !can && /block/i.test(t));
d = await sheet(page, `/library-management/members?block=${encodeURIComponent(TEJA)}`);
await page.locator("dialog[open] [name=reason]").fill("Demo: test over").catch(() => {});
await page.locator("dialog[open] button[type=submit]").last().click();
s = await waitSaid(page, /unblocked|can borrow|cannot|reason/i);
rec("Members & Cards", "Unblock Teja Boddu", R, "Can borrow again", s, /unblock|can borrow/i.test(s));

// 2. Stock check.
d = await sheet(page, "/library-management/fines?view=stock&open=stock");
console.log("STOCK", d.slice(0, 400));
await page.locator("dialog[open] button[type=submit]").last().click();
for (let i = 0; i < 40 && !/\/stock\/[0-9a-f-]{36}/.test(page.url()); i++) await sleep(800);
rec("Fines & Stock Check", "Start a stock check", R, "Opens the scan page", page.url(), /\/stock\/[0-9a-f-]{36}/.test(page.url()));
if (/\/stock\//.test(page.url())) {
  const box = page.locator("main input[type=text], main input:not([type])").first();
  for (const code of ["00001", "00006", "99999"]) {
    await box.fill(code); await box.press("Enter");
    s = await waitSaid(page, new RegExp(`${code}|not|found|already|scanned`, "i"));
    rec("Fines & Stock Check", `Scan ${code} in the stock check`, R, code === "99999" ? "Plain words: no such copy" : "Counted as found", s, code === "99999" ? /not|no copy/i.test(s) : new RegExp(code).test(s));
  }
  t = (await mainText(page, 3000)).replace(/\s+/g, " ");
  console.log("STOCKPAGE", t.slice(0, 800));
}

// 3. Reports and export.
await go(page, "/library-management/reports"); await sleep(1500);
t = (await mainText(page, 1500)).replace(/\s+/g, " ");
rec("Library Reports", "Open Library Reports", R, "Reports shown with numbers", t.slice(0, 400), /Library Reports/.test(t) && !/error|went wrong/i.test(t));
const exp = await page.request.get(page.url().replace(/\/reports.*/, "/history/export"));
rec("Issue & Return", "Export the issue history", R, "A CSV file", `HTTP ${exp.status()} ${exp.headers()["content-type"]} ${(await exp.text()).slice(0, 120).replace(/\s+/g, " ")}`, exp.status() === 200 && /csv/.test(exp.headers()["content-type"] ?? ""));

// 4. Phone width.
const phone = await asUser("cems.librarian", VIEWPORTS.phone375 ?? { width: 375, height: 800 });
for (const u of ["/library-management", "/library-management/books", "/library-management/members", "/library-management/fines", "/library-management/reports", "/library-management/settings"]) {
  await go(phone, u); await sleep(1200);
  const issues = await layoutIssues(phone);
  rec(u.split("/")[2] ? { books: "Books", members: "Members & Cards", fines: "Fines & Stock Check", reports: "Library Reports", settings: "Library Settings" }[u.split("/")[2]] : "Issue & Return", `Open ${u} at 375px`, R, "No sideways scroll, every control named", issues.join("; ") || "no problems", issues.length === 0);
}

// 5. Wrong roles on the server: the Issue request replayed as the Teacher and the Store Keeper.
const cap = await capture(page, "/library-management?card=CEMS%2F2026%2F0013&copy=00006", { submit: /^Issue “/ });
for (const login of ["cems.teacher", "cems.store"]) {
  const other = await asUser(login);
  const r = cap ? await replay(other, cap) : { status: 0, msg: "no capture" };
  rec("Issue & Return", "Issue copy 00006 by replaying the Librarian's Issue request", login, "Refused by the server", `HTTP ${r.status}: ${r.msg}`, cap && !/issued to/i.test(r.raw ?? "") && /not allowed|cannot|only|permission|do not have|can't/i.test(r.msg));
}
console.log("done");
await close();
