// Self-test A tour: opens every screen of the five modules as the given role, 1440 px shots, text dumps.
//   MSYS_NO_PATHCONV=1 node qa/full/selftest-A-tour.mjs principal salary-management finance-management
import { asRole, go, pageState, snap, ok, finish, note, close, sleep } from "./selftest-A-h.mjs";
const [role, ...mods] = process.argv.slice(2);
const PAGES = {
  "salary-management": ["", "/structures", "/generate", "/slips", "/history", "/advances", "/settings", "/structures/import"],
  "finance-management": ["", "/day-book", "/expenses", "/income", "/cash-bank", "/accounts", "/budget", "/reports", "/settings", "/expenses/import"],
  "front-office": ["", "/visitors", "/enquiries", "/appointments", "/pickup", "/postal"],
  "events-calendar": ["", "/events", "/daily", "/ptm", "/cocurricular", "/gallery", "/settings", "/import"],
  "reports-analytics": ["", "/analytics", "/custom", "/early-warnings", "/government"],
};
const p = await asRole(role);
for (const m of mods) {
  for (const sub of PAGES[m]) {
    const url = `/${m}${sub}`;
    p.problems.length = 0;
    const res = await go(p, url);
    await sleep(2000);
    const s = await pageState(p);
    const name = `${role}-${m}${sub.replace(/\//g, "-")}`;
    await snap(p, name);
    note(`tour-${role}`, `\n===== ${url} -> ${s.path} [${res?.status()}] h1="${s.h1}"\n${s.text}\nPROBLEMS: ${p.problems.join(" ; ")}`);
    ok(m, `${role} opens ${url}`, !s.broken && (res?.status() ?? 0) < 400 && p.problems.length === 0, `${s.path} h1="${s.h1}" ${s.refused ? "REFUSED " : ""}${p.problems.join(" ; ")}`);
  }
}
finish(`tour-${role}`);
await close();
