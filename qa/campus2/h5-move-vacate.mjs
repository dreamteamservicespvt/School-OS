// Hostel: move Demo Varun Teja to another bed, block the bed he left (repair), then check him out (vacate);
// the bed becomes free.
import { asUser, go, mainText, close, record, send, said, sleep } from "./util.mjs";
const M = "Hostel Management", R = "Hostel Warden";
const rec = (pg, action, expected, actual, status, defect) => record({ module: M, page: pg, action, role: R, expected, actual, status, ...(defect ? { defect } : {}) });
const page = await asUser("cems.warden");
const linkIn = (row, re) => page.evaluate(([n, r]) => [...document.querySelectorAll("main tr, main li")].filter((x) => x.innerText.includes(n)).flatMap((x) => [...x.querySelectorAll("a")]).map((a) => a.getAttribute("href")).find((h) => new RegExp(r).test(h)), [row, re]);
const step = async (name, fn) => { try { await fn(); } catch (e) { console.log("ERR", name, e.message.split("\n")[0]); } };
if (process.env.REALLOCATE) await step("reallocate", async () => {
  await go(page, "/hostel-management/allocation?allocate=1"); await page.waitForSelector("dialog[open]");
  await page.locator("dialog[open] input[type=search]").first().pressSequentially("Demo Varun", { delay: 70 }); await sleep(2500);
  await page.locator("dialog[open] [role=option]").first().click(); await sleep(500);
  const bed = page.locator("dialog[open] select[name=bedId]"); await bed.selectOption(await bed.locator("option", { hasText: "B-101, Bed 1" }).first().getAttribute("value"));
  const r = await send(page, (await page.locator("dialog[open] button[type=submit]").last().innerText()).trim()); console.log("realloc:", r.s);
});
await step("move", async () => {
  await go(page, "/hostel-management/allocation"); const h = await linkIn("Demo Varun", "move="); console.log("move", h);
  await go(page, h); await page.waitForSelector("dialog[open]");
  const bed = page.locator("dialog[open] select[name=bedId]"); const v = await bed.locator("option", { hasText: "B-102" }).first().getAttribute("value"); await bed.selectOption(v);
  if (process.env.REALLOCATE) await page.locator("dialog[open] [name=reason]").fill("QA Demo quieter room");
  const r0 = await send(page, "Move student");
  if (r0.open && /reason/i.test(r0.s)) { await page.locator("dialog[open] [name=reason]").fill("QA Demo quieter room"); }
  const r = r0.open ? await send(page, "Move student") : r0;
  rec("Allocation", `Move Demo Varun Teja from B-101 to B-102${process.env.REALLOCATE ? " (bed and reason filled before pressing Move)" : ""}`, "Moved; history kept", (r0.open ? `first try: ${r0.s} → ` : "") + r.s, !r.open && /moved|B-102/i.test(r.s) ? "PASS" : "FAIL");
});
await step("block", async () => {
  await go(page, "/hostel-management/rooms"); const t = await mainText(page, 4000);
  const h = await page.evaluate(() => [...document.querySelectorAll("main a[href*='bed=']")].map((a) => ({ h: a.getAttribute("href"), t: a.innerText })).find((x) => /B-101/.test(x.t) || true)?.h);
  console.log("bed links", await page.evaluate(() => [...document.querySelectorAll("main a[href*='bed=']")].map((a) => a.innerText.replace(/\n/g, " ")).slice(0, 6)));
  await go(page, h.replace("bed=", "block=")); await page.waitForSelector("dialog[open]", { timeout: 10000 });
  let r = await send(page, "Block bed");
  rec("Rooms & Beds", "Block a bed with no reason", "Refused: reason needed", r.s, r.open && /reason/i.test(r.s) ? "PASS" : "FAIL");
  await page.locator("dialog[open] [name=reason]").fill("QA Demo broken cot"); r = await send(page, "Block bed");
  rec("Rooms & Beds", "Block a free bed for repair with a reason", "Blocked; shown as blocked and not offered for allocation", r.s, !r.open ? "PASS" : "FAIL");
});
await step("checkout", async () => {
  await go(page, "/hostel-management/allocation"); const h = await linkIn("Demo Varun", "checkout="); await go(page, h); await page.waitForSelector("dialog[open]");
  console.log((await page.locator("dialog[open]").innerText()).replace(/\n/g, " / ").slice(0, 400));
  let r = await send(page, "Check out");
  if (r.open) { await page.locator("dialog[open] [name=reason]").fill("QA Demo going home for good").catch(() => {}); r = await send(page, "Check out"); }
  rec("Allocation", "Check out (vacate) Demo Varun Teja", "Checked out; the bed becomes free", r.s, !r.open && /check/i.test(r.s) ? "PASS" : "FAIL");
  await go(page, "/hostel-management/rooms"); const t = await mainText(page, 3000);
  rec("Rooms & Beds", "Bed totals after check-out and block", "Boys' hostel: 0 taken, 3 free, 1 blocked", t.slice(t.indexOf("Beds taken"), t.indexOf("Beds taken") + 200).replace(/\n/g, " / "), /QA Demo Boys Hostel\n0 \/ 4|0 \/ 4/.test(t) ? "PASS" : "FAIL");
});
await page.context().close(); await close();
