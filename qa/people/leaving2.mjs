// Student leaving, part 2: the Principal approves the fee waiver in Approvals, the office asks
// for the TC, the Principal approves it, the office issues (prints) it and marks Harini Inti as left.
import { go, close, shot } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const M = "Student Management", SID = "8259c702-6c07-40a6-a6b7-a606a696305e";
const REQ = process.argv[2];
const pr = await as("cems.principal");
const off = await as("cems.office");
const T = async (p, sel = "main") => ((await p.locator(sel).allInnerTexts().catch(() => [])).join(" ")).replace(/\s+/g, " ");

async function approve(match, what) {
  await go(pr, "/approvals");
  await pr.waitForTimeout(1200);
  const row = pr.locator("main li, main tr, main [role=row], main article").filter({ hasText: match }).first();
  const found = await row.count();
  const rowText = found ? (await row.innerText()).replace(/\s+/g, " ") : (await T(pr)).slice(0, 300);
  if (found) {
    await row.getByRole("button", { name: "Approve", exact: true }).click();
    await pr.waitForTimeout(800);
    const d = pr.locator("dialog[open]");
    if (await d.count()) { console.log("APPROVE DLG", (await d.innerText()).slice(0, 300)); await d.getByRole("button", { name: /Approve/ }).last().click(); }
    await pr.waitForTimeout(3000);
  }
  const t = await T(pr, "[role=status], [role=alert]");
  res({ module: "Approvals", page: "Approvals", action: `Principal approves ${what}`, role: "Principal", expected: "Approved; the record moves on", actual: `${rowText.slice(0, 200)} || ${t.slice(0, 120)}`, status: found ? "PASS" : "FAIL" });
  return found;
}

if (!process.env.TC_ONLY && await approve(/Waive Fees clearance for Harini Inti/, "the fee waiver for Harini Inti")) {
  await go(off, `/student-management/leaving/${REQ}`);
  await off.waitForTimeout(1000);
  const t = await T(off);
  res({ module: M, page: "Leaving & Alumni", action: "Leaving request after the waiver is approved", role: "Office Staff", expected: "Fees check Waived; Clearance passed; Issue TC offered", actual: (t.match(/Clearance passed.{0,200}/) ?? [t.slice(0, 250)])[0], status: /Clearance passed/.test(t) && (await off.getByRole("link", { name: "Issue TC" }).count()) > 0 ? "PASS" : "FAIL" });
}

// Office asks for the TC
await go(off, `/student-management/certificates/new?student=${SID}&type=TC`);
await off.waitForTimeout(1500);
console.log("CERT FORM", (await T(off)).slice(0, 600));
await off.locator("main").getByRole("button", { name: "Issue", exact: true }).click();
await off.waitForTimeout(3500);
let t = `${await T(off, "[role=status], [role=alert]")} || ${off.url().replace(/.*:\d+/, "")} || ${(await T(off)).slice(0, 300)}`;
await shot(off, "tc-requested");
res({ module: M, page: "Certificates & ID Cards", action: "Ask for Harini Inti's TC after clearance", role: "Office Staff", expected: "TC waits for approval (TC always needs approval)", actual: t.slice(0, 400), status: /approval|Requested|waiting/i.test(t.split(" || ")[0] + t.split(" || ")[1]) ? "PASS" : "FAIL" });

await approve(/Harini Inti/, "Harini Inti's TC");

// Office issues it
await go(off, `/student-management/leaving/${REQ}`);
await off.waitForTimeout(1000);
const link = off.locator("main a[href*='/certificates/']").filter({ hasText: /Transfer certificate/ }).first();
if (await link.count()) await link.click(); else await go(off, "/student-management/certificates");
await off.waitForTimeout(1500);
console.log("CERT", off.url(), (await T(off)).slice(0, 700));
const issue = off.getByRole("button", { name: /^(Issue|Print)/ }).first();
if (await issue.count()) {
  await issue.click();
  await off.waitForTimeout(1000);
  const d = off.locator("dialog[open]");
  if (await d.count()) { console.log("ISSUE DLG", (await d.innerText()).slice(0, 300)); await d.getByRole("button", { name: /Issue|Print/ }).last().click(); }
  await off.waitForTimeout(3500);
}
t = `${await T(off, "[role=status], [role=alert]")} || ${(await T(off)).slice(0, 300)}`;
await shot(off, "tc-issued");
res({ module: M, page: "Certificates & ID Cards", action: "Issue (print) the approved TC", role: "Office Staff", expected: "TC issued with a TC number", actual: t.slice(0, 400), status: /Issued/.test(t) && !/No certificates yet/.test(t) ? "PASS" : "FAIL" });

// Mark as left
if (!process.env.TC_ONLY) {
await go(off, `/student-management/leaving/${REQ}`);
await off.waitForTimeout(1000);
await off.getByRole("button", { name: "Mark as left" }).first().click();
await off.waitForTimeout(800);
await off.locator("dialog[open]").getByRole("button", { name: "Mark as left" }).click();
await off.waitForTimeout(3500);
t = `${await T(off, "[role=status], [role=alert]")} || ${(await T(off)).slice(0, 300)}`;
res({ module: M, page: "Leaving & Alumni", action: "Mark Harini Inti as left (last date today)", role: "Office Staff", expected: "Status Transferred; listed in Left; record kept", actual: t.slice(0, 300), status: /Marked as left|Left/.test(t) ? "PASS" : "FAIL" });
await go(off, `/student-management/students/${SID}`);
await off.waitForTimeout(1000);
t = await T(off);
res({ module: M, page: "Student profile", action: "Harini Inti's profile after leaving", role: "Office Staff", expected: "Shows Transferred, leaving date and reason; record and history still there", actual: t.slice(0, 300), status: /Transferred/i.test(t) ? "PASS" : "FAIL" });
}
console.log(pr.problems, off.problems);
await close();
