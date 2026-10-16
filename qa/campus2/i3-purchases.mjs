// Inventory: vendors (validation, duplicate GSTIN/phone) and a purchase request above the limit.
import { asUser, go, mainText, close, record, openDialog, send, said, sleep } from "./util.mjs";
const M = "Inventory Management", P = "Purchases & Vendors", R = "Store Keeper";
const rec = (action, expected, actual, status, defect) => record({ module: M, page: P, action, role: R, expected, actual, status, ...(defect ? { defect } : {}) });
const page = await asUser("cems.store");
const ONLY = process.env.ONLY?.split(",");
const step = async (name, fn) => { if (ONLY && !ONLY.some((o) => name.includes(o))) return; try { await fn(); } catch (e) { console.log("ERR", name, e.message.split("\n")[0]); rec(name, "Step runs", `script error: ${e.message.split("\n")[0]}`, "BLOCKED"); } };
const D = (k) => page.locator(`dialog[open] [name="${k}"]`).first();
const V = "/inventory-management/purchases?tab=vendors&editvendor=new";
const stamp = Date.now().toString().slice(-4);
const phone = `90000${stamp}1`.slice(0, 10);

await step("vendor empty", async () => {
  await openDialog(page, V); const r = await send(page, "Save vendor");
  rec("Save a vendor with nothing typed", "Refused: vendor name needed", r.s, r.open && /name/i.test(r.s) ? "PASS" : "FAIL");
});
await step("vendor bad phone", async () => {
  await openDialog(page, V); await D("name").fill(`QA Demo Bad Phone ${stamp}`); await D("phone").fill("12345");
  const r = await send(page, "Save vendor");
  rec("Save a vendor with phone 12345", "Refused: phone must be 10 digits", r.s, r.open && /phone|digit/i.test(r.s) ? "PASS" : "FAIL");
});
await step("vendor bad gstin", async () => {
  await openDialog(page, V); await D("name").fill(`QA Demo Bad GST ${stamp}`); await D("gstin").fill("XYZ123");
  const r = await send(page, "Save vendor");
  rec("Save a vendor with GSTIN XYZ123", "Refused: GSTIN is 15 characters", r.s, r.open && /gst/i.test(r.s) ? "PASS" : "FAIL");
});
const gst = `36AAAQA${stamp}A1Z5`;
await step("vendor good", async () => {
  await openDialog(page, V); await D("name").fill(`QA Demo Paper Mart ${stamp}`); await D("phone").fill(phone); await D("gstin").fill(gst); await D("itemsSupplied").fill("Notebooks");
  const r = await send(page, "Save vendor");
  rec(`Save vendor QA Demo Paper Mart ${stamp} (phone ${phone}, GSTIN ${gst})`, "Saved and listed", r.s, !r.open ? "PASS" : "FAIL");
});
await step("vendor dup phone", async () => {
  await openDialog(page, V); await D("name").fill(`QA Demo Other Name ${stamp}`); await D("phone").fill(phone);
  const r = await send(page, "Save vendor"); const t = await mainText(page, 3000);
  rec("Add a vendor with the phone of an existing vendor", "Shows the existing vendor (QA Demo Paper Mart) instead", r.s + " / " + (r.open ? "" : t.slice(0, 200)), (r.open && /Paper Mart/.test(r.s)) || (!r.open && /Paper Mart/.test(t) && !/Other Name/.test(t)) ? "PASS" : "FAIL");
});
await step("vendor dup gstin", async () => {
  await openDialog(page, V); await D("name").fill(`QA Demo Third Name ${stamp}`); await D("gstin").fill(gst.toLowerCase());
  const r = await send(page, "Save vendor");
  rec("Add a vendor with the GSTIN of an existing vendor (typed in lower case)", "Shows the existing vendor instead", r.s, r.open && /Paper Mart/.test(r.s) ? "PASS" : "FAIL");
});
await step("request", async () => {
  await openDialog(page, "/inventory-management/purchases?new=1");
  const sel = D("itemId"); const v = await sel.locator("option", { hasText: "QA Demo Notebook 1569" }).first().getAttribute("value"); await sel.selectOption(v);
  await D("qty").fill("200"); await D("price").fill("45");
  let r = await send(page, /Raise request|Send/);
  rec("Raise a request with no reason", "Refused: reason needed", r.s, r.open && /reason/i.test(r.s) ? "PASS" : "FAIL");
  const after = await sel.inputValue();
  rec("Item line after the 'no reason' refusal", "The chosen item stays chosen (only the reason needs fixing)", `item box now "${after || "Choose an item"}", quantity ${await D("qty").inputValue()}, rate ${await D("price").inputValue()}`, after === v ? "PASS" : "FAIL", after === v ? undefined : "CAMPUS2-02");
  if (after !== v) await sel.selectOption(v);
  await D("reason").fill("QA Demo notebooks for the next term");
  const btn = (await page.locator("dialog[open] button[type=submit]").last().innerText()).trim();
  r = await send(page, btn);
  rec(`Raise a purchase request: 200 notebooks at ₹45 (₹9,000, above the ₹5,000 limit); button "${btn}"`, "Saved as Waiting, sent to Approvals", r.s, !r.open && /approv|wait/i.test(r.s + btn) ? "PASS" : "FAIL");
  await go(page, "/inventory-management/purchases?tab=requests"); const t = await mainText(page, 4000);
  const i = t.indexOf("QA Demo Notebook 1569 × 200"); 
  rec("Requests tab after raising", "The request shows Waiting with no Make order button", t.slice(Math.max(0, i - 120), i + 200), /Waiting/.test(t.slice(Math.max(0, i - 120), i + 200)) ? "PASS" : "FAIL");
});
console.log("PROBLEMS", page.problems);
await page.context().close(); await close();
