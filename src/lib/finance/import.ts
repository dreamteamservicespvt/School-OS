// Switching to School OS (workflow 15, D7): past expenses of the financial
// year brought in with the shared importer (P10), so expense reports cover
// the whole year. They are read-only, marked Brought in, and never post to
// the Day Book or the cash and bank books, because the opening balances
// already include them. Undo takes the whole import back.
import "server-only";

import { defineImport } from "../importer";
import { formatNumber, nextNumber } from "../sequences";
import { parseDateText } from "../staff/import";
import { parseRupees } from "../fees/act";
import { MoneyProblem } from "../fees/problem";
import { ensureFinanceDefaults } from "./settings";
import { financialYearOf } from "./years";

type PastExpense = { date: Date; accountHeadId: string; vendorName: string | null; amountPaise: bigint; billNo: string | null; note: string | null; costCentreId: string | null };

defineImport<PastExpense>({
  key: "finance-past-expenses",
  label: "Past expenses (brought in)",
  columns: [
    { key: "date", label: "Date", required: true, example: "15-06-2026", help: "DD-MM-YYYY" },
    { key: "head", label: "Expense head", required: true, example: "Electricity", help: "A head in Finance Settings, by name or code", aliases: ["category", "account", "expense head"] },
    { key: "amount", label: "Amount", required: true, example: "8450" },
    { key: "vendor", label: "Vendor", example: "TS Power Distribution", aliases: ["paid to", "party"] },
    { key: "billNo", label: "Bill number", example: "EB/06/2231", aliases: ["bill no", "invoice no"] },
    { key: "department", label: "Department", example: "Admin", help: "A cost centre, when cost centres are on", aliases: ["cost centre"] },
    { key: "note", label: "Note", example: "June bill" },
  ],
  async check(tx, ctx, row) {
    await ensureFinanceDefaults(tx, ctx);
    const problems: string[] = [];
    const date = parseDateText(row.date ?? "");
    if (!date) problems.push("Date is not a date like 15-06-2026.");
    else if (date > new Date()) problems.push("Date is in the future. Only past expenses can be brought in.");
    const name = (row.head ?? "").trim();
    const head = name ? await tx.accountHead.findFirst({ where: { kind: "EXPENSE", archivedAt: null, OR: [{ name: { equals: name, mode: "insensitive" } }, { code: name }] } }) : null;
    if (!head) problems.push(name ? `Expense head "${name}" is not in Finance Settings. Add it there first.` : "Expense head is needed.");
    let amount: bigint | null = null;
    try {
      amount = parseRupees(row.amount ?? "", "Amount");
      if (amount === null) problems.push("Amount is needed.");
      else if (amount <= BigInt(0)) problems.push("Amount must be more than ₹0.");
    } catch (e) {
      problems.push(e instanceof MoneyProblem ? e.message : "Amount is not an amount.");
    }
    const dept = (row.department ?? "").trim();
    const centre = dept ? await tx.costCentre.findFirst({ where: { archivedAt: null, name: { equals: dept, mode: "insensitive" } } }) : null;
    if (dept && !centre) problems.push(`Department "${dept}" is not a cost centre in Finance Settings.`);
    if ((row.vendor ?? "").length > 120) problems.push("Vendor can be at most 120 characters.");
    if ((row.note ?? "").length > 300) problems.push("Note can be at most 300 characters.");
    if (problems.length || !date || !head || amount === null || amount <= BigInt(0)) return { ok: false, problems };
    const fy = await financialYearOf(tx, ctx, date);
    if (fy.status === "CLOSED") return { ok: false, problems: [`This date is in ${fy.name}, which is closed.`] };
    return { ok: true, value: { date, accountHeadId: head.id, vendorName: row.vendor?.trim() || null, amountPaise: amount, billNo: row.billNo?.trim() || null, note: row.note?.trim() || null, costCentreId: centre?.id ?? null } };
  },
  async save(tx, ctx, v) {
    const fy = await financialYearOf(tx, ctx, v.date);
    let vendorId: string | null = null;
    if (v.vendorName) {
      const found = await tx.vendor.findFirst({ where: { name: { equals: v.vendorName, mode: "insensitive" } } });
      vendorId = found?.id ?? (await tx.vendor.create({ data: { schoolId: ctx.schoolId, name: v.vendorName, createdById: ctx.userId } })).id;
    }
    const n = await nextNumber(tx, ctx, `expense:${fy.name}`);
    const e = await tx.expense.create({
      data: {
        schoolId: ctx.schoolId, financialYearId: fy.id, number: formatNumber(`EXP/${fy.name}/`, n, 5), date: v.date, accountHeadId: v.accountHeadId,
        vendorId, costCentreId: v.costCentreId, amountPaise: v.amountPaise, paidPaise: v.amountPaise, billNo: v.billNo, isVendorBill: Boolean(v.billNo),
        note: v.note ? `${v.note} (brought in)` : "Brought in from old software", status: "PAID", broughtIn: true, requestedById: ctx.userId,
      },
    });
    return { id: e.id, created: true };
  },
  async undo(tx, ctx, ids) {
    await tx.expense.updateMany({ where: { id: { in: ids }, broughtIn: true }, data: { status: "CANCELLED", cancelReason: "Import undone", cancelledAt: new Date(), cancelledById: ctx.userId } });
  },
});
