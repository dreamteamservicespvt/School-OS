// Fines for the status, reason, search and dates on screen; or, with
// view=stock, the stock check sessions in the dates on screen.
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { formatDate, formatRupees } from "@/lib/format";
import { momentWhere } from "@/lib/periods";
import { librarySettings } from "@/lib/library/settings";
import { issueMembers } from "@/lib/library/desk";
import { fineWhere, syncFeeFines } from "@/lib/library/fines";
import { FINE_REASON, FINE_STATUS, type FineReason, type FineStatus } from "@/lib/library/words";
import { libRoute, rangeWords } from "../../_lib/route";
import { finesWhere, readFinesFilter, FINE_TABS } from "../../_lib/fines";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const x = await libRoute(req, "fines");
  if (x instanceof Response) return x;
  const range = await x.range(null);
  if (x.get("view") === "stock") {
    const title = "Library stock checks";
    const filters = rangeWords(range);
    const rows = await withSchool(x.current.ctx, async (tx) => {
      const r = await tx.stockCheckSession.findMany({ where: range ? { startedAt: momentWhere(range, x.tz) } : {}, orderBy: { startedAt: "desc" }, take: 1000 });
      await logExport(tx, x.current.ctx, { title, format: x.format, filters, rows: r.length });
      return r;
    });
    type S = (typeof rows)[number];
    const cols: ExportColumn<S>[] = [
      { label: "Stock check", value: (s) => s.name },
      { label: "Started", value: (s) => formatDate(s.startedAt, x.tz) },
      { label: "Closed", value: (s) => (s.closedAt ? formatDate(s.closedAt, x.tz) : "Open") },
      { label: "Expected", value: (s) => s.expected ?? "" },
      { label: "Found", value: (s) => s.found ?? "" },
      { label: "Missing", value: (s) => s.missing ?? "" },
      { label: "Extra", value: (s) => s.extra ?? "" },
      { label: "Missing marked lost", value: (s) => (s.lostMarkedAt ? formatDate(s.lostMarkedAt, x.tz) : "") },
    ];
    return exportResponse(await buildExport(x.format, cols, rows, { title, schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters }));
  }
  const f = readFinesFilter(x.get, range);
  const title = "Library fines";
  const filters = [rangeWords(range), FINE_TABS.find((t) => t.value === f.status)?.label ?? "", f.reason ? FINE_REASON[f.reason as FineReason] : "", f.q ? `Search: ${f.q}` : ""].filter(Boolean).join(" · ");
  const r = await withSchool(x.current.ctx, async (tx) => {
    const s = await librarySettings(tx, x.current.ctx);
    await syncFeeFines(tx, x.current.ctx);
    const rows = await tx.libraryFine.findMany({ where: await finesWhere(tx, f, x.tz), orderBy: { createdAt: "desc" }, take: 20000 });
    const [members, books, copies] = await Promise.all([
      issueMembers(tx, x.current.ctx, s, rows),
      tx.book.findMany({ where: { id: { in: [...new Set(rows.map((i) => i.bookId))] } }, select: { id: true, title: true } }),
      tx.bookCopy.findMany({ where: { id: { in: [...new Set(rows.map((i) => i.copyId))] } }, select: { id: true, accessionNo: true } }),
    ]);
    await logExport(tx, x.current.ctx, { title, format: x.format, filters, rows: rows.length });
    return { rows, members, books: new Map(books.map((b) => [b.id, b.title])), copies: new Map(copies.map((c) => [c.id, c.accessionNo])) };
  }, { timeout: 60_000 });
  type Row = (typeof r.rows)[number];
  const who = (i: Row) => r.members.get(i.studentId ? `S:${i.studentId}` : `T:${i.staffId}`) ?? null;
  const columns: ExportColumn<Row>[] = [
    { label: "Fine no.", value: (i) => i.fineNo },
    { label: "Date", value: (i) => formatDate(i.createdAt, x.tz) },
    { label: "Member", value: (i) => who(i)?.name ?? "" },
    { label: "Class or department", value: (i) => who(i)?.group ?? "" },
    { label: "Card no.", value: (i) => who(i)?.cardNo ?? "" },
    { label: "Book", value: (i) => r.books.get(i.bookId) ?? "" },
    { label: "Accession no.", value: (i) => r.copies.get(i.copyId) ?? "" },
    { label: "Reason", value: (i) => FINE_REASON[i.reason as FineReason] },
    { label: "Days late", value: (i) => i.lateDays ?? "" },
    { label: "Amount", value: (i) => formatRupees(i.amountPaise) },
    { label: "Status", value: (i) => FINE_STATUS[i.status as FineStatus].label },
    { label: "Paid or collected", value: (i) => fineWhere(i, x.tz) },
    { label: "Waived because", value: (i) => i.waiveReason ?? "" },
    { label: "Note", value: (i) => i.note ?? "" },
  ];
  return exportResponse(await buildExport(x.format, columns, r.rows, { title, schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters }));
}
