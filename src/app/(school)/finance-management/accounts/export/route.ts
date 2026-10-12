import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { formatDate, formatRupees } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import { periodFromSearch } from "@/lib/periods";
import { periodSetup } from "@/lib/period-setup";
import { todayIn } from "@/lib/staff/dates";
import { generalLedger, journalList } from "@/lib/finance/journals";
import { financeFeaturesOn } from "@/lib/finance/settings";
import { financialYearOf } from "@/lib/finance/years";
import { financePageAllowed } from "@/lib/finance/access";

export const dynamic = "force-dynamic";

const ZERO = BigInt(0);
type Row = { date: string; ref: string; account: string; narration: string; debit: string; credit: string; balance: string };

/** Journal entries, or one account's ledger, for the dates on screen (P8). */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("finance-management", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export accounts.", { status: 403 });
    throw e;
  }
  if (!financePageAllowed(current.permissions, "accounts")) return new Response("Your role does not see Accounts.", { status: 403 });
  const url = new URL(req.url);
  const g = (k: string) => url.searchParams.get(k) ?? "";
  const format = (["csv", "xlsx", "pdf"].includes(g("format")) ? g("format") : "xlsx") as ExportFormat;
  const today = todayIn(current.school.timeZone);
  const range = periodFromSearch(Object.fromEntries(url.searchParams), { ...(await periodSetup(current)), fallback: "finyear" });
  const result = await withSchool(current.ctx, async (tx) => {
    if (!(await financeFeaturesOn(tx, current.ctx)).has("finance-accounts")) return null;
    const fy = await financialYearOf(tx, current.ctx, today);
    const from = range ? new Date(`${range.from}T00:00:00Z`) : fy.startDate;
    const to = range ? new Date(`${range.to}T00:00:00Z`) : today;
    const words = `${formatDate(from)} to ${formatDate(to)}`;
    let title: string, rows: Row[];
    if (g("tab") === "ledger") {
      const led = await generalLedger(tx, current.ctx, g("acc"), from, to, fy.startDate);
      if (!led) return { missing: true as const };
      const bal = (v: bigint) => `${formatRupees(v < ZERO ? -v : v)} ${(led.debitNature ? v >= ZERO : v < ZERO) ? "Dr" : "Cr"}`;
      title = `Ledger: ${led.account.name}`;
      rows = [
        { date: formatDate(from), ref: "", account: led.account.name, narration: "Opening balance", debit: "", credit: "", balance: bal(led.opening) },
        ...led.rows.map((r) => ({ date: formatDate(r.date), ref: r.ref, account: led.account.name, narration: r.narration, debit: r.debit > ZERO ? formatRupees(r.debit) : "", credit: r.credit > ZERO ? formatRupees(r.credit) : "", balance: bal(r.balance) })),
        { date: formatDate(to), ref: "", account: led.account.name, narration: "Closing balance", debit: formatRupees(led.debit), credit: formatRupees(led.credit), balance: bal(led.closing) },
      ];
    } else {
      const list = await journalList(tx, from, to);
      title = "Journal entries";
      rows = list.flatMap((j) => j.lines.map((l) => ({
        date: formatDate(j.date), ref: j.number, account: l.head, narration: `${j.narration}${j.reversedById ? " (reversed)" : ""}`,
        debit: l.debitPaise > ZERO ? formatRupees(l.debitPaise) : "", credit: l.creditPaise > ZERO ? formatRupees(l.creditPaise) : "", balance: "",
      })));
    }
    await logExport(tx, current.ctx, { title, format, filters: words, rows: rows.length });
    return { title, rows, words };
  });
  if (!result || "missing" in result) return new Response("Not found.", { status: 404 });
  const columns: ExportColumn<Row>[] = [
    { label: "Date", value: (r) => r.date }, { label: "Entry", value: (r) => r.ref }, { label: "Account", value: (r) => r.account }, { label: "Narration", value: (r) => r.narration },
    { label: "Debit", value: (r) => r.debit }, { label: "Credit", value: (r) => r.credit }, { label: "Balance", value: (r) => r.balance },
  ];
  return exportResponse(await buildExport(format, columns, result.rows, { title: result.title, schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: current.school.timeZone, filters: result.words }));
}
