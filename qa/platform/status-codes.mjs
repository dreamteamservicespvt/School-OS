// HTTP status of pages that are not there (QA PLATFORM-17), signed in, against `next start`:
// an unknown address, a record that does not exist, and another school's record answer 404
// with "This page is not here"; real pages and this school's records still answer 200.
//
//   QA_URL=http://localhost:3000 QA_PASSWORD=... QA_LOGIN=admin \
//   QA_OWN_STUDENT=<id in the login's school> QA_OTHER_STUDENT=<id in another school> \
//   node qa/platform/status-codes.mjs
import { randomUUID } from "node:crypto";
import { BASE, close, newPage, signIn } from "../lib.mjs";

const login = process.env.QA_LOGIN ?? "cems.admin";
const own = process.env.QA_OWN_STUDENT;
const other = process.env.QA_OTHER_STUDENT;
const NOT_HERE = /This page is not here/;

const checks = [
  ["/dashboard", 200],
  ["/student-management", 200],
  ["/no-such-page", 404],
  ["/no-such-page/deeper/still", 404],
  ["/student-management/no-such-page", 404],
  [`/student-management/students/${randomUUID()}`, 404],
  [`/student-management/students/${randomUUID()}/edit/personal`, 404],
  [`/fee-management/ledger/${randomUUID()}`, 404],
  [`/fee-management/payments/${randomUUID()}`, 404],
  [`/staff-hr-management/${randomUUID()}`, 404],
  [`/admission-management/applications/${randomUUID()}`, 404],
  [`/library-management/books/${randomUUID()}`, 404],
  ["/student-management/students/not-an-id", 404],
  [`/examination-results/marks/${randomUUID()}/${randomUUID()}`, 404],
  [`/transport-management/routes/${randomUUID()}`, 404],
  ["/student-management/leaving/alumni", 200],
  ["/staff-hr-management/exit", 200],
  ["/student-management/leaving/not-an-id", 404],
  ...(own ? [[`/student-management/students/${own}`, 200], [`/fee-management/ledger/${own}`, 200]] : []),
  ...(other ? [[`/student-management/students/${other}`, 404], [`/fee-management/collect/${other}`, 404]] : []),
];

const page = await newPage();
await signIn(page, login, process.env.QA_PASSWORD);
let bad = 0;
for (const [url, want] of checks) {
  // A full page load in the browser, as a person, a monitor or a crawler makes it.
  const r = await page.goto(`${BASE}${url}`);
  const moved = new URL(page.url()).pathname !== url.split("?")[0];
  const notHere = NOT_HERE.test(await page.locator("h1, h2").allInnerTexts().then((t) => t.join(" | ")));
  const ok = !moved && r?.status() === want && (want !== 404 || notHere) && (want !== 200 || !notHere);
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"} ${r?.status()} (want ${want}${want === 404 ? ', "This page is not here"' : ""}) ${notHere ? "shows not-here " : ""}${moved ? `moved to ${page.url()} ` : ""}${url}`);
}
await close();
console.log(bad ? `${bad} FAILED` : "ALL PASSED");
process.exit(bad ? 1 : 0);
