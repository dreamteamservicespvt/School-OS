// The duplicate warning at the counter, then "Collect again" when it really is a second payment.
import { as, shot, sql, SCHOOL_A, result } from "./m.mjs";
import { close } from "../lib.mjs";
import { collect, readOutcome, money } from "./collect-lib.mjs";
const page = await as("cems.accountant");
const rohan = sql(`select s.id from student s join enrolment e on e.student_id=s.id join section x on x.id=e.section_id join school_class c on c.id=e.class_id where s.school_id='${SCHOOL_A}' and s.full_name='Rohan Singh' and c.name='Grade 5' and x.name='A'`)[0][0];
const n0 = money(rohan).pays.length;
const r = await collect(page, rohan, { amount: "700", mode: "Cash" });
const r2 = await collect(page, rohan, { amount: "700", mode: "Cash" });
await shot(page, "dup-warning");
const n1 = money(rohan).pays.length;
result({ module: "Fee Management", page: "Collect Fee", action: "Collect the same ₹700 cash again within 10 minutes", role: "accountant", expected: "Warning naming who collected it and when; nothing saved until confirmed", actual: `${r2.warned ? "warned" : r2.ok ? "SAVED" : "?"}: ${r2.text.slice(0, 200)} | payments ${n0}->${n1} (first one saved: ${r.ok})`, status: r.ok && r2.warned && n1 - n0 === 1 ? "PASS" : "FAIL" });
await page.getByRole("button", { name: "Collect again" }).click();
const r3 = await readOutcome(page);
const n2 = money(rohan).pays.length;
result({ module: "Fee Management", page: "Collect Fee", action: "Confirm 'Collect again' after the duplicate warning", role: "accountant", expected: "Second payment saved with its own receipt", actual: `${r3.text.slice(0, 120)} | payments ${n1}->${n2}`, status: r3.ok && n2 - n1 === 1 ? "PASS" : "FAIL" });
await close();
