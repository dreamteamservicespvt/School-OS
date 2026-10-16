// Refund: ask (accountant) → Approvals (principal) → Mark refunded (accountant) → Day Book OUT. Twice-click safe.
import { as, visit, shot, sql, SCHOOL_A, result } from "./m.mjs";
import { close, launch } from "../lib.mjs";
import { money, STU, rs } from "./collect-lib.mjs";
import { findApproval, decide } from "./approve-lib.mjs";

const M = "Fee Management", P = "Concessions & Refunds";
const step = process.argv[2] ?? "ask";
const refunds = () => sql(`select id, amount_paise, status, mode from refund where student_id='${STU.kavya}' order by created_at`);

if (step === "ask") {
  const page = await as("cems.accountant");
  const big = money(STU.kavya).pays.find((p) => p[2] === "CARD");
  async function ask(amount, reason) {
    await visit(page, `/fee-management/concessions?do=refund&student=${STU.kavya}`);
    const d = page.getByRole("dialog").last();
    await d.waitFor();
    await d.locator("select[name=paymentId]").selectOption(big[0]);
    await d.locator("input[name=amount]").fill(amount);
    await d.locator("select[name=mode]").selectOption("CASH");
    await d.locator("textarea[name=reason]").fill(reason);
    await d.getByRole("button", { name: /refund|Send|Ask|Save/i }).last().click();
    await page.waitForTimeout(3000);
    return (await d.isVisible().catch(() => false)) ? (await d.innerText()).replace(/\s+/g, " ").slice(-300) : "closed";
  }
  const n = refunds().length;
  const t1 = await ask("40000", "Demo QA: more than paid");
  result({ module: M, page: P, action: "Refund more than the payment (₹40,000 of ₹31,600)", role: "accountant", expected: "Refused: 'Maximum refund ₹31,600'", actual: t1.slice(-160), status: refunds().length === n && /Maximum|more than/i.test(t1) ? "PASS" : "FAIL" });
  const t2 = await ask("1000", "Demo QA: parent asked for the extra ₹1,000 back");
  const r = refunds();
  result({ module: M, page: P, action: "Ask to refund Kavya's ₹1,000 advance in cash", role: "accountant", expected: "Refund waiting in Approvals; no money moved yet", actual: `${t2.slice(0, 60)} ${JSON.stringify(r)}`, status: r.at(-1)?.[2] === "WAITING" ? "PASS" : "FAIL" });
  await close();
}
if (step === "approve") {
  const page = await as("cems.principal");
  const a = findApproval("Refund ₹1,000 to Kavya Reddy%");
  const st = await decide(page, a[0], "approve");
  result({ module: M, page: "Approvals", action: "Principal approves Kavya's ₹1,000 refund", role: "principal", expected: "Refund Approved, still no Day Book entry", actual: `approval=${st} refunds=${JSON.stringify(refunds())}`, status: st === "APPROVED" && refunds().at(-1)?.[2] === "APPROVED" ? "PASS" : "FAIL" });
  await close();
}
if (step === "mark") {
  const page = await as("cems.accountant");
  const id = refunds().at(-1)[0];
  const day0 = money(STU.kavya).day.length;
  // Two tabs press "Mark refunded" at the same moment.
  const b = await launch();
  const ctx2 = await b.newContext({ storageState: `${process.env.QA_OUT}/state/cems.accountant.json` });
  const p2 = await ctx2.newPage();
  for (const pg of [page, p2]) { await visit(pg, `/fee-management/concessions?tab=refunds&mark=${id}`); await pg.getByRole("dialog").last().waitFor(); }
  await Promise.all([page, p2].map((pg) => pg.getByRole("dialog").last().getByRole("button", { name: "Mark refunded" }).click()));
  await page.waitForTimeout(5000);
  const m = money(STU.kavya);
  const outs = m.day.filter((d) => d[3] === "refund");
  await shot(page, "refund-marked");
  result({ module: M, page: P, action: "Mark Kavya's refund paid from two tabs at the same moment", role: "accountant", expected: "Refunded once: one Day Book OUT ₹1,000 (Fee refund)", actual: `refund=${JSON.stringify(refunds().at(-1))} dayBook refund rows=${JSON.stringify(outs)} (day rows ${day0}->${m.day.length})`, status: refunds().at(-1)?.[2] === "REFUNDED" && outs.length === 1 && outs[0][1] === "100000" ? "PASS" : "FAIL" });
  await ctx2.close();
  await close();
}
