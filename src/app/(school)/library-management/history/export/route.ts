// The issue history on Issue & Return, for the dates, status and search on screen.
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { formatDate } from "@/lib/format";
import { librarySettings } from "@/lib/library/settings";
import { daysBetween, issueMembers } from "@/lib/library/desk";
import { libRoute, rangeWords } from "../../_lib/route";
import { historyWhere, HISTORY_STATUS } from "../../_lib/history";

export const dynamic = "force-dynamic";
const day = (d: Date | null) => (d ? formatDate(d, "UTC") : "");

export async function GET(req: Request) {
  const x = await libRoute(req, "issue");
  if (x instanceof Response) return x;
  const range = await x.range("month", "h");
  const q = x.get("hq").trim().slice(0, 80);
  const status = x.get("hstatus");
  const title = "Library issue history";
  const filters = [rangeWords(range), HISTORY_STATUS.find((s) => s.value === status && s.value)?.label ?? "", q ? `Search: ${q}` : ""].filter(Boolean).join(" · ");
  const r = await withSchool(x.current.ctx, async (tx) => {
    const s = await librarySettings(tx, x.current.ctx);
    const where = await historyWhere(tx, { range, q, status, today: x.today });
    const rows = await tx.bookIssue.findMany({ where, orderBy: [{ issuedOn: "desc" }, { issuedAt: "desc" }], take: 20000, include: { copy: { select: { accessionNo: true, book: { select: { title: true } } } } } });
    const members = await issueMembers(tx, x.current.ctx, s, rows);
    await logExport(tx, x.current.ctx, { title, format: x.format, filters, rows: rows.length });
    return rows.map((i) => ({ ...i, member: members.get(i.studentId ? `S:${i.studentId}` : `T:${i.staffId}`) ?? null }));
  }, { timeout: 60_000 });
  type Row = (typeof r)[number];
  const late = (i: Row) => (i.returnedOn ? Math.max(0, daysBetween(i.dueOn, i.returnedOn)) : Math.max(0, daysBetween(i.dueOn, x.today)));
  const columns: ExportColumn<Row>[] = [
    { label: "Book", value: (i) => i.copy.book.title },
    { label: "Accession no.", value: (i) => i.copy.accessionNo },
    { label: "Member", value: (i) => i.member?.name ?? "" },
    { label: "Type", value: (i) => (i.memberKind === "STAFF" ? "Staff" : "Student") },
    { label: "Class or department", value: (i) => i.member?.group ?? "" },
    { label: "Card no.", value: (i) => i.member?.cardNo ?? "" },
    { label: "Issued on", value: (i) => day(i.issuedOn) },
    { label: "Due on", value: (i) => day(i.dueOn) },
    { label: "Renewals", value: (i) => i.renewals },
    { label: "Returned on", value: (i) => day(i.returnedOn) },
    { label: "Days late", value: (i) => late(i) || "" },
    { label: "Status", value: (i) => (i.returnedAt ? (i.outcome === "LOST" ? "Lost" : i.outcome === "DAMAGED" ? "Returned damaged" : "Returned") : i.dueOn.getTime() < x.today.getTime() ? "Overdue" : "Out") },
  ];
  return exportResponse(await buildExport(x.format, columns, r, { title, schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters }));
}
