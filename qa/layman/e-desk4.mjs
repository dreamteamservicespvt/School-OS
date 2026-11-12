// Layman E re-check: a wrongly typed due date, then a reason: which due date does the book get?
process.env.QA_OUT ??= "D:/all/Projects/School-OS/qa-output/layman-e";
const { asRole, go, snap, close, sleep } = await import("../full/selftest-A-h.mjs");
const p = await asRole("librarian");
const settle = async () => { await sleep(600); for (let i = 0; i < 40; i++) { if (!(await p.locator('button:has(.animate-spin)').count())) break; await sleep(500); } await sleep(900); };
await go(p, "/library-management");
await p.locator("#scan-member").fill("SPS/2023/0055"); await p.locator("#scan-member").press("Enter"); await settle();
await p.locator("#scan-copy").fill("Ashoka"); await p.locator("#scan-copy").press("Enter"); await settle();
await p.getByText(/Issue copy \d+/).first().click(); await settle();
const due = p.locator("#issue-due");
await due.fill("2026-12-31"); console.log("field shows:", await due.inputValue());
const btn = p.getByRole("button", { name: /^Issue “/ });
await btn.click(); await settle(); console.log("after 1st click field:", await due.inputValue(), "| reason box:", await p.locator("#issue-reason").count());
await snap(p, "desk4-1", false);
await p.locator("#issue-reason").fill("LE- recheck reason");
console.log("before 2nd click field:", await due.inputValue());
await btn.click(); await settle();
const t = (await p.locator("main").innerText()).match(/is issued to[^\n]*/)?.[0];
console.log("RESULT:", t);
await snap(p, "desk4-2", false);
// return it again
const acc = (await p.locator("main").innerText()).match(/\(copy (\d{5})\) is issued/)?.[1];
if (acc) { await go(p, "/library-management?mode=return"); await p.locator("#scan-return").fill(acc); await p.locator("#scan-return").press("Enter"); await settle(); await p.getByRole("button", { name: /^Return “/ }).click(); await settle(); console.log("returned", acc); }
await close();
