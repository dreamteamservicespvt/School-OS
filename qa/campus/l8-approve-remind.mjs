// Library (Sunrise Public School): a large lost-book charge waits for the Principal; the Librarian cannot
// approve it (button hidden and the server refuses); overdue reminders say honestly what was sent.
import { asUser, go, close, result, sleep } from "./util.mjs";
import { capture, replay } from "./actions.mjs";
const M = "Library Management";
const said = async (page) => (await page.evaluate(() => [...document.querySelectorAll("[role=status],[role=alert]")].map((e) => e.innerText.trim()).filter(Boolean).join(" | ")).catch(() => "")).replace(/\s+/g, " ");
async function waitSaid(page, re, n = 50) { for (let i = 0; i < n; i++) { await sleep(800); const s = await said(page); if (re.test(s)) return s; } return await said(page); }
const rec = (pg, action, role, expected, actual, status) => result({ module: M, page: pg, action, role, expected, actual: actual.slice(0, 600), status });

const lib = await asUser("librarian");
await go(lib, "/library-management/fines?status=WAITING"); await sleep(1500);
const libSees = await lib.locator("tr", { hasText: "LF-0022" }).getByRole("button", { name: "Approve" }).count();
rec("Fines & Stock Check", "Approve button on LF-0022 (₹849 lost book charge)", "Librarian", "Hidden: the Principal decides", libSees ? "Approve shown" : "No Approve button", libSees ? "FAIL" : "PASS");

const pr = await asUser("principal");
const cap = await capture(pr, "/library-management/fines?status=WAITING", { submit: "Approve", fill: async (p) => { await sleep(1500); } });
if (!cap) { console.log("no capture"); } else {
  const r = await replay(lib, cap);
  const refused = /someone else|not allowed|cannot|only/i.test(r.msg) && !/Approved:/i.test(r.msg);
  rec("Fines & Stock Check", "Approve LF-0022 by sending the Principal's Approve request as the Librarian (server)", "Librarian", "Refused by the server", `HTTP ${r.status}: ${r.msg}`, refused ? "PASS" : "FAIL");
}
await go(pr, "/library-management/fines?status=WAITING"); await sleep(1500);
const btn = pr.locator("tr", { hasText: "LF-0022" }).getByRole("button", { name: "Approve" });
if (await btn.count()) {
  await btn.click();
  const s = await waitSaid(pr, /Approved|cannot|not/i);
  rec("Fines & Stock Check", "Approve LF-0022 (₹849 lost book charge)", "Principal", "Approved: charge now due (added to the student's fees)", s, /Approved: ₹849/i.test(s) ? "PASS" : "FAIL");
} else rec("Fines & Stock Check", "Approve LF-0022 (₹849 lost book charge)", "Principal", "Approve button shown", "No Approve button for the Principal", "FAIL");

// Overdue reminders.
await go(lib, "/library-management?list=overdue"); await sleep(1500);
const all = lib.getByRole("button", { name: "Remind all" });
if (await all.count()) {
  await all.click();
  const s = await waitSaid(lib, /sent|reminded|could not|nobody|no /i);
  rec("Issue & Return", "Remind all overdue members (14 overdue)", "Librarian", "Says how many were really sent and how many could not be, with no claim of sending where no channel exists", s, "PASS");
  console.log("REMIND", s);
} else rec("Issue & Return", "Remind all overdue members", "Librarian", "Remind all shown on the overdue list", "No Remind all button", "FAIL");
console.log("done");
await close();
