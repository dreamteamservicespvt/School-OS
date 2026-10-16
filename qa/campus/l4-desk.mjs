// Library: after a return the desk is calm (CAMPUS-11 fixed), the books-at-a-time limit, a due date in the past.
import { asUser, go, close, result, sleep, mainText, shot } from "./util.mjs";
const M = "Library Management", P = "Issue & Return", R = "Librarian";
const page = await asUser("cems.librarian");
const said = async () => (await page.evaluate(() => [...document.querySelectorAll("[role=status],[role=alert]")].map((e) => e.innerText.trim()).filter(Boolean).join(" | ")).catch(() => "")).replace(/\s+/g, " ");
async function waitSaid(re, n = 40) { for (let i = 0; i < n; i++) { await sleep(800); const s = await said(); if (re.test(s)) return s; } return await said(); }
const rec = (action, expected, actual, ok, extra = {}) => result({ module: M, page: P, action, role: R, expected, actual: actual.slice(0, 600), status: ok ? "PASS" : "FAIL", ...extra });
const issueBtn = () => page.getByRole("button", { name: /^Issue “/ });

// 1. Sravya returns 00007: no red "nothing to return" afterwards.
await go(page, "/library-management?mode=return&copy=00007"); await sleep(1500);
await page.getByRole("button", { name: /^Return “/ }).click({ timeout: 90000 });
await waitSaid(/returned/i);
await sleep(4000);
let s = await said();
await shot(page, "library-after-return-fixed");
rec("What the desk shows right after a successful return (after the fix)", "Success, and 'was returned today' — no red 'nothing to return'", s, /returned/i.test(s) && !/nothing to return/i.test(s), { defect: "CAMPUS-11" });

// 2. Limit: Nikhil Patel (2 books) takes 00002 and 00004, then 00008 is refused.
for (const acc of ["00002", "00004"]) {
  await go(page, `/library-management?card=CEMS%2F2026%2F0004&copy=${acc}`); await sleep(1500);
  await issueBtn().click({ timeout: 90000 });
  s = await waitSaid(/issued to|cannot/i);
  rec(`Issue copy ${acc} to Nikhil Patel`, "Issued", s, /issued to Nikhil Patel/i.test(s));
}
await go(page, "/library-management?card=CEMS%2F2026%2F0004&copy=00008"); await sleep(2000);
let t = (await mainText(page, 3000)).replace(/\s+/g, " ");
const btn = await issueBtn().count();
const why = t.match(/[^.]*(already has|limit|at a time|2 books)[^.]*\./i)?.[0] ?? t.slice(t.indexOf("2 Book"), t.indexOf("2 Book") + 300);
rec("Issue a third book to Nikhil Patel (limit 2)", "No Issue button; plain words say the limit is reached", why, !btn && /already has|limit|at a time/i.test(why));

// 3. Due date in the past for Teja Boddu.
await go(page, "/library-management?card=CEMS%2F2026%2F0008&copy=00008"); await sleep(2000);
await page.locator("input[name=dueOn]").fill("2026-10-01");
await page.locator("input[name=dueReason]").fill("Demo past date").catch(() => {});
await issueBtn().click();
s = await waitSaid(/issued to|due|date|after|past/i);
rec("Issue to Teja Boddu with due date 01-10-2026 (in the past)", "Refused in words", s, !/issued to Teja/i.test(s) && /due|date/i.test(s));
console.log("done");
await close();
