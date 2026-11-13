// 13-11-2026: browser check of the 3 leftovers (leave form names every mistake, staff age warning, record name in the tab).
// node qa/layman/r3-leftovers.mjs   (production build on :3000; QA_SERVER_LOG=tools/app.log)
import { asRole, go, mainText, sleep, close, snap } from "./d-h.mjs";
const results = [];
const ok = (id, pass, note = "") => { results.push(pass); console.log(`${pass ? "PASS" : "FAIL"} ${id} ${note}`); };
const tryIt = async (id, fn) => { try { await fn(); } catch (e) { ok(id, false, `error: ${String(e.message ?? e).split("\n")[0].slice(0, 160)}`); } };

const hr = await asRole("hr");
await tryIt("LE6 leave", async () => {
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
  await dlg().locator("[name=reason]").fill("ab");
  await dlg().getByRole("button", { name: /Apply|Send|Submit/ }).last().click(); await sleep(3500);
  const t = await dlg().innerText();
  await snap(hr, "r3-leave-two-mistakes", false);
  ok("LE6 leave", /before the from date/i.test(t) && /Reason is needed/.test(t), `to-date message ${/before the from date/i.test(t)}, reason message ${/Reason is needed/.test(t)}, summary ${/Please fix 2 things/.test(t)}`);
  await hr.keyboard.press("Escape");
});
await tryIt("LD5 age", async () => {
  await go(hr, "/staff-hr-management/add"); await sleep(1500);
  await hr.getByText("More details").first().click(); await sleep(500);
  const box = hr.getByLabel("Date of birth").first();
  await box.click({ clickCount: 3 }); await hr.keyboard.press("Control+A"); await hr.keyboard.type("15-06-2010"); await hr.keyboard.press("Tab"); await sleep(800);
  const t = await mainText(hr, 20000);
  const line = t.split("\n").find((x) => /years old/.test(x)) ?? "";
  await snap(hr, "r3-age-warning", false);
  ok("LD5 age", /This makes them 16 years old/.test(t), `warning: "${line.slice(0, 90)}"`);
});

const lib = await asRole("librarian");
await tryIt("tab title", async () => {
  await go(lib, "/library-management/books"); await sleep(1000);
  const hrefs = await lib.locator("main a").evaluateAll((as) => as.map((a) => a.getAttribute("href")).filter((h) => /\/library-management\/books\/[0-9a-f-]{36}$/.test(h ?? "")));
  await go(lib, hrefs[0]); await lib.waitForLoadState("networkidle").catch(() => {}); await sleep(1200);
  const title = await lib.title();
  const head = await mainText(lib, 400);
  ok("tab title", / · Book/.test(title) && !/^Book/.test(title), `tab: "${title.slice(0, 80)}" | head: ${head.split("\n").slice(0, 2).join(" / ").slice(0, 80)}`);
});
console.log(`\nSUMMARY ${results.filter(Boolean).length} of ${results.length} pass`);
await close();
