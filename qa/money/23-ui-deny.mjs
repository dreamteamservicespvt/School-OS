// Screens a role must not use, opened by typing the address: what the person sees.
import { as, visit, result, mainText } from "./m.mjs";
import { close } from "../lib.mjs";

const STU = "c2435b36-c0e6-4703-89ba-e80d86add96e";
const cases = [
  ["cems.accountant", "Student Management", `/student-management/students/${STU}/edit/personal`, "Edit student (personal)"],
  ["cems.accountant", "Academic Management", "/academic-management/subjects", "Subjects"],
  ["cems.accountant", "Staff & HR Management", "/staff-hr-management/add", "Add staff"],
  ["cems.accountant", "Settings", "/settings/school-profile", "School Profile"],
  ["cems.accountant", "Settings", "/settings/users-permissions", "Users & Permissions"],
  ["cems.accountant", "Attendance Management", "/attendance-management/register", "Attendance Register"],
  ["cems.accountant", "Attendance Management", "/attendance-management/staff?view=mark", "Staff attendance, mark by hand"],
  ["cems.teacher", "Fee Management", `/fee-management/collect/${STU}`, "Collect Fee"],
  ["cems.teacher", "Finance Management", "/finance-management/expenses?do=new", "Record expense"],
  ["cems.classteacher", "Fee Management", "/fee-management/dashboard", "Fee Dashboard"],
  ["cems.classteacher", "Finance Management", "/finance-management/day-book", "Day Book"],
  ["cems.classteacher", "Salary Management", "/salary-management/generate", "Generate Salary"],
];
for (const [login, M, url, P] of cases.slice(Number(process.env.FROM ?? 0))) {
  const page = await as(login);
  const res = await visit(page, url);
  await page.waitForLoadState("load").catch(() => {});
  await page.waitForTimeout(2500);
  const t = (await mainText(page, 600)).replace(/\s+/g, " ");
  const inputs = await page.locator("main input:not([type=hidden]):not([type=search]), main select, main textarea, [role=dialog] input:not([type=hidden])").count();
  const saves = await page.getByRole("button", { name: /^(Save|Collect|Add|Record|Send|Mark)/ }).count();
  const shown = inputs > 0 && saves > 0;
  result({ module: M, page: P, action: `Open ${url} by typing the address`, role: login.replace(/^\w+\./, ""), expected: "No form to change anything; plain words", actual: `HTTP ${res?.status()} ${page.url().replace(/^https?:\/\/[^/]+/, "")} | ${t.slice(0, 180)} | inputs=${inputs} buttons=${saves}`, status: shown ? "FAIL" : "PASS" });
  await page.context().close();
}
await close();
