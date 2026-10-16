// Role checks for the people roles: (1) the page, as the menu would open it, and (2) the server
// action called directly (Next-Action header, the way the browser calls it) with an empty form.
// Action ids come from the production build's server-reference-manifest.json (the app on :3000).
import { readFileSync } from "node:fs";
import { go, close, BASE } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const manifest = JSON.parse(readFileSync(process.env.MANIFEST ?? "/home/claude/school-os/.next/server/server-reference-manifest.json", "utf8")).node;
const idOf = (file, name) => Object.entries(manifest).find(([, v]) => v.filename?.endsWith(file) && v.exportedName === name)?.[0];
const ACTIONS = [
  { label: "Fee Management: collect a fee (collectFee)", file: "fee-management/collect/[studentId]/actions.ts", name: "collectFee" },
  { label: "Fee Management: new concession (newConcessionAction)", file: "fee-management/concessions/actions.ts", name: "newConcessionAction" },
  { label: "Finance Management: record an expense (recordExpenseAction)", file: "finance-management/expenses/actions.ts", name: "recordExpenseAction" },
  { label: "Salary Management: calculate payroll (calculateAction)", file: "salary-management/generate/actions.ts", name: "calculateAction" },
  { label: "Salary Management: save a salary structure (saveStructureAction)", file: "salary-management/structures/actions.ts", name: "saveStructureAction" },
  { label: "Settings: save a WhatsApp channel (saveChannelAction)", file: "settings/messaging/actions.ts", name: "saveChannelAction", args: ["whatsapp", { provider: "gupshup", isOn: false, config: {}, secrets: {} }] },
  { label: "Settings: change a user's access (accessAction)", file: "settings/users/actions.ts", name: "accessAction" },
];
const PAGES = ["/fee-management", "/finance-management", "/salary-management", "/settings", "/settings/users", "/staff-hr-management"];
const ROLES = (process.env.ROLES ?? "cems.reception:Receptionist,cems.counsellor:Counsellor,cems.gate:Gate Security,cems.office:Office Staff,cems.admissions:Admission Counsellor").split(",").map((x) => x.split(":"));

async function callAction(page, id, args) {
  if (args) {
    const r = await page.request.post(`${BASE}/dashboard`, { headers: { "Next-Action": id, Accept: "text/x-component", "Content-Type": "text/plain;charset=UTF-8" }, data: JSON.stringify(args) });
    return { status: r.status(), body: (await r.text()).replace(/\s+/g, " ") };
  }
  const fd = new FormData();
  fd.append("_1_x", "1");
  fd.append("0", JSON.stringify(["$undefined", "$K1"])); // root last; form fields are "_1_<name>"
  const r = await page.request.post(`${BASE}/dashboard`, { headers: { "Next-Action": id, Accept: "text/x-component" }, multipart: fd });
  return { status: r.status(), body: (await r.text()).replace(/\s+/g, " ") };
}

for (const [login, role] of ROLES) {
  const page = await as(login);
  for (const p of PAGES) {
    await go(page, p);
    await page.waitForTimeout(600);
    const t = (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ");
    const refused = /not part of your role|no access|do not have access|cannot open|not allowed|Ask your School Admin/i.test(t) || !page.url().includes(p);
    const allowedByBlueprint = p === "/staff-hr-management" || p === "/salary-management"; // Own for every staff role: own profile, leave, slips
    res({ module: "Platform", page: p, action: `Open ${p} by address`, role, expected: allowedByBlueprint ? "Only their own staff record (Own)" : "Refused in plain words", actual: `${page.url().replace(/.*:\d+/, "")} ${t.slice(0, 160)}`, status: allowedByBlueprint ? (/All staff|Add staff|Run payroll|Generate/.test(t) || !/mine=1|Only your own|Only yours|\/staff-hr-management\/[0-9a-f-]{36}/.test(page.url() + t) ? "FAIL" : "PASS") : refused ? "PASS" : "FAIL" });
  }
  for (const a of ACTIONS) {
    const id = idOf(a.file, a.name);
    if (!id) { console.log("no id", a.name); continue; }
    const r = await callAction(page, id, a.args);
    const refused = /not part of your role|cannot|not allowed|permission|Ask your School Admin|only|Your role/i.test(r.body) && !/"ok":true/.test(r.body);
    res({ module: "Platform", page: a.file.replace(/\/actions\.ts$/, ""), action: `Call ${a.label} directly (server action, empty form)`, role, expected: "Server refuses; nothing changes", actual: `HTTP ${r.status} ${r.body.slice(0, 220)}`, status: refused || r.status >= 400 ? "PASS" : "FAIL" });
  }
}
// Control: the same call as School Admin reaches the action (so a refusal above is the role check, not a bad call).
const admin = await as("cems.admin");
const r = await callAction(admin, idOf("salary-management/structures/actions.ts", "saveStructureAction"));
console.log("ADMIN CONTROL", r.status, r.body.slice(0, 400));
await close();
