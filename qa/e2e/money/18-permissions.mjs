// Who may open the money pages. node qa/e2e/money/18-permissions.mjs <login> [viewport]
import { as, visit, text, shot, BASE, note, VIEWPORTS } from "./h.mjs";
import { close } from "../../lib.mjs";

const [login, vp = "laptop1280"] = process.argv.slice(2);
const RITHVIK = "5323a56e-27dd-4d83-a914-3e95790b75a7";
const PAY = "b7360332-b234-423e-8477-84a059c914cb"; // Rithvik's ₹5,000 cash receipt
const urls = (process.env.URLS ?? [
  `/fee-management/collect/${RITHVIK}`, "/fee-management", "/fee-management/dashboard", "/fee-management/defaulters", `/fee-management/ledger/${RITHVIK}`,
  `/fee-management/payments/${PAY}`, `/fee-management/payments/${PAY}/receipt`, "/fee-management/structure", "/fee-management/settings", "/fee-management/concessions", "/fee-management/reports",
  "/finance-management/day-book", "/finance-management/expenses", "/finance-management/cash-bank", "/finance-management/reports", "/finance-management/settings",
  "/salary-management/generate", "/salary-management/structures", "/salary-management/slips",
  "/settings", "/settings/payment-gateways", "/settings/users", "/settings/forms-approvals",
].join(",")).split(",");
const page = await as(login, VIEWPORTS[vp]);
for (const u of urls) {
  let res;
  try { res = await visit(page, u, 1200); } catch (e) { note(`${u}: ERROR ${e.message.split("\n")[0]}`); continue; }
  const ct = res?.headers()["content-type"] ?? "";
  let t = "";
  if (ct.includes("html")) t = (await text(page, 400)).slice(0, 170);
  const leak = /Rithvik|₹5,000|SPS\/2026-27\/00345/.test(t) ? " [SHOWS DATA]" : "";
  note(`${u} -> HTTP ${res?.status()} ${ct.split(";")[0]} ${page.url().replace(BASE, "")}${leak} :: ${t}`);
}
note("problems", JSON.stringify(page.problems));
await close();
