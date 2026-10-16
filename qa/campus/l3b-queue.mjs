// Library: reservation queue, renew while someone waits, return to the queue, and what the desk says after a success.
import { asUser, go, close, result, sleep, mainText, shot } from "./util.mjs";
const M = "Library Management", P = "Issue & Return", R = "Librarian";
const page = await asUser("cems.librarian");
const said = async () => (await page.evaluate(() => [...document.querySelectorAll("[role=status],[role=alert]")].map((e) => e.innerText.trim()).filter(Boolean).join(" | ")).catch(() => "")).replace(/\s+/g, " ");
const text = async () => (await mainText(page, 2500)).replace(/\s+/g, " ");
async function waitSaid(re, n = 25) { for (let i = 0; i < n; i++) { await sleep(800); const s = await said(); if (re.test(s)) return s; } return await said(); }
const rec = (action, expected, actual, ok, extra = {}) => result({ module: M, page: P, action, role: R, expected, actual: actual.slice(0, 600), status: ok ? "PASS" : "FAIL", ...extra });

let s;
await go(page, "/library-management?card=CEMS%2F2026%2F0003&copy=00007"); await sleep(1500);
await page.getByRole("button", { name: /^Issue “/ }).click({ timeout: 90000 });
s = await waitSaid(/issued|cannot/i);
await shot(page, "library-after-issue");
rec("Issue the kept copy 00007 to Sravya Kumar", "Issued; her reservation is done", s, /issued to Sravya Kumar/i.test(s));
const c2 = /already issued to/i.test(s);
rec("What the desk shows right after a successful issue", "Only the success message", s, !c2, c2 ? { defect: "CAMPUS-11" } : {});
console.log("done");
await close();
