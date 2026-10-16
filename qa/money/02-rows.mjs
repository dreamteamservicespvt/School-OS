// Fee rows for every class through Fee Structure as the accountant (SYNTHETIC DEMO amounts),
// with validation checks on Grade 5 first. Then "Send for approval" (mid-year).
import { as, visit, mainText, shot, sql, SCHOOL_A, result } from "./m.mjs";
import { close } from "../lib.mjs";

const M = "Fee Management", P = "Fee Structure";
const only = process.argv[2];
const page = await as("cems.accountant");
const classes = sql(`select id, name from school_class where school_id='${SCHOOL_A}' and archived_at is null order by sort_order`);
// Annual totals (₹): Exam 2,000 + Activity 1,500 + Tuition = total.
const TOTAL = { Nursery: 20000, LKG: 20000, UKG: 20000, "Grade 1": 25000, "Grade 2": 25000, "Grade 3": 25000, "Grade 4": 25000, "Grade 5": 30000, "Grade 6": 30000, "Grade 7": 30000, "Grade 8": 35000, "Grade 9": 35000, "Grade 10": 40000 };
const URL = (cls, extra = "") => `/fee-management/structure?cls=${cls}${extra}`;

async function addRow(cls, head, total, freq, tweak) {
  await visit(page, URL(cls, "&do=row"));
  const d = page.getByRole("dialog").last();
  await d.waitFor();
  await d.getByLabel("Fee head").selectOption({ label: head });
  await d.getByLabel("Frequency").selectOption({ label: freq });
  await d.getByLabel("Amount for the year").fill(String(total));
  if (tweak) await tweak(d);
  await d.getByRole("button", { name: "Save in draft" }).click();
  await page.waitForTimeout(2500);
  const still = await d.isVisible().catch(() => false);
  return { still, msg: still ? (await d.innerText()).match(/(Installment|Enter|Every|Amount|Choose)[^\n]{0,120}/g)?.join(" | ") ?? "" : (await page.locator("[role=status], [data-sonner-toast]").allInnerTexts().catch(() => [])).join(" ") };
}
const itemCount = (clsName, head) => sql(`select count(*) from fee_structure_item i join fee_structure s on s.id=i.structure_id join school_class c on c.id=s.class_id join fee_head h on h.id=i.fee_head_id where s.school_id='${SCHOOL_A}' and c.name='${clsName}' and h.name='${head}' and i.archived_at is null and s.status in ('DRAFT')`)[0][0];

for (const [cls, name] of classes) {
  if (only && name !== only) continue;
  if (!(name in TOTAL)) continue;
  const tuition = TOTAL[name] - 3500;
  if (name === "Grade 5" && itemCount(name, "Tuition") === "0") {
    // Validation: installments that do not add up.
    let r = await addRow(cls, "Tuition", tuition, "Term", async (d) => { await d.getByLabel("Installment 1 amount").fill("1000"); });
    result({ module: M, page: P, action: "Save fee row whose installments do not add up", role: "accountant", expected: "Refused, plain message", actual: r.still ? r.msg : "saved!", status: r.still && /add up/i.test(r.msg) ? "PASS" : "FAIL" });
    r = await addRow(cls, "Tuition", "-500", "Term");
    result({ module: M, page: P, action: "Save fee row with negative amount", role: "accountant", expected: "Refused", actual: r.still ? r.msg : "saved!", status: r.still ? "PASS" : "FAIL" });
    r = await addRow(cls, "Tuition", "abc", "Term");
    result({ module: M, page: P, action: "Save fee row with letters as amount", role: "accountant", expected: "Refused", actual: r.still ? r.msg : "saved!", status: r.still ? "PASS" : "FAIL" });
    r = await addRow(cls, "Tuition", "99999999999", "Term");
    result({ module: M, page: P, action: "Save fee row with huge amount (₹99,999,999,999)", role: "accountant", expected: "Refused or capped", actual: r.still ? r.msg : "saved", status: r.still ? "PASS" : "FAIL" });
    r = await addRow(cls, "Tuition", tuition, "Term", async (d) => { await d.getByLabel("Installment 1 due date").fill(""); });
    result({ module: M, page: P, action: "Save fee row with an empty due date", role: "accountant", expected: "Refused", actual: r.still ? r.msg : "saved!", status: r.still ? "PASS" : "FAIL" });
  }
  for (const [head, amt, freq] of [["Tuition", tuition, "Term"], ["Exam", 2000, "Yearly"], ["Activity", 1500, "Yearly"]]) {
    if (itemCount(name, head) !== "0") continue;
    const r = await addRow(cls, head, amt, freq);
    const n = itemCount(name, head);
    result({ module: M, page: P, action: `Add ${head} ₹${amt} (${freq}) to ${name}`, role: "accountant", expected: "Row saved in draft", actual: `draft rows=${n}; ${r.msg.slice(0, 120)}`, status: n === "1" ? "PASS" : "FAIL" });
  }
}
await visit(page, URL(classes.find((c) => c[1] === "Grade 5")[0]));
await shot(page, "grade5-draft");
console.log((await mainText(page, 2500)));
await close();
