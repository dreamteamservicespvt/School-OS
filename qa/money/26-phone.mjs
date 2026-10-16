// Main money screens at phone width (375 px) as the Accountant: no sideways scroll, nothing cut off.
import { as, visit, result, layoutIssues, shot, VIEWPORTS } from "./m.mjs";
import { close } from "../lib.mjs";

const VIHAAN = "c2435b36-c0e6-4703-89ba-e80d86add96e";
const screens = [
  ["Fee Management", "Collect Fee", `/fee-management/collect/${VIHAAN}`],
  ["Fee Management", "Student Fee Ledger", `/fee-management/ledger/${VIHAAN}`],
  ["Fee Management", "Fee Dashboard", "/fee-management/dashboard"],
  ["Finance Management", "Day Book", "/finance-management/day-book"],
  ["Finance Management", "Expenses", "/finance-management/expenses"],
  ["Finance Management", "Expenses", "/finance-management/expenses?do=new"],
  ["Finance Management", "Income", "/finance-management/income"],
  ["Salary Management", "Generate Salary", "/salary-management/generate"],
  ["Salary Management", "Salary Slips", "/salary-management/slips"],
];
for (const [M, P, url] of screens) {
  const page = await as("cems.accountant", VIEWPORTS.phone375);
  const res = await visit(page, url);
  await page.waitForTimeout(2000);
  const li = await layoutIssues(page);
  await shot(page, `phone-${url.replace(/\W+/g, "_")}`);
  const bad = li.filter((x) => /sideways|cut off|overflow/i.test(x));
  result({ module: M, page: P, action: `${url} at 375 px`, role: "accountant", expected: "No sideways scroll; no server error", actual: `HTTP ${res?.status()} ${JSON.stringify(li).slice(0, 200)} ${page.problems.join("; ").slice(0, 120)}`, status: bad.length || (res?.status() ?? 500) >= 500 ? "FAIL" : "PASS" });
  await page.context().close();
}
await close();
