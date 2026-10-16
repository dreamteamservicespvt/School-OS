// Phone (375px) and laptop (1440px) layout of the Inventory, Hostel and Staff & HR pages (layoutIssues), each as the
// role that uses them.
import { asUser, go, close, record, layoutIssues, VIEWPORTS, sleep, shot } from "./util.mjs";
const PAGES = [
  ["cems.store", "Store Keeper", "Inventory Management", [["Issue Stock", "/inventory-management"], ["Items & Stock", "/inventory-management/items"], ["Purchases & Vendors", "/inventory-management/purchases"], ["Assets", "/inventory-management/assets"], ["Rooms, Labs & Maintenance", "/inventory-management/rooms"], ["Inventory Reports", "/inventory-management/reports"], ["Inventory Settings", "/inventory-management/settings"], ["Add item sheet", "/inventory-management/items?open=add"]]],
  ["cems.warden", "Hostel Warden", "Hostel Management", [["Roll Call & Incidents", "/hostel-management"], ["Rooms & Beds", "/hostel-management/rooms"], ["Allocation", "/hostel-management/allocation"], ["Outing & Visitors", "/hostel-management/outings"], ["Mess", "/hostel-management/mess"], ["Hostel Reports", "/hostel-management/reports"], ["Hostel Settings", "/hostel-management/settings"]]],
  ["cems.hr", "HR", "Staff & HR Management", [["Staff List", "/staff-hr-management"], ["Add Staff", "/staff-hr-management/add"], ["Staff Leave", "/staff-hr-management/leave?view=requests"], ["Documents & ID Cards", "/staff-hr-management/documents"], ["Staff Exit", "/staff-hr-management/exit"], ["HR Settings", "/staff-hr-management/settings"]]],
];
for (const [vpName, vp] of [["375px", VIEWPORTS.phone375], ["1440px", VIEWPORTS.desk1440]]) {
  for (const [login, role, module, pages] of PAGES) {
    const p = await asUser(login, vp);
    for (const [name, url] of pages) {
      p.problems.length = 0; await go(p, url); await sleep(400);
      const issues = await layoutIssues(p);
      const real = issues.filter((i) => !/^controls without a name: (a\[\], )*a\[\]$/.test(i));
      const status = real.length || p.problems.length ? "FAIL" : "PASS";
      if (status === "FAIL") await shot(p, `layout_${vpName}_${url.replace(/[^a-z0-9]+/gi, "_")}`);
      record({ module, page: name, action: `Open ${name} at ${vpName}`, role, expected: "No sideways scroll, every control named, no errors", actual: [...issues, ...p.problems].join("; ") || "no problems", status, ...(status === "FAIL" ? { defect: "CAMPUS2-06" } : {}) });
    }
    await p.context().close();
  }
}
await close();
