import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { formatDate, formatRupees, formatTime } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import { periodFromSearch } from "@/lib/periods";
import { periodSetup } from "@/lib/period-setup";
import { todayIn } from "@/lib/staff/dates";
import { accountBook } from "@/lib/finance/daybook";
import { financeModeLabel, sectionLabel } from "@/lib/finance/words";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;
const ZERO = BigInt(0);
const money = (v: bigint) => (v < ZERO ? `−${formatRupees(-v)}` : formatRupees(v));

/** The cash book or one bank book for the dates on screen, opening and closing on the first and last lines (P8). */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("finance-management", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export cash and bank books.", { status: 403 });
    throw e;
  }
  const url = new URL(req.url);
  const g = (k: string) => url.searchParams.get(k) ?? "";
  const format = (["csv", "xlsx", "pdf"].includes(g("format")) ? g("format") : "xlsx") as ExportFormat;
  const tz = current.school.timeZone;
  const today = todayIn(tz);
  const range = periodFromSearch(Object.fromEntries(url.searchParams), { ...(await periodSetup(current)), fallback: "today" });
  const from = range ? new Date(`${range.from}T00:00:00Z`) : today;
  const to = range ? new Date(`${range.to}T00:00:00Z`) : today;
  const result = await withSchool(current.ctx, async (tx) => {
    const account = UUID.test(g("book"))
      ? await tx.bankAccount.findFirst({ where: { id: g("book"), archivedAt: null } })
      : await tx.bankAccount.findFirst({ where: { kind: "CASH", archivedAt: null }, orderBy: { createdAt: "asc" } });
    if (!account) return null;
    const book = await accountBook(tx, account.id, from, to);
    const title = account.kind === "CASH" ? "Cash book" : `Bank book, ${account.name}`;
    const words = from.getTime() === to.getTime() ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}`;
    await logExport(tx, current.ctx, { title, format, filters: words, rows: book.lines.length });
    return { book, title, words };
  });
  if (!result) return new Response("This account was not found.", { status: 404 });
  type Row = { date: string; time: string; details: string; kind: string; mode: string; ref: string; inn: string; out: string; bal: string };
  const b = result.book;
  const rows: Row[] = [
    { date: formatDate(from), time: "", details: "Opening balance", kind: "", mode: "", ref: "", inn: "", out: "", bal: money(b.opening) },
    ...b.lines.map((l) => ({
      date: formatDate(l.date), time: formatTime(l.postedAt, tz), details: l.headName && l.headName !== l.partyName ? `${l.partyName} · ${l.headName}` : l.partyName, kind: sectionLabel(l.section),
      mode: financeModeLabel(l.mode), ref: l.reference ?? "", inn: l.direction === "IN" ? formatRupees(l.amountPaise) : "", out: l.direction === "OUT" ? formatRupees(l.amountPaise) : "", bal: money(l.balance),
    })),
    { date: formatDate(to), time: "", details: "Closing balance", kind: "", mode: "", ref: "", inn: formatRupees(b.receipts), out: formatRupees(b.payments), bal: money(b.closing) },
  ];
  const columns: ExportColumn<Row>[] = [
    { label: "Date", value: (r) => r.date },
    { label: "Time", value: (r) => r.time },
    { label: "Details", value: (r) => r.details },
    { label: "Kind", value: (r) => r.kind },
    { label: "Mode", value: (r) => r.mode },
    { label: "Reference", value: (r) => r.ref },
    { label: "Receipts", value: (r) => r.inn },
    { label: "Payments", value: (r) => r.out },
    { label: "Balance", value: (r) => r.bal },
  ];
  return exportResponse(await buildExport(format, columns, rows, { title: result.title, schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: tz, filters: result.words }));
}
