// Library: stock check scans and close, reports, export, phone width, wrong roles on the server.
import { asUser, go, close, result, sleep, mainText, layoutIssues, VIEWPORTS } from "./util.mjs";
import { capture, replay } from "./actions.mjs";
const M = "Library Management", R = "Librarian";
const rec = (pg, action, role, expected, actual, ok, st) => result({ module: M, page: pg, action, role, expected, actual: String(actual).slice(0, 600), status: st ?? (ok ? "PASS" : "FAIL") });
const page = await asUser("cems.librarian");
const SESSION = process.argv[2];

// 1. Stock check scans.
await go(page, `/library-management/fines/stock/${SESSION}`); await sleep(1500);
for (const code of ["00007", "00007", "99998"]) {
  const before = await page.locator('ul[aria-label="Scanned just now"] li').count();
  await page.locator("#stock-code").fill(code);
  await page.locator("#stock-code").press("Enter");
  for (let i = 0; i < 40 && (await page.locator('ul[aria-label="Scanned just now"] li').count()) <= before; i++) await sleep(800);
  const s = (await page.locator('ul[aria-label="Scanned just now"] li').first().innerText().catch(() => "")).replace(/\s+/g, " ");
  const exp = code === "99998" ? "Plain words: no such copy" : before === 0 ? "Counted as found" : "Says it was scanned already";
  const ok = code === "99998" ? /not|no copy|unknown/i.test(s) : before === 0 ? /00007/.test(s) && !/again|already/i.test(s) : /again|already/i.test(s);
  rec("Fines & Stock Check", `Scan ${code} in the stock check${code === "00007" && before ? " a second time" : ""}`, R, exp, s, ok);
}
// Close it.
await page.getByRole("button", { name: "Close stock check" }).first().click();
await sleep(800);
await page.locator("dialog[open]").getByRole("button", { name: "Close stock check" }).click();
await sleep(5000);
let t = (await mainText(page, 2500)).replace(/\s+/g, " ");
rec("Fines & Stock Check", "Close the stock check", R, "Closed; copies not scanned are listed as missing, nothing marked lost yet", t.slice(0, 500), /missing/i.test(t) && /Mark \d+ missing cop/i.test(t));

// 2. Reports and export.
await go(page, "/library-management/reports"); await sleep(1500);
t = (await mainText(page, 1500)).replace(/\s+/g, " ");
rec("Library Reports", "Open Library Reports", R, "Reports shown with numbers", t.slice(0, 400), /Library Reports/.test(t) && !/went wrong/i.test(t));
const base = page.url().replace(/\/reports.*/, "");
for (const path of ["/history/export", "/fines/export", "/books/export", "/members/export", "/reports/export"]) {
  const exp = await page.request.get(base + path);
  const body = await exp.text();
  rec(path.includes("history") ? "Issue & Return" : path.includes("fines") ? "Fines & Stock Check" : path.includes("books") ? "Books" : path.includes("members") ? "Members & Cards" : "Library Reports", `Export ${path}`, R, "A file downloads", `HTTP ${exp.status()} ${exp.headers()["content-type"]} ${exp.headers()["content-disposition"] ?? ""} ${body.slice(0, 80).replace(/\s+/g, " ")}`, exp.status() === 200 && /csv|spreadsheet|pdf|excel/.test(exp.headers()["content-type"] ?? ""));
}

// 3. Phone width.
const phone = await asUser("cems.librarian", VIEWPORTS.phone375);
const names = { "": "Issue & Return", books: "Books", members: "Members & Cards", fines: "Fines & Stock Check", reports: "Library Reports", settings: "Library Settings" };
for (const k of Object.keys(names)) {
  await go(phone, `/library-management${k ? "/" + k : ""}`); await sleep(1200);
  const issues = await layoutIssues(phone);
  rec(names[k], `Open ${names[k]} at 375px`, R, "No sideways scroll, every control named", issues.join("; ") || "no problems", issues.length === 0);
}

// 4. Wrong roles on the server: the Librarian's Issue request replayed as the Teacher and the Store Keeper.
const cap = await capture(page, "/library-management?card=CEMS%2F2026%2F0013&copy=00006", { submit: /^Issue “/ });
for (const login of ["cems.teacher", "cems.store"]) {
  const other = await asUser(login);
  const r = cap ? await replay(other, cap) : { status: 0, msg: "no capture", raw: "" };
  rec("Issue & Return", "Issue copy 00006 by replaying the Librarian's Issue request", login, "Refused by the server", `HTTP ${r.status}: ${r.msg}`, Boolean(cap) && !/issued to/i.test(r.raw ?? "") && /not allowed|cannot|only|permission|do not have|can't|no access/i.test(r.msg));
}
console.log("done");
await close();
