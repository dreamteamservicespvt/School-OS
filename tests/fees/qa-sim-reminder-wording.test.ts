// QA (Chaitanya EM School audit), SIM-08: the fee reminder preview said "a
// fee of ₹30,600 ... is due on 10-06-2026" while Defaulters showed ₹30,000
// overdue (oldest due 10-06-2026): the amount added a late fee due 16-10 (not
// overdue yet) but the date was the oldest. A reminder now names the same
// rows in its amount and its date: what is overdue (as on Defaulters) with
// the oldest overdue date, or, when nothing is overdue yet, the next due date.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import type { Current } from "@/lib/current";
import { feeViewer } from "@/lib/fees/access";
import { defaulters } from "@/lib/fees/defaulters";
import { previewReminders, reminderRows } from "@/lib/fees/reminders";
import { formatDate, formatRupees } from "@/lib/format";
import { dues, makeFeeSchool, R, type FeeSchool } from "./fixture";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const TODAY = d("2026-10-16");
let f: FeeSchool;

beforeAll(async () => {
  f = await makeFeeSchool();
  // Sita owes the April, July and October quarters (overdue) and a late fee added today, due today.
  const rows = await dues(f.ctx, f.sita.id);
  await withSchool(f.ctx, (tx) => tx.studentFeeDue.create({
    data: { schoolId: f.school.id, studentId: f.sita.id, academicYearId: f.year.id, feeHeadId: f.tuition.id, kind: "LATE_FEE", label: "Late fee", dueDate: TODAY, amountPaise: R(600), balancePaise: R(600), parentDueId: rows[0].id },
  }));
}, 120_000);

describe("Fee reminder wording", () => {
  it("SIM-08: the preview's amount and date are the Defaulters row's overdue amount and oldest date", async () => {
    // QA (Chaitanya EM School audit), SIM-08: preview ₹30,600 "due on 10-06-2026" vs Defaulters ₹30,000 overdue, oldest 10-06-2026.
    const view = await accessIn(f.accountant.id, f.school.id);
    const current = { ...view!, user: { id: f.accountant.id } } as unknown as Current;
    const { row, preview } = await withSchool(f.ctx, async (tx) => {
      const list = await defaulters(tx, f.ctx, await feeViewer(tx, f.ctx, current), TODAY);
      const preview = await previewReminders(tx, f.ctx, { studentIds: [f.sita.id], channel: "whatsapp", templateId: null, text: "Dear parent, {due_amount} is overdue since {due_date}. Please pay at {link}.", includeLink: false, today: TODAY });
      return { row: list.rows.find((r) => r.studentId === f.sita.id)!, preview };
    });
    expect(row.overduePaise).toBe(R(18000));
    expect(preview.sample).toContain(`${formatRupees(row.overduePaise)} is overdue since ${formatDate(row.oldestDue)}`);
    expect(preview.sample).not.toContain(formatRupees(R(18600)));
  });

  it("with nothing overdue yet, a reminder is about the next due date's rows only", () => {
    const rows = [
      { id: "jan", dueDate: d("2027-01-10"), balancePaise: R(6000) },
      { id: "oct", dueDate: d("2026-10-10"), balancePaise: R(6000) },
      { id: "oct-bus", dueDate: d("2026-10-10"), balancePaise: R(1500) },
    ];
    expect(reminderRows(rows, d("2026-10-07"))).toMatchObject({ due: R(7500), dueDate: d("2026-10-10") });
    // Once October has passed, only the overdue October rows; January is not added.
    expect(reminderRows(rows, d("2026-10-16"))).toMatchObject({ due: R(7500), dueDate: d("2026-10-10") });
    expect(reminderRows([{ id: "paid", dueDate: d("2026-10-10"), balancePaise: R(0) }], d("2026-10-16"))).toBeNull();
  });
});
