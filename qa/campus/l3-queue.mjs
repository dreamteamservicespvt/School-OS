// Library: reservation queue, renew while someone waits, return to the queue, and what the desk says after a success.
import { asUser, go, close, result, sleep, mainText, shot } from "./util.mjs";
const M = "Library Management", P = "Issue & Return", R = "Librarian";
const page = await asUser("cems.librarian");
const said = async () => (await page.evaluate(() => [...document.querySelectorAll("[role=status],[role=alert]")].map((e) => e.innerText.trim()).filter(Boolean).join(" | ")).catch(() => "")).replace(/\s+/g, " ");
const text = async () => (await mainText(page, 2500)).replace(/\s+/g, " ");
async function waitSaid(re, n = 25) { for (let i = 0; i < n; i++) { await sleep(800); const s = await said(); if (re.test(s)) return s; } return await said(); }
const rec = (action, expected, actual, ok, extra = {}) => result({ module: M, page: P, action, role: R, expected, actual: actual.slice(0, 600), status: ok ? "PASS" : "FAIL", ...extra });

// Reserve the one-copy book for Sravya Kumar.
await go(page, "/library-management?card=CEMS%2F2026%2F0003&copy=Demo%20Single"); await sleep(1000);
await page.getByRole("link", { name: "Reserve" }).first().click();
for (let i = 0; i < 20 && !(await page.getByRole("button", { name: "Reserve", exact: true }).count()); i++) await sleep(800);
await page.getByRole("button", { name: "Reserve", exact: true }).click();
let s = await waitSaid(/queue|cannot|already/i);
rec("Reserve Demo Single Copy Reference for Sravya Kumar (only copy is with Nikhil Patel)", "Number 1 in the queue", s, /Sravya is number 1 in the queue/i.test(s));

// Nikhil tries to renew while Sravya waits.
await go(page, "/library-management?card=CEMS%2F2026%2F0004"); await sleep(1000);
await page.getByRole("button", { name: "Renew" }).first().click();
s = await waitSaid(/renew|waiting|reserved|queue|cannot/i);
rec("Renew Nikhil Patel's copy 00007 while Sravya Kumar waits for it", "Refused: someone is waiting", s, !/renewed till/i.test(s) && /wait|reserv|queue/i.test(s));

// Nikhil returns it: the desk says to keep it for Sravya.
await go(page, "/library-management?mode=return&copy=00007"); await sleep(1500);
await page.getByRole("button", { name: /^Return “/ }).click();
s = await waitSaid(/returned/i);
await shot(page, "library-after-return");
rec("Return copy 00007 while Sravya Kumar is first in the queue", "Returned; next in queue Sravya, keep the copy at the desk", s, /Next in queue: Sravya/i.test(s));
const contradict = /is not issued to anyone/i.test(s);
rec("What the desk shows right after a successful return", "Only the success message", s, !contradict, contradict ? { defect: "CAMPUS-11" } : {});

// The copy is kept: Aarav cannot take it, Sravya can.
await go(page, "/library-management?card=CEMS%2F2026%2F0008&copy=00007"); await sleep(1500);
let t = await text();
const canIssue = await page.getByRole("button", { name: /^Issue “/ }).count();
let tj = "";
if (canIssue) { await page.getByRole("button", { name: /^Issue “/ }).click(); tj = await waitSaid(/issued|kept|reserved|cannot/i); }
rec("Issue the kept copy 00007 to Teja Boddu (not first in the queue)", "Refused: kept for Sravya", tj || (t.match(/[^.]*(kept|reserved|Sravya)[^.]*\./i)?.[0] ?? t.slice(0, 300)), !/issued to Teja/i.test(tj) && /kept|reserved|Sravya/i.test(tj || t));
await go(page, "/library-management?card=CEMS%2F2026%2F0003&copy=00007"); await sleep(1500);
await page.getByRole("button", { name: /^Issue “/ }).click();
s = await waitSaid(/issued|cannot/i);
await shot(page, "library-after-issue");
rec("Issue the kept copy 00007 to Sravya Kumar", "Issued; her reservation is done", s, /issued to Sravya Kumar/i.test(s));
const c2 = /already issued to/i.test(s);
rec("What the desk shows right after a successful issue", "Only the success message", s, !c2, c2 ? { defect: "CAMPUS-11" } : {});
console.log("done");
await close();
