// Role reach: each campus role opens every module (and a few deep pages) by direct URL.
// Expected reach comes from docs/blueprint/05-roles.md.
import { asUser, go, mainText, close, result, sleep } from "./util.mjs";

const MODS = ["dashboard", "admission-management", "student-management", "academic-management", "attendance-management", "fee-management", "finance-management", "examination-results", "staff-hr-management", "salary-management", "communication", "transport-management", "library-management", "inventory-management", "hostel-management", "front-office", "homework-learning", "events-calendar", "reports-analytics", "settings"];
const DEEP = ["/fee-management/collect", "/finance-management/expenses", "/finance-management/day-book", "/salary-management/generate", "/settings/users", "/settings/modules", "/staff-hr-management/add", "/staff-hr-management/settings"];
// 05-roles.md columns, in MODS order ("-" means no access).
const MATRIX = {
  "cems.transport": ["Own", "-", "-", "-", "-", "-", "-", "-", "Own", "Own", "Own", "Full", "-", "-", "-", "-", "-", "View", "-", "-"],
  "cems.librarian": ["Own", "-", "View", "-", "-", "-", "-", "-", "Own", "Own", "-", "-", "Full", "-", "-", "-", "-", "View", "-", "-"],
  "cems.warden": ["Own", "-", "Own", "-", "-", "-", "-", "-", "Own", "Own", "-", "-", "-", "-", "Full", "-", "-", "View", "-", "-"],
  "cems.store": ["Own", "-", "-", "-", "-", "-", "-", "-", "Own", "Own", "-", "-", "-", "Full", "-", "-", "-", "View", "-", "-"],
  "cems.hr": ["Own", "-", "-", "-", "Own", "-", "-", "-", "Full", "View", "Own", "-", "-", "-", "-", "-", "-", "View", "View", "-"],
  "cems.driver": ["-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "Own", "-", "-", "-", "-", "-", "-", "-", "-"],
};
const ROLE = { "cems.transport": "Transport In-charge", "cems.librarian": "Librarian", "cems.warden": "Hostel Warden", "cems.store": "Store Keeper", "cems.hr": "HR", "cems.driver": "Driver" };
const only = process.argv[2];

async function opens(page, url) {
  let res;
  try { res = await go(page, url); } catch { await sleep(3000); res = await go(page, url); }
  await sleep(300);
  const final = page.url();
  const text = await mainText(page, 600);
  const refused = /\/no-access|\/sign-in/.test(final) || /do not have access|not part of your role|You do not have permission|No access/i.test(text) || (res && res.status() === 404);
  return { refused, final: final.replace(/^https?:\/\/[^/]+/, ""), status: res?.status(), text: text.slice(0, 120).replace(/\s+/g, " ") };
}

for (const [login, row] of Object.entries(MATRIX)) {
  if (only && !only.split(",").includes(login)) continue;
  const page = await asUser(login);
  const wrong = [];
  for (const [i, m] of MODS.entries()) {
    const r = await opens(page, `/${m}`);
    const shouldOpen = row[i] !== "-";
    // The driver's Transport (Own) is the driver page; other Transport pages send them there.
    const toDriver = login === "cems.driver" && r.final.startsWith("/driver");
    const ok = shouldOpen ? !r.refused : (r.refused || toDriver);
    if (!ok) wrong.push(`${m} (${row[i]}): ${r.refused ? "refused" : "opened"} → ${r.final}`);
  }
  result({ module: "Roles", page: "All modules by direct URL", action: `${ROLE[login]} opens each of the 20 modules`, role: ROLE[login], expected: "Only the modules 05-roles.md gives the role open", actual: wrong.length ? wrong.join("; ") : "matches 05-roles.md", status: wrong.length ? "FAIL" : "PASS" });
  const deepWrong = [];
  for (const u of DEEP) {
    const mod = u.split("/")[1];
    const reach = row[MODS.indexOf(mod)];
    const r = await opens(page, u);
    const shouldOpen = reach === "Full";
    // View reach may open a page read-only, never with its changes.
    const viewOnly = reach === "View" && /View only/i.test(r.text);
    if (shouldOpen === r.refused && !viewOnly) deepWrong.push(`${u} (${reach}): ${r.refused ? "refused" : "opened"} → ${r.final} "${r.text.slice(0, 60)}"`);
  }
  result({ module: "Roles", page: "Deep pages of other modules", action: `${ROLE[login]} opens fee collection, expenses, Day Book, salary run, users, modules, add staff, HR settings`, role: ROLE[login], expected: "Refused unless the role has Full reach there", actual: deepWrong.length ? deepWrong.join("; ") : "all as expected", status: deepWrong.length ? "FAIL" : "PASS" });
  await page.context().close();
}
await close();
