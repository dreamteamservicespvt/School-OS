// Collect Fee through the real screen, and read back what it did in the database.
import { visit, sql, SCHOOL_A } from "./m.mjs";

export const STU = {
  aarav: "981866cc-45e3-4fc5-94a8-c82f9f745116",
  ananya: "f1bda690-4658-4866-b6fc-78412b605a65",
  vihaan: "c2435b36-c0e6-4703-89ba-e80d86add96e",
  saanvi: "698a2efd-1971-4a83-966e-f53a12d7d5ef",
  arjun: "f30f14ee-cd61-488d-b40e-8e466efb1e62",
  ishita: "7a3dd7c3-391a-4c38-9caf-87fc4f9a93e3",
  kavya: "f6e8b638-d80d-4084-9509-11cdd029275f",
  sai: "03c597aa-cb4d-439e-b50d-10a4848c51c8",
};

/**
 * Opens Collect Fee for a student and collects. opts: amount (string), mode
 * (Cash|UPI|Card|Cheque|Bank transfer), ref, cheque {no, bank, date}, paidAt
 * ("YYYY-MM-DDTHH:MM"), note, discount, discountReason, untick (labels to untick), noSubmit.
 */
export async function collect(page, studentId, opts = {}) {
  await visit(page, `/fee-management/collect/${studentId}`);
  await page.getByText("How is it paid?").waitFor({ timeout: 60000 });
  for (const label of opts.untick ?? []) await page.getByRole("checkbox", { name: label }).uncheck();
  for (const label of opts.tick ?? []) await page.getByRole("checkbox", { name: label }).check();
  if (opts.mode) await page.getByRole("radio", { name: opts.mode }).click();
  if (opts.amount !== undefined) await page.locator("#pay-amt").fill(String(opts.amount));
  if (opts.ref !== undefined) await page.locator("#pay-ref").fill(opts.ref);
  if (opts.cheque) {
    await page.locator("#chq-no").fill(opts.cheque.no);
    await page.locator("#chq-bank").fill(opts.cheque.bank);
    await page.locator("#chq-date").fill(opts.cheque.date);
  }
  if (opts.paidAt || opts.note || opts.discount) {
    const more = page.getByText("Discount, waiver, date or note");
    await more.click();
    if (opts.paidAt) await page.locator("#pay-when").fill(opts.paidAt);
    if (opts.note) await page.locator("#pay-note").fill(opts.note);
    if (opts.discount) { await page.locator("#pay-disc").fill(opts.discount); await page.locator("#pay-disc-why").fill(opts.discountReason ?? "Demo QA discount reason"); }
  }
  if (opts.noSubmit) return null;
  const btn = page.getByRole("button", { name: /^Collect ₹/ });
  if (opts.doubleClick) await btn.dblclick();
  else await btn.click();
  return readOutcome(page);
}

export async function readOutcome(page) {
  // Either the receipt sheet opens, or an alert shows.
  const sheet = page.getByRole("dialog").filter({ hasText: /Receipt|received|Saved|verification/ });
  const alert = page.locator("[role=alert]").filter({ hasText: /./ });
  for (let i = 0; i < 120; i++) {
    if (await sheet.count()) return { ok: true, text: (await sheet.first().innerText()).replace(/\s+/g, " ") };
    const warn = page.getByRole("button", { name: "Collect again" });
    if (await warn.count()) return { ok: false, warned: true, text: (await warn.locator("xpath=ancestor::div[2]").innerText()).replace(/\s+/g, " ") };
    if (await alert.count()) {
      const t = (await alert.allInnerTexts()).join(" | ").replace(/\s+/g, " ");
      if (t.trim()) return { ok: false, text: t };
    }
    await page.waitForTimeout(500);
  }
  return { ok: false, text: "nothing happened in 60 s" };
}

/** Money state of a student: payments, receipts, Day Book entries, balance. */
export function money(studentId) {
  const pays = sql(`select p.id, p.amount_paise, p.mode, p.status, p.advance_paise, r.number, p.payment_date from payment p left join receipt r on r.payment_id=p.id where p.student_id='${studentId}' order by p.created_at`);
  const day = sql(`select direction, amount_paise, section, source_type from day_book_entry where school_id='${SCHOOL_A}' and student_id='${studentId}' order by posted_at`);
  const bal = sql(`select coalesce(sum(balance_paise) filter (where state='OPEN'),0), count(*) filter (where state='OPEN' and balance_paise>0) from student_fee_due where student_id='${studentId}'`)[0];
  const msgs = sql(`select count(*) from message where school_id='${SCHOOL_A}' and source_type='Payment' and source_id in (select id::text from payment where student_id='${studentId}')`)[0][0];
  const dayNet = day.reduce((s, d) => s + (d[0] === "IN" ? 1 : -1) * Number(d[1]), 0);
  const posted = pays.filter((p) => p[3] === "POSTED").reduce((s, p) => s + Number(p[1]), 0);
  return { pays, day, balancePaise: Number(bal[0]), openRows: Number(bal[1]), msgs: Number(msgs), dayNet, posted, receipts: pays.filter((p) => p[5]).length };
}
export const rs = (paise) => `₹${(paise / 100).toLocaleString("en-IN")}`;
