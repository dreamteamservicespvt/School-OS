// Inventory: facilities and a maintenance request; assets (validation, duplicate tag, warranty, dispose needs approval);
// stock audit with a variance; reports and settings open.
import { asUser, go, mainText, close, record, openDialog, send, said, sleep } from "./util.mjs";
const M = "Inventory Management", R = "Store Keeper";
const rec = (pg, action, expected, actual, status, defect) => record({ module: M, page: pg, action, role: R, expected, actual, status, ...(defect ? { defect } : {}) });
const ONLY = process.env.ONLY?.split(",");
const step = async (name, fn) => { if (ONLY && !ONLY.some((o) => name.includes(o))) return; try { await fn(); } catch (e) { console.log("ERR", name, e.message.split("\n")[0]); } };
const page = await asUser("cems.store");
const D = (k) => page.locator(`dialog[open] [name="${k}"]`).first();
const pick = async (k, text) => { const s = D(k); await s.selectOption(await s.locator("option", { hasText: text }).first().getAttribute("value")); };
const submitBtn = async () => (await page.locator("dialog[open] button[type=submit]").last().innerText()).trim();
const stamp = Date.now().toString().slice(-4);
const iso = (d) => d.toISOString().slice(0, 10);

await step("place", async () => {
  await openDialog(page, "/inventory-management/rooms?open=place");
  let r = await send(page, await submitBtn());
  rec("Rooms, Labs & Maintenance", "Add a place with nothing typed", "Refused: name needed", r.s, r.open && /name/i.test(r.s) ? "PASS" : "FAIL");
  await D("name").fill(`QA Demo Room ${stamp}`); await D("type").selectOption({ index: 1 }).catch(() => {}); await D("capacity").fill("40").catch(() => {});
  r = await send(page, await submitBtn());
  rec("Rooms, Labs & Maintenance", `Add place QA Demo Room ${stamp}, capacity 40`, "Saved and in the facility register", r.s, !r.open ? "PASS" : "FAIL");
});
await step("maint", async () => {
  await openDialog(page, "/inventory-management/rooms?open=raise");
  let r = await send(page, await submitBtn());
  rec("Rooms, Labs & Maintenance", "Raise a maintenance request with nothing typed", "Refused: place and problem needed", r.s, r.open && /place|problem/i.test(r.s) ? "PASS" : "FAIL");
  await pick("placeId", `QA Demo Room ${stamp}`); await D("problem").fill("QA Demo ceiling fan not working");
  r = await send(page, await submitBtn());
  rec("Rooms, Labs & Maintenance", "Raise a maintenance request: fan not working", "Saved as Open", r.s, !r.open ? "PASS" : "FAIL");
  await go(page, "/inventory-management/rooms?status=open"); const t = await mainText(page, 5000);
  rec("Rooms, Labs & Maintenance", "Open requests list", "The request shows as Open", t.includes("ceiling fan") ? "listed" : t.slice(0, 300), t.includes("ceiling fan") ? "PASS" : "FAIL");
});
let tag = "";
await step("asset", async () => {
  await openDialog(page, "/inventory-management/assets?open=add");
  let r = await send(page, "Add asset");
  rec("Assets", "Add an asset with nothing typed", "Refused: name, type and place needed", r.s, r.open && /name|type/i.test(r.s) ? "PASS" : "FAIL");
  await D("name").fill(`QA Demo Projector ${stamp}`); await pick("type", "IT");
  await pick("roomId", `QA Demo Room ${stamp}`).catch(async () => { await page.locator("dialog[open]").getByRole("button", { name: "Department" }).click(); await sleep(300); await D("departmentId").selectOption({ index: 1 }); });
  const w = new Date(Date.now() + 20 * 864e5); await D("warrantyEnd").fill(iso(w)); await D("cost").fill("32000"); await D("purchaseDate").fill(iso(new Date(Date.now() - 300 * 864e5)));
  r = await send(page, "Add asset");
  tag = (r.s.match(/AT-\d+/) ?? [])[0] ?? "";
  rec("Assets", `Add QA Demo Projector (IT, ₹32,000, warranty ends in 20 days)`, "Saved with the next tag", r.s, !r.open ? "PASS" : "FAIL");
  await openDialog(page, "/inventory-management/assets?open=add");
  await D("name").fill(`QA Demo Second ${stamp}`); await pick("type", "IT"); await D("tag").fill(tag);
  await pick("roomId", `QA Demo Room ${stamp}`).catch(() => {});
  r = await send(page, "Add asset");
  rec("Assets", `Add an asset with tag ${tag} already used`, "Blocked: 'Tag … belongs to QA Demo Projector'", r.s, r.open && /belongs|already|used/i.test(r.s) ? "PASS" : "FAIL");
  await go(page, "/inventory-management/assets"); const t = await mainText(page, 5000);
  rec("Assets", "Asset register: warranty ending soon", "The projector shows under warranty/AMC ending soon", t.slice(0, 500).replace(/\n/g, " / "), /warranty|AMC/i.test(t) && /ending|soon|due/i.test(t) ? "PASS" : "FAIL");
});
await step("dispose", async () => {
  await go(page, "/inventory-management/assets");
  const href = await page.evaluate((n) => [...document.querySelectorAll("main tr, main li")].filter((r) => r.innerText.includes(n)).map((r) => r.querySelector("a[href*='/assets/']")?.getAttribute("href")).find(Boolean), `QA Demo Projector ${stamp}`);
  await go(page, href + "?open=dispose"); await page.waitForSelector("dialog[open]");
  await D("reason").fill("QA Demo lamp burnt, not worth repair").catch(() => {});
  await D("method").selectOption({ index: 1 }).catch(() => {});
  const b = await submitBtn(); const r = await send(page, b);
  await go(page, href); const t = await mainText(page, 3000);
  rec("Assets", `Dispose of the projector (button "${b}")`, "Needs approval; asset stays in the register (not Disposed yet)", `${r.s} / page: ${t.slice(0, 250).replace(/\n/g, " / ")}`, /approv|wait/i.test(r.s + b) && !/Disposed/.test(t.slice(0, 400)) ? "PASS" : "FAIL");
});
await step("audit", async () => {
  await openDialog(page, "/inventory-management/items?open=audit");
  const r = await send(page, await submitBtn());
  rec("Items & Stock", "Start a stock audit of the Main store", "Audit opens with counts to enter", r.s, !r.open ? "PASS" : "FAIL");
  console.log(page.url()); const t = await mainText(page, 3000); console.log(t.slice(0, 1200));
});
await step("reports", async () => {
  for (const [u, n] of [["/inventory-management/reports", "Inventory Reports"], ["/inventory-management/settings", "Inventory Settings"], ["/inventory-management/assets", "Assets"], ["/inventory-management/purchases", "Purchases & Vendors"], ["/inventory-management/rooms", "Rooms, Labs & Maintenance"]]) {
    page.problems.length = 0; await go(page, u); const t = await mainText(page, 3000);
    rec(n, `Open ${n}`, "Opens with no errors", `${t.slice(0, 200).replace(/\n/g, " / ")} ${page.problems.join("; ")}`, page.problems.length === 0 && !/Something went wrong|error/i.test(t.slice(0, 300)) ? "PASS" : "FAIL");
  }
});
await page.context().close(); await close();
