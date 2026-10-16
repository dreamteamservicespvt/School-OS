// School Feature switches for the optional modules under test (Settings, Modules On/Off) as the School Admin.
import { asUser, go, mainText, close, record } from "./util.mjs";
const a = await asUser("cems.admin"); await go(a, "/settings/modules"); const t = await mainText(a, 5000);
for (const m of ["Inventory Management", "Hostel Management", "Library Management"]) {
  const i = t.indexOf(m); const state = (t.slice(i, i + 120).match(/\n(On|Off)\n/) ?? [])[1] ?? "?";
  record({ module: "Settings", page: "Modules On/Off", action: `${m} switch for CEMS before testing`, role: "School Admin", expected: "Known state; switched on for the test if off (and noted)", actual: `${state}${state === "On" ? " already; nothing changed" : ""}`, status: state === "On" ? "PASS" : "BLOCKED" });
}
await a.context().close(); await close();
