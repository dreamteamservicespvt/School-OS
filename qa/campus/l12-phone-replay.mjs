// Library: Reports and Settings at 375px (after the CAMPUS-12 fix), and wrong roles replaying the Librarian's Issue.
import { asUser, go, close, result, sleep, layoutIssues, VIEWPORTS } from "./util.mjs";
import { capture, replay } from "./actions.mjs";
const M = "Library Management", R = "Librarian";
const rec = (pg, action, role, expected, actual, ok, extra = {}) => result({ module: M, page: pg, action, role, expected, actual: String(actual).slice(0, 600), status: ok ? "PASS" : "FAIL", ...extra });

const phone = await asUser("cems.librarian", VIEWPORTS.phone375);
for (const [k, name] of [["reports", "Library Reports"], ["settings", "Library Settings"]]) {
  await go(phone, `/library-management/${k}`); await sleep(1500);
  const issues = await layoutIssues(phone);
  rec(name, `Open ${name} at 375px${k === "reports" ? " (after the fix)" : ""}`, R, "No sideways scroll, every control named", issues.join("; ") || "no problems", issues.length === 0, k === "reports" ? { defect: "CAMPUS-12" } : {});
}
const page = await asUser("cems.librarian");
const cap = await capture(page, "/library-management?card=CEMS%2F2026%2F0013&copy=00006", { submit: /^Issue “/ });
for (const login of ["cems.teacher", "cems.store", "cems.warden"]) {
  const other = await asUser(login);
  const r = cap ? await replay(other, cap) : { status: 0, msg: "no capture", raw: "" };
  rec("Issue & Return", "Issue copy 00006 by replaying the Librarian's Issue request", login, "Refused by the server", `HTTP ${r.status}: ${r.msg}`, Boolean(cap) && !/issued to/i.test(r.raw ?? "") && /not allowed|cannot|only|permission|do not have|can't|no access/i.test(r.msg));
}
console.log("done");
await close();
