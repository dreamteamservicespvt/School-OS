// Layman E: issue a copy, wrong due date, double click, then return with a bad damage charge.
process.env.QA_OUT ??= "D:/all/Projects/School-OS/qa-output/layman-e";
const { asRole, go, snap, note, close, sleep } = await import("../full/selftest-A-h.mjs");
const p = await asRole("librarian");
const settle = async () => { for (let i = 0; i < 30; i++) { const busy = await p.locator('button[aria-busy="true"], button:has(.animate-spin)').count(); if (!busy) break; await sleep(500); } await sleep(900); };
const desk = async () => ((await p.locator("main").innerText()).split("Reservations\n\nReady at the desk")[0].split("ready at the desk")[1] ?? "").replace(/\n{2,}/g, "\n");
const step = async (label) => { await settle(); const t = await desk(); note("desk2", `\n--- ${label}\n${t}\nPROBLEMS: ${p.problems.join(" ; ")}`); await snap(p, `desk2-${label}`, false); console.log(`--- ${label}\n${t.slice(0, 900)}`); return t; };
await go(p, "/library-management");
await p.locator("#scan-member").fill("SPS/2023/0055"); await p.locator("#scan-member").press("Enter"); await settle();
await p.locator("#scan-copy").fill("Ashoka"); await p.locator("#scan-copy").press("Enter"); await settle();
await p.getByText(/Issue copy \d+/).first().click(); await step("10-copy-picked");
const acc = (p.url().match(/copy=([^&]+)/) ?? [])[1];
console.log("URL", p.url(), "acc", acc);
// change due date without reason
const due = p.locator("#issue-due");
const tag = await due.evaluate((e) => e.tagName + " " + e.type).catch(() => "none");
console.log("due input:", tag, await due.inputValue().catch(() => ""));
await due.fill("2026-12-31").catch((e) => console.log("fill due failed", e.message.split("\n")[0]));
await step("11-due-changed");
const issueBtn = p.getByRole("button", { name: /^Issue “/ });
await issueBtn.click(); await step("12-issue-no-reason");
await p.locator("#issue-reason").fill("LE- project work over holidays").catch(() => {});
await issueBtn.dblclick(); await step("13-issued-dblclick");
// return
await go(p, "/library-management?mode=return");
await p.locator("#scan-return").fill(decodeURIComponent(acc ?? "00392")); await p.locator("#scan-return").press("Enter");
await step("20-return-copy");
await p.getByRole("radio", { name: "Damaged" }).or(p.getByRole("button", { name: "Damaged", exact: true })).first().click();
await p.locator("#ret-charge").fill("-50"); await step("21-negative-charge");
await p.getByRole("button", { name: /^Return “/ }).click(); await step("22-negative-submit");
await p.locator("#ret-charge").fill("abc");
await p.getByRole("button", { name: /^Return “/ }).click(); await step("23-letters-submit");
await p.getByRole("radio", { name: "Good" }).or(p.getByRole("button", { name: "Good", exact: true })).first().click();
await p.getByRole("button", { name: /^Return “/ }).click(); await step("24-good-return");
await go(p, "/library-management?list=issued"); await step("25-today-list");
await close();
