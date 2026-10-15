// Mess head counts or mess expenses for the dates on screen.
import type { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { formatDate, formatRupees } from "@/lib/format";
import { dateWhere } from "@/lib/periods";
import { hostelRoute, rangeWords } from "../../_lib/route";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const x = await hostelRoute(req, "mess");
  if (x instanceof Response) return x;
  const meta = (title: string, filters: string) => ({ title, schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters });

  if (x.get("view") === "count") {
    const range = await x.range("last7");
    const rows = await withSchool(x.current.ctx, async (tx) => {
      const list = await tx.mealHeadCount.findMany({ where: range ? { date: dateWhere(range) } : {}, orderBy: [{ date: "desc" }, { meal: "asc" }], take: 5000 });
      await logExport(tx, x.current.ctx, { title: "Mess head counts", format: x.format, filters: rangeWords(range), rows: list.length });
      return list;
    });
    type H = (typeof rows)[number];
    const columns: ExportColumn<H>[] = [
      { label: "Date", value: (h) => formatDate(h.date, "UTC") }, { label: "Meal", value: (h) => h.meal }, { label: "Expected", value: (h) => h.expected },
      { label: "Actual", value: (h) => h.actual }, { label: "Difference", value: (h) => h.actual - h.expected }, { label: "Note", value: (h) => h.note ?? "" },
    ];
    return exportResponse(await buildExport(x.format, columns, rows, meta("Mess head counts", rangeWords(range))));
  }

  const q = x.get("q").trim();
  const range = await x.range("thismonth");
  const r = await withSchool(x.current.ctx, async (tx) => {
    const where: Prisma.MessExpenseWhereInput = { archivedAt: null, ...(range ? { date: dateWhere(range) } : {}), ...(q ? { OR: [{ item: { contains: q, mode: "insensitive" } }, { note: { contains: q, mode: "insensitive" } }] } : {}) };
    const list = await tx.messExpense.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 5000 });
    const [expenses, vendors] = await Promise.all([
      tx.expense.findMany({ where: { id: { in: list.map((m) => m.expenseId).filter((v): v is string => Boolean(v)) } }, select: { id: true, number: true, status: true } }),
      tx.vendor.findMany({ where: { id: { in: list.map((m) => m.vendorId).filter((v): v is string => Boolean(v)) } }, select: { id: true, name: true } }),
    ]);
    const filters = [rangeWords(range), q ? `Search: ${q}` : ""].filter(Boolean).join(" · ");
    await logExport(tx, x.current.ctx, { title: "Mess expenses", format: x.format, filters, rows: list.length });
    return { list, expenses: new Map(expenses.map((e) => [e.id, e])), vendors: new Map(vendors.map((v) => [v.id, v.name])), filters };
  });
  type M = (typeof r.list)[number];
  const STATUS: Record<string, string> = { PAID: "Paid", APPROVED: "To pay", WAITING: "Waiting approval", DRAFT: "Draft", CANCELLED: "Cancelled" };
  const columns: ExportColumn<M>[] = [
    { label: "Date", value: (m) => formatDate(m.date, "UTC") }, { label: "Item", value: (m) => m.item }, { label: "Amount", value: (m) => formatRupees(m.amountPaise) },
    { label: "Vendor", value: (m) => (m.vendorId ? r.vendors.get(m.vendorId) ?? "" : "") }, { label: "Note", value: (m) => m.note ?? "" },
    { label: "Finance expense", value: (m) => (m.expenseId ? r.expenses.get(m.expenseId)?.number ?? "" : "") },
    { label: "Status in Finance", value: (m) => (m.expenseId ? STATUS[r.expenses.get(m.expenseId)?.status ?? ""] ?? "" : "") },
  ];
  return exportResponse(await buildExport(x.format, columns, r.list, meta("Mess expenses", r.filters)));
}
