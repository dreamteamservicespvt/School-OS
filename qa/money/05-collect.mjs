// Collect Fee: validation, then Aarav (full, backdated to June) and Ananya (partial).
import { as, shot, result } from "./m.mjs";
import { close } from "../lib.mjs";
import { collect, money, STU, rs } from "./collect-lib.mjs";

const M = "Fee Management", P = "Collect Fee", R = "accountant";
const page = await as("cems.accountant");
const step = process.argv[2] ?? "all";

if (step === "all" || step === "validate") {
  const before = money(STU.aarav).pays.length;
  const cases = [
    ["Amount 0", { amount: "0" }],
    ["Negative amount", { amount: "-500" }],
    ["Letters as amount", { amount: "abc" }],
    ["Amount with 3 decimals", { amount: "100.555" }],
    ["UPI without a UTR", { amount: "1000", mode: "UPI", ref: "" }],
    ["Bank transfer without a reference", { amount: "1000", mode: "Bank transfer", ref: "" }],
    ["Cheque with 4-digit number", { amount: "1000", mode: "Cheque", cheque: { no: "1234", bank: "SBI Demo", date: "2026-10-16" } }],
    ["Payment date in the future", { amount: "1000", mode: "Cash", paidAt: "2026-12-01T10:00" }],
    ["Reference longer than 60 characters", { amount: "1000", mode: "UPI", ref: "U".repeat(80) }],
  ];
  for (const [what, o] of cases) {
    const r = await collect(page, STU.aarav, o);
    const after = money(STU.aarav).pays.length;
    const plain = !/[0-9a-f]{8}-|Error:|undefined|null|prisma|invalid input/i.test(r.text);
    result({ module: M, page: P, action: `Collect: ${what}`, role: R, expected: "Refused in plain words; no payment saved", actual: `${r.ok ? "ACCEPTED" : "refused"}: ${r.text.slice(0, 160)}; payments ${before}->${after}`, status: !r.ok && after === before && plain ? "PASS" : "FAIL" });
    if (r.ok) await shot(page, `collect-accepted-${what.replace(/\W+/g, "-")}`);
  }
}

if (step === "all" || step === "aarav") {
  const r = await collect(page, STU.aarav, { amount: "30000", mode: "Bank transfer", ref: "DEMOUTR0605AARAV", paidAt: "2026-06-05T10:30", note: "Demo QA: full year paid in June" });
  const m = money(STU.aarav);
  await shot(page, "aarav-receipt");
  result({ module: M, page: P, action: "Aarav Kumar pays the full year ₹30,000 by bank transfer, dated 05-06-2026", role: R, expected: "1 posted payment, 1 receipt, Day Book IN ₹30,000 on 05-06-2026, balance ₹0, parent message", actual: `${r.text.slice(0, 160)} | pays=${JSON.stringify(m.pays)} day=${JSON.stringify(m.day)} balance=${rs(m.balancePaise)} msgs=${m.msgs}`, status: r.ok && m.pays.length === 1 && m.receipts === 1 && m.dayNet === 3000000 && m.balancePaise === 0 ? "PASS" : "FAIL" });
}

if (step === "all" || step === "ananya") {
  // Partial: ₹10,000 cash in June (Term 1 tuition is ₹13,250 and is ticked first? oldest first).
  const r = await collect(page, STU.ananya, { amount: "10000", mode: "Cash", paidAt: "2026-06-08T11:00" });
  const m = money(STU.ananya);
  await shot(page, "ananya-partial-receipt");
  result({ module: M, page: P, action: "Ananya Reddy pays part (₹10,000 cash, 08-06-2026)", role: R, expected: "Partial payment posted, receipt, Day Book IN ₹10,000, balance ₹20,000", actual: `${r.text.slice(0, 160)} | pays=${JSON.stringify(m.pays)} balance=${rs(m.balancePaise)} msgs=${m.msgs}`, status: r.ok && m.pays.length === 1 && m.dayNet === 1000000 && m.balancePaise === 2000000 ? "PASS" : "FAIL" });
}
await close();
