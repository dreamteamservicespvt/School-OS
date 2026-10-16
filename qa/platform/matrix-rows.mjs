// Turns the role-matrix JSON files into result rows (one per login for the menu,
// one per login for the denied pages, one per login for the allowed pages).
//   node qa/platform/matrix-rows.mjs | node qa/platform/rec.mjs
import { readFileSync, existsSync } from "node:fs";
const DIR = process.env.QA_OUT ?? "/home/claude/qa-out/platform";
const perms = JSON.parse(readFileSync("qa/platform/cems-perms.json", "utf8"));
const SELF = new Set(["staff-hr-management", "salary-management"]);
for (const login of Object.keys(perms)) {
  const f = `${DIR}/role-matrix-${login}.json`;
  if (!existsSync(f)) continue;
  const r = JSON.parse(readFileSync(f, "utf8"));
  const menu = r.menu.map((m) => m.split("=")[1].slice(1));
  const exp = Object.entries(perms[login]).filter(([k, v]) => v !== "none" && !(SELF.has(k) && v === "own")).map(([k]) => k);
  const missing = exp.filter((k) => !menu.includes(k)), extra = menu.filter((k) => !exp.includes(k));
  const role = login;
  console.log(JSON.stringify({ module: "App shell", page: "Main menu", action: "sign in and read the menu", role, expected: `menu shows exactly the modules 05-roles.md gives (${exp.length})`, actual: `${menu.length} modules: ${menu.join(", ")}${missing.length ? `; missing ${missing}` : ""}${extra.length ? `; extra ${extra}` : ""}`, status: missing.length || extra.length ? "FAIL" : "PASS" }));
  const denied = r.rows.filter((x) => x.level === "none");
  const leaks = denied.filter((x) => x.verdict === "LEAK");
  console.log(JSON.stringify({ module: "Security", page: `${denied.length} pages of modules with no access`, action: "open each by direct URL", role, expected: "no-access screen, never data", actual: leaks.length ? `opened: ${leaks.map((x) => x.page).join(", ")}` : `all ${denied.length} went to the no-access screen (report-problem is open to every staff member by design)`, status: leaks.length ? "FAIL" : "PASS", ...(leaks.length ? { defect: "PLATFORM-leak" } : {}) }));
  const allowed = r.rows.filter((x) => x.level !== "none" && x.level !== "n/a");
  const errors = r.rows.filter((x) => x.verdict === "ERROR");
  const sub = allowed.filter((x) => x.verdict === "denied-subpage").map((x) => x.page);
  const slow = r.rows.filter((x) => x.ms > 1500).map((x) => `${x.page} ${x.ms}ms`);
  console.log(JSON.stringify({ module: "App shell", page: `${allowed.length} pages of the role's modules + shared pages`, action: "open each by direct URL (server render)", role, expected: "renders without errors; office-only sub-pages show no-access", actual: `${errors.length} errors; ${sub.length} office-only sub-pages sent to no-access${sub.length ? ` (${sub.slice(0, 8).join(", ")}${sub.length > 8 ? ", …" : ""})` : ""}; slow >1.5s: ${slow.length ? slow.join(", ") : "none"}`, status: errors.length ? "FAIL" : "PASS" }));
}
