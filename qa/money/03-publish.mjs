// Mid-year publish: accountant sends each class's draft to the Principal; the
// Principal approves in Approvals; the accountant gives the fees to the class.
import { as, visit, mainText, shot, sql, SCHOOL_A, result } from "./m.mjs";
import { close } from "../lib.mjs";

const M = "Fee Management", P = "Fee Structure";
const step = process.argv[2] ?? "send";
const classes = sql(`select id, name from school_class where school_id='${SCHOOL_A}' and archived_at is null order by sort_order`);
const status = (cls) => sql(`select status, version from fee_structure where school_id='${SCHOOL_A}' and class_id='${cls}' and archived_at is null order by version desc`).map((r) => r.join(":")).join(",");

if (step === "send") {
  const page = await as("cems.accountant");
  for (const [cls, name] of classes) {
    if (!/DRAFT/.test(status(cls))) continue;
    const waiting = sql(`select count(*) from approval where school_id='${SCHOOL_A}' and record_id in (select id::text from fee_structure where class_id='${cls}') and status='WAITING'`)[0][0];
    if (waiting !== "0") continue;
    await visit(page, `/fee-management/structure?cls=${cls}&do=publish`);
    const d = page.getByRole("dialog").last();
    await d.waitFor();
    if (name === "Grade 5") {
      await d.getByRole("button", { name: /Send for approval|Publish/ }).click();
      await page.waitForTimeout(2000);
      const t = await d.innerText().catch(() => "");
      result({ module: M, page: P, action: "Send for approval without ticking the confirm box / reason", role: "accountant", expected: "Refused with plain words", actual: (t.match(/(Tick|Give|reason|Enter)[^\n]{0,100}/i) ?? ["dialog: " + t.slice(0, 80)])[0], status: /Tick|reason|Give|Enter|required/i.test(t) ? "PASS" : "FAIL" });
    }
    const reason = d.getByLabel(/Why the fees change/);
    if (await reason.count()) await reason.fill("Demo QA: first fee structure for 2026-27 entered mid-year.");
    await d.getByRole("checkbox", { name: /checked the amounts/ }).check().catch(async () => { await d.locator("input[name=confirm]").check(); });
    await d.getByRole("button", { name: /Send for approval|Publish/ }).click();
    await page.waitForTimeout(2500);
    const after = sql(`select count(*) from approval where school_id='${SCHOOL_A}' and record_id in (select id::text from fee_structure where class_id='${cls}') and status='WAITING'`)[0][0];
    result({ module: M, page: P, action: `Send ${name} draft to Principal (mid-year)`, role: "accountant", expected: "One approval request waiting", actual: `waiting=${after}; ${status(cls)}`, status: after === "1" ? "PASS" : "FAIL" });
  }
  await close();
}

if (step === "approve") {
  const page = await as("cems.principal");
  await visit(page, "/approvals");
  console.log((await mainText(page, 2500)));
  await shot(page, "approvals-principal");
  for (let i = 0; i < 20; i++) {
    const btn = page.getByRole("button", { name: "Approve", exact: true }).first();
    if (!(await btn.count())) break;
    const row = await btn.locator("xpath=ancestor::li[1]").innerText().catch(() => "");
    if (!/fee|Fee|version/i.test(row)) { console.log("skip non-fee", row.slice(0, 80)); break; }
    await btn.click();
    const dlg = page.getByRole("dialog");
    if (await dlg.count()) { const c = dlg.getByRole("button", { name: /Approve/ }).last(); if (await c.count()) await c.click(); }
    await page.waitForTimeout(3000);
  }
  for (const [cls, name] of classes) result({ module: M, page: "Approvals", action: `Principal approves ${name} fee structure`, role: "principal", expected: "Version published", actual: status(cls), status: /PUBLISHED/.test(status(cls)) ? "PASS" : "FAIL" });
  await close();
}

if (step === "assign") {
  const page = await as("cems.accountant");
  for (const [cls, name] of classes) {
    const before = sql(`select count(distinct d.student_id) from student_fee_due d join enrolment e on e.student_id=d.student_id where d.school_id='${SCHOOL_A}' and e.class_id='${cls}'`)[0][0];
    await visit(page, `/fee-management/structure?cls=${cls}`);
    const b = page.getByRole("button", { name: /Give fees to/ });
    if (!(await b.count())) { console.log(name, "no assign button", before); continue; }
    await b.first().click();
    await page.waitForTimeout(4000);
    const after = sql(`select count(distinct d.student_id) from student_fee_due d join enrolment e on e.student_id=d.student_id where d.school_id='${SCHOOL_A}' and e.class_id='${cls}'`)[0][0];
    result({ module: M, page: P, action: `Give fees to ${name} students`, role: "accountant", expected: "Every student of the class has dues", actual: `students with dues ${before} -> ${after}`, status: Number(after) > Number(before) ? "PASS" : "FAIL" });
  }
  await close();
}
