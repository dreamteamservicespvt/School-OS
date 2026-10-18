// Old dues for one student from before School OS (workflow 15, rule 36). They
// become a row on the student's fees, shown as "Brought in". Nothing reaches
// the Day Book or today's collection.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate, formatRupees } from "../format";
import { studentYear } from "../academic/years";
import { financialYearOf } from "../finance/years";
import { MoneyProblem } from "./problem";
import { ensureFeeDefaults } from "./settings";

export async function addOldDues(tx: Tx, ctx: SchoolContext, input: { studentId: string; feeHeadId: string | null; amountPaise: bigint; dueDate: Date; note: string | null }) {
  await ensureFeeDefaults(tx, ctx);
  if (input.amountPaise <= BigInt(0)) throw new MoneyProblem("Amount must be more than ₹0.", "amount");
  const student = await tx.student.findFirst({ where: { id: input.studentId, archivedAt: null }, select: { id: true, fullName: true } });
  if (!student) throw new MoneyProblem("This student was not found.");
  // The row belongs to the current year of the student's own campus.
  const year = await studentYear(tx, ctx, student.id);
  if (!year) throw new MoneyProblem("Set up the academic year in Academic Management first.");
  const head = input.feeHeadId
    ? await tx.feeHead.findFirst({ where: { id: input.feeHeadId, archivedAt: null } })
    : await tx.feeHead.findFirst({ where: { archivedAt: null, OR: [{ systemKey: "old-dues" }, { name: { equals: "Old dues", mode: "insensitive" } }] } });
  if (!head) throw new MoneyProblem("Choose a fee head.", "feeHeadId");
  const fy = await financialYearOf(tx, ctx, input.dueDate);
  const ob = await tx.openingBalance.create({
    data: { schoolId: ctx.schoolId, kind: "STUDENT_DUES", financialYearId: fy.id, date: input.dueDate, studentId: student.id, amountPaise: input.amountPaise, note: input.note, sourceFile: "entered", broughtInById: ctx.userId },
  });
  const isOld = head.name.toLowerCase() === "old dues";
  const due = await tx.studentFeeDue.create({
    data: {
      schoolId: ctx.schoolId, studentId: student.id, academicYearId: year.id, feeHeadId: head.id, kind: "OLD_DUES",
      label: isOld ? "Old dues" : `Old dues: ${head.name}`, dueDate: input.dueDate, amountPaise: input.amountPaise, balancePaise: input.amountPaise,
      broughtIn: true, openingBalanceId: ob.id, note: input.note, createdById: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, {
    action: "brought-in", recordType: "Opening Balance", recordId: ob.id,
    after: { student: student.fullName, head: head.name, amount: formatRupees(input.amountPaise), due: formatDate(input.dueDate), note: input.note },
  });
  return { due, student };
}
