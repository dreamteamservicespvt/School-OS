// Saanvi Sharma: a concession above the counter limit goes to the Principal, who approves it.
import { as, visit, shot, sql, SCHOOL_A, result, mainText } from "./m.mjs";
import { close } from "../lib.mjs";
import { STU, money, rs } from "./collect-lib.mjs";

const M = "Fee Management", P = "Concessions & Refunds";
const step = process.argv[2] ?? "ask";
const cons = () => sql(`select type, status, amount_paise, percent_bp from concession where student_id='${STU.saanvi}' order by created_at`);

async function give(page, unit, value, reason) {
  await visit(page, `/fee-management/concessions?do=new&student=${STU.saanvi}`);
  const d = page.getByRole("dialog").last();
  await d.waitFor();
  await d.locator("select[name=type]").selectOption("DISCOUNT");
  await d.locator("select[name=period]").selectOption("whole");
  if (unit === "percent") await d.getByRole("radio", { name: "%" }).click().catch(async () => d.getByText("%", { exact: true }).click());
  await d.locator("input[name=value]").fill(value);
  await d.locator("textarea[name=reason]").fill(reason);
  await d.getByRole("button", { name: "Apply concession" }).click();
  await page.waitForTimeout(3000);
  const open = await d.isVisible().catch(() => false);
  return { open, text: open ? (await d.innerText()).replace(/\s+/g, " ").match(/(Enter|cannot|more than|Percent|Amount|must|Give|Choose)[^.]{0,100}/g)?.join(" | ") ?? "" : "" };
}

if (step === "ask") {
  const page = await as("cems.accountant");
  for (const [u, v, why] of [["percent", "150", "150 percent"], ["amount", "-100", "negative amount"], ["amount", "999999", "more than the fees"]]) {
    const n = cons().length;
    const r = await give(page, u, v, "Demo QA validation check");
    result({ module: M, page: P, action: `New concession with ${why}`, role: "accountant", expected: "Refused in plain words", actual: r.open ? `refused: ${r.text}` : `saved: ${JSON.stringify(cons())}`, status: r.open && cons().length === n ? "PASS" : "FAIL" });
  }
  const r = await give(page, "amount", "5000", "Demo QA: merit concession for Saanvi, letter from parent on file.");
  const c = cons();
  result({ module: M, page: P, action: "Concession ₹5,000 for Saanvi Sharma (above the ₹1,000 limit)", role: "accountant", expected: "Saved as waiting for the Principal; dues not changed yet", actual: `${JSON.stringify(c)} balance=${rs(money(STU.saanvi).balancePaise)}`, status: c.at(-1)?.[1] === "WAITING" && money(STU.saanvi).balancePaise === 3000000 ? "PASS" : "FAIL" });
  await close();
}
if (step === "approve") {
  const { findApproval, decide } = await import("./approve-lib.mjs");
  const page = await as("cems.principal");
  const big = findApproval("Discount of ₹26,500 for Saanvi Sharma");
  if (big) {
    const st = await decide(page, big[0], "reject", "Demo QA: too large, typed by mistake");
    const c = cons();
    result({ module: M, page: "Approvals", action: "Principal rejects the ₹26,500 concession (typed ₹9,99,999)", role: "principal", expected: "Rejected; dues unchanged", actual: `approval=${st} concessions=${JSON.stringify(c)} balance=${rs(money(STU.saanvi).balancePaise)}`, status: st === "REJECTED" && money(STU.saanvi).balancePaise === 3000000 ? "PASS" : "FAIL" });
  }
  const small = findApproval("Discount of ₹5,000 for Saanvi Sharma");
  const st = await decide(page, small[0], "approve");
  const c = cons();
  const m = money(STU.saanvi);
  result({ module: M, page: "Approvals", action: "Principal approves Saanvi's ₹5,000 concession", role: "principal", expected: "Applied: balance ₹25,000; no Day Book entry (no money moved)", actual: `approval=${st} ${JSON.stringify(c)} balance=${rs(m.balancePaise)} dayBook=${JSON.stringify(m.day)}`, status: st === "APPROVED" && m.balancePaise === 2500000 && m.day.length === 0 ? "PASS" : "FAIL" });
  await close();
}
