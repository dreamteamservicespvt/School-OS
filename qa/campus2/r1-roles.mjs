// Role isolation for Inventory, Hostel and Staff & HR: Teacher and Accountant through the menu and by direct URL
// (pages and the sheets that change things), and School B's admin opening CEMS record URLs.
import { asUser, go, mainText, close, record, opens, sleep } from "./util.mjs";
const rec = (module, page, action, role, expected, actual, status, defect) => record({ module, page, action, role, expected, actual, status, ...(defect ? { defect } : {}) });
// Collect CEMS record links as the people who own them.
const ids = {};
{
  const s = await asUser("cems.store");
  const first = async (url, sel) => { await go(s, url); return s.evaluate((q) => [...document.querySelectorAll(q)].map((a) => a.getAttribute("href")).find(Boolean), sel); };
  ids.item = await first("/inventory-management/items", "main a[href*='/inventory-management/items/']:not([href*='audits']):not([href*='export'])");
  ids.asset = await first("/inventory-management/assets", "main a[href*='/inventory-management/assets/']:not([href*='export']):not([href*='tags'])");
  ids.order = await first("/inventory-management/purchases?tab=orders", "main a[href*='/purchases/orders/']");
  await s.context().close();
  const h = await asUser("cems.hr"); await go(h, "/staff-hr-management?q=QA%20Demo%20Staff");
  ids.staff = await h.evaluate(() => [...document.querySelectorAll("main a[href*='/staff-hr-management/']")].map((a) => a.getAttribute("href")).find((x) => /\/staff-hr-management\/[0-9a-f-]{36}$/.test(x)));
  await go(h, "/staff-hr-management/exit"); ids.exit = await h.evaluate(() => [...document.querySelectorAll("main a[href*='/staff-hr-management/exit/']")].map((a) => a.getAttribute("href")).find((x) => /[0-9a-f-]{36}/.test(x)));
  await h.context().close();
  const w = await asUser("cems.warden"); await go(w, "/hostel-management/rooms");
  ids.hostel = await w.evaluate(() => [...document.querySelectorAll("main a[href*='hostel=']")].map((a) => a.getAttribute("href")).find(Boolean));
  await w.context().close();
}
console.log(ids);
const INV = ["/inventory-management", "/inventory-management/items?open=add", "/inventory-management/items?open=out", "/inventory-management/purchases?new=1", "/inventory-management/assets?open=add", "/inventory-management/settings", ids.item, ids.order];
const HOS = ["/hostel-management", "/hostel-management/rooms", "/hostel-management/allocation?allocate=1", "/hostel-management/outings?new=1", "/hostel-management/mess?view=expenses&new=1", "/hostel-management/settings"];
const HR = ["/staff-hr-management/add", "/staff-hr-management/documents", "/staff-hr-management/exit/new", "/staff-hr-management/leave?view=requests&apply=new", "/staff-hr-management/settings", ids.staff, ids.exit];

for (const [login, role] of [["cems.teacher", "Teacher"], ["cems.accountant", "Accountant"]]) {
  const p = await asUser(login);
  await go(p, "/dashboard"); const nav = await p.evaluate(() => [...document.querySelectorAll("nav a, aside a")].map((a) => a.innerText.trim()).filter(Boolean).join(", "));
  const invMenu = /Inventory/.test(nav), hosMenu = /Hostel/.test(nav);
  rec("Inventory Management", "Menu", "Is Inventory Management in the menu?", role, role === "Accountant" ? "Shown (View)" : "Not shown", invMenu ? "shown" : "not shown", (role === "Accountant") === invMenu ? "PASS" : "FAIL");
  rec("Hostel Management", "Menu", "Is Hostel Management in the menu?", role, "Not shown", hosMenu ? "shown" : "not shown", !hosMenu ? "PASS" : "FAIL");
  // Inventory by URL.
  const bad = [];
  for (const u of INV) {
    if (!u) continue; const r = await opens(p, u); const sheet = await p.locator("dialog[open]").count();
    const changeBtns = await p.locator("main").getByRole("button", { name: /^(Add item|Issue|Raise request|New order|Add asset|Save)/ }).count() + await p.locator("main").getByRole("link", { name: /^(Add item|Stock in|Stock out|Raise request|New order|Add asset)/ }).count();
    if (role === "Teacher" && !r.refused) bad.push(`${u} opened`);
    if (role === "Accountant" && (sheet || (!r.refused && changeBtns && !u.includes("purchases")))) bad.push(`${u}: ${sheet ? "change sheet opened" : changeBtns + " change buttons"}`);
  }
  rec("Inventory Management", "All pages by direct URL", `Open Inventory pages, change sheets (?open=add, new=1) and a CEMS item and order by URL`, role, role === "Teacher" ? "Refused every time" : "Read-only: pages open, no change sheet or change buttons", bad.join("; ") || "as expected", bad.length ? "FAIL" : "PASS");
  // Hostel by URL.
  const hb = [];
  for (const u of HOS) { const r = await opens(p, u); if (!r.refused || (await p.locator("dialog[open]").count())) hb.push(`${u} opened (${r.final})`); }
  rec("Hostel Management", "All pages by direct URL", "Open Hostel pages and change sheets by URL", role, "Refused every time", hb.join("; ") || "refused every time", hb.length ? "FAIL" : "PASS");
  // Staff & HR by URL.
  const sb = [];
  for (const u of HR) {
    if (!u) continue; const r = await opens(p, u); const sheet = await p.locator("dialog[open]").count();
    const t = r.text; const showsOther = /QA Demo Staff/.test(t) || (await p.locator("[name=staffId]:visible").count()) > 0;
    if (!r.refused && (showsOther || /Create staff|Record exit|Save document/.test(t))) sb.push(`${u}: ${sheet ? "sheet opened" : "opened"} "${t.slice(0, 80).replace(/\n/g, " ")}"`);
  }
  rec("Staff & HR Management", "All pages by direct URL", "Open Add Staff, Documents, Staff Exit, leave Requests (apply for someone), HR Settings, another staff member's profile and exit by URL", role, "Refused, or only their own records", sb.join("; ") || "refused or own only", sb.length ? "FAIL" : "PASS");
  await go(p, "/staff-hr-management"); const own = await mainText(p, 1500);
  rec("Staff & HR Management", "Staff List", "Open Staff & HR Management", role, "Only their own profile and leave (no staff list)", own.slice(0, 160).replace(/\n/g, " / "), !/QA Demo Staff|Showing 1 to/.test(own) ? "PASS" : "FAIL");
  await p.context().close();
}
// School B.
{
  const b = await asUser("qab.admin");
  const leaks = [];
  for (const u of [ids.item, ids.asset, ids.order, ids.staff, ids.exit, ids.hostel?.replace("rooms?", "rooms?") ]) {
    if (!u) continue; const r = await opens(b, u); const t = r.text;
    if (/QA Demo (Notebook|Projector|Staff|Boys|Girls)|PO\/2026-27\/0001|Paper Mart/.test(t)) leaks.push(`${u} shows CEMS data`);
  }
  for (const u of ["/inventory-management/items", "/inventory-management/purchases?tab=vendors", "/inventory-management/assets", "/hostel-management/rooms", "/hostel-management/allocation", "/staff-hr-management?q=QA", "/staff-hr-management/documents"]) {
    const r = await opens(b, u); if (/QA Demo (Notebook|Projector|Staff|Boys|Girls|Paper Mart)|Demo Varun|Satyavathi/.test(r.text)) leaks.push(`${u} lists CEMS records`);
  }
  rec("Inventory, Hostel, Staff & HR", "Direct URLs and lists", "School B admin opens CEMS item, asset, order, staff, exit and hostel URLs and the lists", "School Admin (School B)", "Never sees a CEMS record (not found or empty)", leaks.join("; ") || "no CEMS data seen", leaks.length ? "FAIL" : "PASS");
  await b.context().close();
}
await close();
