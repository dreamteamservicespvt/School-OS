// Hostel: a second outing pass left out past its back-by time, to check the late-return alert
// (the "hostel-late-returns" job runs every 15 minutes). Run with STAGE=start, then STAGE=check after 16+ minutes.
import { asUser, go, mainText, close, record, openDialog, send, said, sleep } from "./util.mjs";
const M = "Hostel Management", P = "Outing & Visitors";
const rec = (role, action, expected, actual, status, defect) => record({ module: M, page: P, action, role, expected, actual, status, ...(defect ? { defect } : {}) });
const hm = (d) => d.toTimeString().slice(0, 5);
const ist = () => new Date(Date.now() + (330 + new Date().getTimezoneOffset()) * 60000);
const STAGE = process.env.STAGE ?? "start";
if (STAGE === "start") {
  const page = await asUser("cems.warden");
  await openDialog(page, "/hostel-management/outings?new=1");
  await page.locator("dialog[open] input[type=search]").first().pressSequentially("Demo మేఘన", { delay: 70 }); await sleep(2500);
  await page.locator("dialog[open] [role=option]").first().click(); await sleep(700);
  const now = ist(); await page.locator("dialog[open] [name=fromTime]").fill(hm(now)); await page.locator("dialog[open] [name=toTime]").fill(hm(new Date(now.getTime() + 60000)));
  await page.locator("dialog[open] [name=reason]").fill("QA Demo dentist visit");
  await page.locator("dialog[open] button", { hasText: "Mother" }).first().click(); await sleep(300);
  const wn = page.locator("dialog[open] [name=withName]");
  if (await wn.count()) { await wn.fill("QA Demo Aunt"); await page.locator("dialog[open] [name=withRelation]").fill("Aunt").catch(() => {}); await page.locator("dialog[open] [name=withPhone]").fill("9000000003").catch(() => {}); }
  const r = await send(page, "Save and send for approval"); console.log(r.s);
  await page.context().close();
  const pp = await asUser("cems.principal"); await go(pp, "/approvals");
  await pp.locator("main div, main li, main article").filter({ hasText: "మేఘన" }).filter({ has: pp.getByRole("button", { name: "Approve" }) }).last().getByRole("button", { name: "Approve" }).click(); await sleep(2000);
  console.log(await said(pp)); await pp.context().close();
  const w = await asUser("cems.warden"); await go(w, "/hostel-management/outings");
  await w.locator("main button:visible, main a:visible").filter({ hasText: /Mark out/ }).first().click(); await sleep(2000);
  if (await w.locator("dialog[open]").count()) await send(w, (await w.locator("dialog[open] button[type=submit]").last().innerText()).trim());
  console.log(await said(w), "at", new Date().toISOString()); await w.context().close();
} else {
  for (const [login, role] of [["cems.warden", "Hostel Warden"], ["cems.principal", "Principal"]]) {
    const page = await asUser(login); await go(page, "/notifications"); const n = await mainText(page, 4000);
    const hit = n.split("\n").find((l) => /not returned \(due/i.test(l) && /Lakshmi Lanka/.test(l));
    if (!hit && !process.env.FINAL) { console.log(role, "no alert yet"); await page.context().close(); continue; }
    rec(role, "Late-return alert after the 15-minute job (student still out 16+ minutes after back-by)", "A notification: 'Demo మేఘన Lanka not returned (due …)'", hit ?? n.slice(0, 400).replace(/\n/g, " / "), hit ? "PASS" : "FAIL", hit ? undefined : "CAMPUS2-04");
    if (login === "cems.warden") {
      await go(page, "/hostel-management/outings");
      await page.locator("main button:visible, main a:visible").filter({ hasText: /Mark returned/ }).first().click(); await sleep(2000);
      if (await page.locator("dialog[open]").count()) await send(page, (await page.locator("dialog[open] button[type=submit]").last().innerText()).trim());
      console.log("returned:", await said(page));
    }
    await page.context().close();
  }
}
await close();
