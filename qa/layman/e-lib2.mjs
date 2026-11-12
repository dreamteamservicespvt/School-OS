// Layman E: add a book (empty, bad ISBN, Telugu title, accession clash), check the book page, block/unblock a member, fine waive empty reason, settings bad value.
process.env.QA_OUT ??= "D:/all/Projects/School-OS/qa-output/layman-e";
const { asRole, go, snap, note, close, sleep, BASE } = await import("../full/selftest-A-h.mjs");
const p = await asRole("librarian");
const settle = async () => { await sleep(600); for (let i = 0; i < 40; i++) { const busy = await p.locator('button[aria-busy="true"], button:has(.animate-spin)').count(); if (!busy) break; await sleep(500); } await sleep(800); };
const dlg = () => p.getByRole("dialog").last();
const txt = async (loc) => (await loc.evaluate((el) => { const c = el.cloneNode(true); c.querySelectorAll("select,option").forEach((x) => x.remove()); document.body.appendChild(c); const s = c.innerText; c.remove(); return s; }).catch(() => "")).replace(/\n{2,}/g, "\n");
const step = async (label, where, n = 700) => { await settle(); const loc = where ?? (await dlg().count() ? dlg() : p.locator("main")); const t = await txt(loc); note("lib2", `\n--- ${label} [${p.url().replace(BASE, "")}]\n${t.slice(0, 3000)}\nPROBLEMS: ${p.problems.join(" ; ")}`); await snap(p, `lib2-${label}`, false); console.log(`--- ${label}\n${t.slice(0, n)}`); return t; };
const submit = () => dlg().getByRole("button").last();
await go(p, "/library-management/books?open=add"); await settle();
await submit().click(); await step("01-empty");
const n = String(Date.now()).slice(-4);
await dlg().getByLabel(/^Title/).fill(`LE-అగ్ని సిరకలు ${n}`);
await dlg().getByLabel(/^Author/).fill("ఏ.పి.జె. అబ్దుల్ కలాం");
await dlg().locator("#book-isbn").fill("978-81-7371-146-7X");
await dlg().getByLabel(/^Accession numbers/).fill("00392");
await submit().click(); await step("02-bad-isbn-dup-accession");
await dlg().locator("#book-isbn").fill("");
await dlg().getByLabel(/^Accession numbers/).fill("");
await submit().click(); const t3 = await step("03-saved", p.locator("main"), 400);
console.log("URL", p.url());
await go(p, "/library-management/books?q=" + encodeURIComponent("LE-"));
let href = await p.locator("main tr").filter({ hasText: "LE-" }).first().locator("a[href]").first().getAttribute("href").catch(() => null);
console.log("book href", href);
if (href) { await go(p, href); await step("04-book-page", p.locator("main"), 900); }
// member block, empty reason, then block + unblock
await go(p, "/library-management/members"); await settle();
const row = p.locator("main tr").filter({ hasText: "Aadhya Patel" }).first();
await row.getByRole("link", { name: "Block" }).or(row.getByRole("button", { name: "Block" })).first().click(); await settle();
await submit().click(); await step("10-block-empty-reason");
await dlg().getByLabel(/Reason/).fill("LE- test block"); await submit().click(); await step("11-blocked", p.locator("main"), 300);
await go(p, "/library-management?member=&card=SPS%2F2023%2F0055"); await step("12-desk-blocked-member", undefined, 800);
await go(p, "/library-management/members?status=blocked"); await settle();
const row2 = p.locator("main tr").filter({ hasText: "Aadhya Patel" }).first();
await row2.getByRole("link", { name: "Unblock" }).or(row2.getByRole("button", { name: "Unblock" })).first().click().catch((e) => console.log("no unblock", e.message.split("\n")[0]));
await settle(); await dlg().getByLabel(/Reason/).fill("LE- test over").catch(() => {}); await submit().click().catch(() => {}); await step("13-unblocked", p.locator("main"), 300);
// fines: waive with empty reason only
await go(p, "/library-management/fines"); await settle();
await p.locator("main").getByRole("link", { name: "Waive" }).or(p.locator("main").getByRole("button", { name: "Waive" })).first().click(); await settle();
await submit().click(); await step("20-waive-empty");
await dlg().getByRole("button", { name: "Cancel" }).click().catch(() => {});
// settings negative values (not saved if refused)
await go(p, "/library-management/settings"); await settle();
const loan = p.getByLabel("Loan days for Primary");
const was = await loan.inputValue(); console.log("loan days primary was", was);
await loan.fill("-3"); await p.getByRole("button", { name: /^Save/ }).first().click(); await step("30-settings-negative", p.locator("main"), 1200);
await go(p, "/library-management/settings"); console.log("loan days primary now", await p.getByLabel("Loan days for Primary").inputValue());
await close();
