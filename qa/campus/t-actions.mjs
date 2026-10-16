// Server-side refusal: forms of other modules submitted directly (server action replay) by campus roles.
import { asUser, close, result } from "./util.mjs";
import { capture, replay } from "./actions.mjs";

// [owner login, url, label, submit button or null, roles that must be refused]
const CASES = [
  ["cems.admin", "/finance-management/expenses?do=new", "Finance: record an expense", null, ["cems.transport", "cems.librarian", "cems.warden", "cems.store", "cems.hr", "cems.driver"]],
  ["cems.admin", "/finance-management/cash-bank?do=account", "Finance: add a bank account", null, ["cems.store", "cems.hr"]],
  ["cems.admin", "/finance-management/settings?do=head", "Finance: add an account head", null, ["cems.store", "cems.librarian"]],
  ["cems.admin", "/salary-management/settings?do=component", "Salary: add a salary component", null, ["cems.hr", "cems.transport", "cems.librarian", "cems.store", "cems.warden"]],
  ["cems.admin", "/salary-management/structures?do=add", "Salary: add a salary structure", null, ["cems.hr", "cems.store"]],
  ["cems.transport", "/transport-management/vehicles?do=vehicle", "Transport: add a vehicle", null, ["cems.warden", "cems.librarian", "cems.store", "cems.hr", "cems.driver", "cems.accountant", "cems.teacher"]],
];

for (const [owner, url, label, submit, refuse] of CASES.filter((_, i) => !process.env.ONLY || process.env.ONLY.split(",").includes(String(i)))) {
  console.log("case", label);
  const op = await asUser(owner);
  const cap = await capture(op, url, { submit }).catch((e) => { console.log(String(e).slice(0, 200)); return null; });
  if (!cap) { result({ module: "Roles", page: url, action: `${label}: capture the form`, role: owner, expected: "Form submits", actual: "no server action was sent", status: "BLOCKED" }); await op.context().close(); continue; }
  console.log("captured", url, cap.headers["next-action"]);
  const own = await replay(op, cap);
  console.log("owner", own.status, own.msg.slice(0, 150));
  await op.context().close();
  for (const who of refuse) {
    const p = await asUser(who);
    const r = await replay(p, cap);
    const refused = /permission|cannot|not allowed|Your role|do not have|no access|Ask the|Only the .* can/i.test(r.msg) || r.status === 403 || r.status === 404;
    result({ module: "Roles", page: url.split("?")[0], action: `${label} by direct server action`, role: who, expected: "Refused by the server in plain words", actual: `${r.status} ${r.msg.slice(0, 200)} (owner got: ${own.msg.slice(0, 80)})`, status: refused ? "PASS" : "FAIL" });
    await p.context().close();
  }
}
await close();
