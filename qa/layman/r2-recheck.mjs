// Round 2 (13-11-2026): recheck the layman fixes in the browser, the way a person would use the screens.
// node qa/layman/r2-recheck.mjs   (production build on :3000; QA_SERVER_LOG=tools/app.log)
import { asRole, go, mainText, sleep, close, snap } from "./d-h.mjs";
const results = [];
const ok = (id, pass, note = "") => { results.push({ id, pass, note }); console.log(`${pass ? "PASS" : "FAIL"} ${id} ${note}`); };
const tryIt = async (id, fn) => { try { await fn(); } catch (e) { ok(id, false, `error: ${String(e.message ?? e).split("\n")[0].slice(0, 160)}`); } };
const timed = async (p, u) => { const t0 = Date.now(); await go(p, u); await p.waitForLoadState("networkidle").catch(() => {}); return (Date.now() - t0) / 1000; };

// --- HR: LD1 leave dates kept after a refusal
const hr = await asRole("hr");
await tryIt("LD1", async () => {
  const dlg = () => hr.getByRole("dialog").last();
  const setD = async (loc, v) => { await loc.click({ clickCount: 3 }); await hr.keyboard.press("Control+A"); await hr.keyboard.type(v); await hr.keyboard.press("Tab"); await sleep(300); };
  await go(hr, "/staff-hr-management/leave"); await sleep(1500);
  await hr.getByRole("button", { name: /Apply for leave/ }).first().click(); await sleep(1500);
  const st = dlg().locator("[name=staffId]");
  const l = (await st.locator("option").allInnerTexts()).find((x) => x.includes("LD-")) ?? (await st.locator("option").allInnerTexts())[1];
  await st.selectOption({ label: l });
  await dlg().locator("[name=leaveTypeId]").selectOption({ index: 2 });
  await setD(dlg().locator("input[id$=-from]"), "20-11-2026");
  await setD(dlg().locator("input[id$=-to]"), "18-11-2026");
  await dlg().locator("[name=reason]").fill("LD- round 2 recheck");
  await dlg().getByRole("button", { name: /Apply|Send|Submit/ }).last().click(); await sleep(3500);
  const from = await dlg().locator("input[id$=-from]").inputValue(), to = await dlg().locator("input[id$=-to]").inputValue();
  const msg = (await dlg().innerText()).split("\n").find((x) => /before/i.test(x)) ?? "";
  await snap(hr, "r2-LD1-after-refused", false);
  ok("LD1", from === "20-11-2026" && to === "18-11-2026" && Boolean(msg), `after refusal From ${from}, To ${to}, message "${msg.slice(0, 60)}"`);
  await hr.keyboard.press("Escape");
});
await tryIt("LD3", async () => {
  await go(hr, "/staff-hr-management/documents"); await sleep(1000);
  const t = await mainText(hr, 8000);
  const exp = /Expired\s*\n?\s*(\d+)/.exec(t);
  ok("LD3", Boolean(exp && Number(exp[1]) > 0) && /File not collected/.test(t), `Expired counter ${exp?.[1] ?? "?"}, "File not collected" ${/File not collected/.test(t)}`);
});

// --- Accountant: LB1 concession above what is owed, LB6 chart of accounts
const acc = await asRole("accountant");
await tryIt("LB1", async () => {
  const dlg = () => acc.getByRole("dialog").last();
  await go(acc, "/fee-management/concessions"); await sleep(1500);
  await acc.getByRole("button", { name: "New concession" }).or(acc.getByRole("link", { name: "New concession" })).first().click({ timeout: 90000 }); await sleep(2500);
  await dlg().getByPlaceholder("Name, admission no. or phone").pressSequentially("Sravya Joshi", { delay: 40 }); await sleep(3000);
  await dlg().getByText("Sravya Joshi").first().click(); await sleep(2500);
  await dlg().getByPlaceholder(/father/).fill("LB- round 2 recheck (must be refused)");
  await dlg().locator('input[name="amount"]').or(dlg().getByPlaceholder("2,000")).first().fill("50000"); await sleep(800);
  const before = (await dlg().innerText()).split("\n").find((x) => /Not more than/.test(x)) ?? "";
  await dlg().getByRole("button", { name: /Apply|Send/ }).last().click();
  for (let i = 0; i < 40 && /…/.test(await dlg().innerText().catch(() => "")); i++) await sleep(1000);
  await sleep(1500);
  const open = await dlg().isVisible().catch(() => false);
  const after = (await dlg().innerText().catch(() => "")).split("\n").filter((x) => /Not more than/.test(x)).join(" | ");
  await snap(acc, "r2-LB1-refused", false);
  ok("LB1", open && /Not more than/.test(after), `live hint "${before.slice(0, 80)}"; after Apply still open ${open}: "${after.slice(0, 100)}"`);
  await acc.keyboard.press("Escape");
});
await tryIt("LB6", async () => {
  await go(acc, "/finance-management/settings"); await sleep(1000);
  const t = await mainText(acc, 20000);
  const line = t.split("\n").find((x) => /Hostel mess/.test(x)) ?? "";
  ok("LB6", !/Hostel mess[^\n]*Refunds/.test(t), `line: "${line.slice(0, 80)}"`);
});

// --- Admin: LE4, LA4, LC23, LD10, LD7, LA10/LD9 speed, LA11/LD6 badges
const ad = await asRole("admin");
await tryIt("LE4", async () => {
  await go(ad, "/settings/users/new"); await sleep(1000);
  const ticked = await ad.locator("main input[type=checkbox]:checked, main input[type=radio][name*=role i]:checked").count();
  ok("LE4", ticked === 0, `${ticked} role boxes ticked on a new invite`);
});
await tryIt("LA4", async () => {
  await go(ad, "/attendance-management?date=2025-04-01"); await sleep(1000);
  const t = await mainText(ad, 6000);
  ok("LA4", /before this academic year/i.test(t) && !/Request a correction/.test(t), `before-year message ${/before this academic year/i.test(t)}, correction offered ${/Request a correction/.test(t)}`);
});
await tryIt("LC23", async () => {
  const errs = []; ad.on("console", (m) => { if (m.type() === "error" && /#441|Minified React/.test(m.text())) errs.push(m.text()); });
  await go(ad, "/communication/notices?status=waiting"); await sleep(1500);
  const t = await mainText(ad, 3000);
  ok("LC23", !/could not open/i.test(t) && errs.length === 0, `page ok ${!/could not open/i.test(t)}, React #441 errors ${errs.length}`);
});
await tryIt("LD10", async () => {
  await go(ad, "/transport-management/vehicles"); await sleep(800);
  const t = await mainText(ad, 4000);
  ok("LD10", /Vehicles in service/.test(t) && !/Vehicles running/.test(t), "");
});
await tryIt("LD7", async () => {
  await go(ad, "/events-calendar/events"); await sleep(800);
  const t = await mainText(ad, 8000);
  ok("LD7", /\b\d{2}-\d{2}-\d{4}\b/.test(t), `first date shown: ${(/\b\d{2}-\d{2}-\d{4}\b/.exec(t) ?? ["none"])[0]}`);
});
await tryIt("LA11/LD6", async () => {
  const views = [];
  for (const u of ["/attendance-management", "/front-office", "/hostel-management", "/library-management"]) {
    await go(ad, u); await sleep(600);
    if (/View only/.test(await mainText(ad, 600))) views.push(u);
  }
  ok("LA11/LD6", views.length === 0, views.length ? `"View only" still on ${views.join(", ")}` : "no View only badge for the School Admin");
});
await tryIt("LA10/LD9", async () => {
  const slow = [];
  for (const u of ["/academic-management/settings", "/dashboard", "/student-management", "/academic-management/allocation?view=teachers", "/hostel-management/allocation", "/library-management/books"]) {
    await timed(ad, u); const s = await timed(ad, u); if (s > 3) slow.push(`${u} ${s.toFixed(1)} s`);
  }
  ok("LA10/LD9", slow.length === 0, slow.length ? `over 3 s: ${slow.join(", ")}` : "every page under 3 s (second open)");
});

// --- Librarian: LE2 the book's name on its page
const lib = await asRole("librarian");
await tryIt("LE2", async () => {
  await go(lib, "/library-management/books"); await sleep(1000);
  const link = lib.locator("main a[href*='/library-management/books/']").first();
  const name = (await link.innerText()).split("\n")[0].trim();
  await link.click(); await lib.waitForLoadState("networkidle").catch(() => {}); await sleep(800);
  const head = await mainText(lib, 600);
  ok("LE2", Boolean(name) && head.includes(name.slice(0, 20)), `book "${name.slice(0, 40)}" shown on its page: ${head.includes(name.slice(0, 20))}`);
});

// --- Driver: LD13 a refused export is a 403, not a 500
const drv = await asRole("driver");
await tryIt("LD13", async () => {
  const codes = [];
  for (const u of ["/staff-hr-management/export?format=csv", "/staff-hr-management/id-cards"]) codes.push((await drv.request.get(u)).status());
  ok("LD13", codes.every((c) => c === 403 || c === 303 || c === 307), `status ${codes.join(", ")}`);
});

// --- Teacher: LA8 refused page says so
const tch = await asRole("teacher");
await tryIt("LA8", async () => {
  await go(tch, "/student-management/promotion"); await sleep(800);
  const t = await mainText(tch, 1500);
  ok("LA8", /not (part of|for) your role|not in your menu|no access/i.test(t) || /no-access/.test(tch.url()), `landed on ${new URL(tch.url()).pathname}`);
});

console.log(`\nSUMMARY ${results.filter((r) => r.pass).length} of ${results.length} pass`);
await close();
