// Library: a due date in the past is refused next to the box; after a good issue the desk is calm (CAMPUS-11).
import { asUser, go, close, result, sleep, shot } from "./util.mjs";
const M = "Library Management", P = "Issue & Return", R = "Librarian";
const page = await asUser("cems.librarian");
const said = async () => (await page.evaluate(() => [...document.querySelectorAll("[role=status],[role=alert],#issue-due-help")].map((e) => e.innerText.trim()).filter(Boolean).join(" | ")).catch(() => "")).replace(/\s+/g, " ");
async function waitSaid(re, n = 40) { for (let i = 0; i < n; i++) { await sleep(800); const s = await said(); if (re.test(s)) return s; } return await said(); }
const rec = (action, expected, actual, ok, extra = {}) => result({ module: M, page: P, action, role: R, expected, actual: actual.slice(0, 600), status: ok ? "PASS" : "FAIL", ...extra });
const issueBtn = () => page.getByRole("button", { name: /^Issue “/ });

await go(page, "/library-management?card=CEMS%2F2026%2F0008&copy=00008"); await sleep(2000);
await page.locator("input[name=dueOn]").fill("2026-10-01");
await sleep(300);
await page.locator("input[name=dueReason]").fill("Demo past date").catch(() => {});
await issueBtn().click({ timeout: 90000 });
let s = await waitSaid(/must be after|issued to/i);
rec("Issue to Teja Boddu with due date 01-10-2026 (in the past)", "Refused next to the date: must be after today", s, /must be after today/i.test(s) && !/issued to Teja/i.test(s));

await go(page, "/library-management?card=CEMS%2F2026%2F0008&copy=00008"); await sleep(2000);
await issueBtn().click({ timeout: 90000 });
await waitSaid(/issued to Teja/i);
await sleep(300);
const early = await said();
await sleep(4000);
s = await said();
await shot(page, "library-after-issue-fixed");
rec("What the desk shows right after a successful issue (after the fix)", "Success only; no red 'already issued, renew it instead'", `${early} || later: ${s}`, /issued to Teja/i.test(early + s) && !/Renew it instead/i.test(early + s), { defect: "CAMPUS-11" });
console.log("done");
await close();
