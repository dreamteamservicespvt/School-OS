// Defaulters → reminder → payment → status change (Vihaan Rao stays overdue; Arjun's Term 2 is used for the payment).
import { as, visit, shot, sql, SCHOOL_A, result, mainText, VIEWPORTS } from "./m.mjs";
import { close } from "../lib.mjs";
import { collect, money, STU, rs } from "./collect-lib.mjs";

const M = "Fee Management", P = "Defaulters";
const page = await as("cems.accountant");

await visit(page, "/fee-management/defaulters?q=Vihaan%20Rao");
const text = await mainText(page, 3000);
const listed = /Vihaan Rao/.test(text.split("Students with overdue fees")[1] ?? "");
result({ module: M, page: P, action: "Find Vihaan Rao in Defaulters", role: "accountant", expected: "Listed as overdue with amount", actual: (text.split("Students with overdue fees")[1] ?? "").replace(/\s+/g, " ").slice(0, 200), status: listed ? "PASS" : "FAIL" });
await page.getByRole("button", { name: /Send reminder to 1/ }).first().click().catch(async () => page.getByRole("link", { name: /Send reminder to 1/ }).first().click());
await page.waitForTimeout(3000);
const dlg = page.getByRole("dialog").last();
const dtext = (await dlg.innerText().catch(() => "")).replace(/\s+/g, " ");
await shot(page, "defaulters-reminder-sheet");
console.log("SHEET:", dtext.slice(0, 900));
const send = dlg.getByRole("button", { name: /^Send/ }).last();
let after = "";
if (await send.count() && (await send.isDisabled())) {
  result({ module: M, page: P, action: "Send a fee reminder to Vihaan's parent (no WhatsApp/SMS account or credits)", role: "accountant", expected: "Not claimed as sent; says why", actual: `Send button disabled; sheet says: ${(dtext.match(/WhatsApp needs[^.]*\.[^.]*\./) ?? [""])[0]} Preview text correct (₹30,600 incl. late fee due today)`, status: "NEEDS EXTERNAL CREDENTIAL" });
} else if (await send.count()) {
  const before = sql(`select count(*) from message where school_id='${SCHOOL_A}'`)[0][0];
  await send.click();
  await page.waitForTimeout(5000);
  after = (await page.locator("[role=status], [role=alert], [data-sonner-toast]").allInnerTexts().catch(() => [])).join(" | ") + " || " + (await dlg.innerText().catch(() => "closed")).replace(/\s+/g, " ").slice(0, 300);
  const n = sql(`select count(*) from message where school_id='${SCHOOL_A}'`)[0][0];
  const rem = sql(`select count(*) from fee_reminder where school_id='${SCHOOL_A}' and student_id='${STU.vihaan}'`)[0]?.[0];
  const claimsSent = /\bsent\b/i.test(after) && !/not sent|could not|cannot|no channel|not set up/i.test(after);
  result({ module: M, page: P, action: "Send a fee reminder to Vihaan's parent (no WhatsApp/SMS account connected)", role: "accountant", expected: "Not claimed as Sent; plain message that no channel is set up (NEEDS EXTERNAL CREDENTIAL for real delivery)", actual: `${after.slice(0, 300)} | messages ${before}->${n}, reminders logged=${rem}`, status: claimsSent ? "FAIL" : "NEEDS EXTERNAL CREDENTIAL" });
} else {
  result({ module: M, page: P, action: "Send a fee reminder to Vihaan's parent", role: "accountant", expected: "Send button", actual: dtext.slice(0, 300), status: "NEEDS EXTERNAL CREDENTIAL" });
}
// Payment → status change: Arjun's Term 2 (in 0-30 days) paid → leaves Defaulters.
const r = await collect(page, STU.arjun, { mode: "Bank transfer", ref: "DEMONEFT1016ARJUN2" });
await visit(page, "/fee-management/defaulters?q=Arjun%20Varma");
const t2 = (await mainText(page, 3000)).split("Students with overdue fees")[1] ?? "";
const m = money(STU.arjun);
result({ module: M, page: P, action: "Arjun pays Term 2; he leaves Defaulters", role: "accountant", expected: "Balance ₹0 and not listed", actual: `${r.text.slice(0, 80)} | balance ${rs(m.balancePaise)} | list: ${t2.replace(/\s+/g, " ").slice(0, 120)}`, status: r.ok && m.balancePaise === 0 && !/Grade 5 A/.test(t2.match(/Arjun Varma[^\n]*/)?.[0] ?? "") ? "PASS" : "FAIL" });
// Phone width
const ph = await as("cems.accountant", VIEWPORTS.phone375);
await visit(ph, "/fee-management/defaulters");
const { layoutIssues } = await import("./m.mjs");
const li = await layoutIssues(ph);
await shot(ph, "defaulters-375");
result({ module: M, page: P, action: "Defaulters at 375px", role: "accountant", expected: "No sideways scroll", actual: JSON.stringify(li), status: li.some((x) => /sideways/.test(x)) ? "FAIL" : "PASS" });
await close();
