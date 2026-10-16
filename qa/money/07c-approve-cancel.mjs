// Principal approves cancelling Ananya's June payment: reversal posts today, June stays as it was.
import { as, sql, SCHOOL_A, result } from "./m.mjs";
import { close } from "../lib.mjs";
import { money, STU, rs } from "./collect-lib.mjs";
import { findApproval, decide } from "./approve-lib.mjs";
const today = new Date().toISOString().slice(0, 10);
const page = await as("cems.principal");
const a = findApproval("Cancel ₹10,000 cash paid by Ananya Reddy%");
const m0 = money(STU.ananya);
const june0 = sql(`select count(*), sum(amount_paise) from day_book_entry where student_id='${STU.ananya}' and date='2026-06-08'`)[0];
const st = await decide(page, a[0], "approve");
const m1 = money(STU.ananya);
const june1 = sql(`select count(*), sum(amount_paise) from day_book_entry where student_id='${STU.ananya}' and date='2026-06-08'`)[0];
const rev = sql(`select date, direction, amount_paise from day_book_entry where student_id='${STU.ananya}' and section='reversal'`);
result({ module: "Fee Management", page: "Approvals", action: "Principal approves cancelling Ananya's 08-06-2026 payment", role: "principal", expected: "Payment Cancelled; reversal in today's Day Book; June's Day Book unchanged; Ananya owes ₹10,000 again (partial)", actual: `approval=${st} status=${m1.pays[0][3]} reversal=${JSON.stringify(rev)} june ${june0}->${june1} balance ${rs(m0.balancePaise)}->${rs(m1.balancePaise)}`, status: st === "APPROVED" && m1.pays[0][3] === "CANCELLED" && rev.length === 1 && rev[0][0] === today && june0.join() === june1.join() && m1.balancePaise === 1000000 ? "PASS" : "FAIL" });
await close();
