// Importing salary structures from a spreadsheet (10 Salary Structures, P10):
// one row per staff member with their staff ID, basic, conveyance, special
// allowance, monthly TDS and the month it starts. Each row becomes a new
// version of that person's structure, as if typed on Add or Revise
// structure; earlier versions stay. Brought in on the one import engine from
// Salary Management, Salary Structures, Import, by people with full Salary
// Management only. A person limited to one campus brings in that campus's
// staff only. Undo archives the versions it added, only while no salary has
// been worked out with them. Imported by src/lib/import-registry.ts.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { defineImport, RowProblem, type ImportColumn, type ImportKind } from "../importer";
import { writeAudit } from "../audit";
import { parseRupees } from "../fees/act";
import { MoneyProblem } from "../fees/problem";
import { formatDate } from "../format";
import { components, linesFrom } from "./settings";
import { earliestStart, saveStructure } from "./structures";

export const SALARY_IMPORT = "salary-structures";

const ZERO = BigInt(0);
/** Monthly gross up to which ESI applies (₹21,000), as on the structure form. */
const ESI_LIMIT = BigInt(2100000);

const COLUMNS: ImportColumn[] = [
  { key: "staffId", label: "Staff ID", required: true, example: "SPS-ST-001", help: "The staff ID in Staff & HR.", aliases: ["staff_id", "staff code", "employee id", "emp id", "emp code", "staff no"] },
  { key: "basic", label: "Basic", required: true, example: "22000", help: "Monthly basic pay in rupees.", aliases: ["basic pay", "basic salary"] },
  { key: "conveyance", label: "Conveyance", example: "1600", aliases: ["conveyance allowance", "transport allowance"] },
  { key: "specialAllowance", label: "Special allowance", example: "3400", aliases: ["special_allowance", "special"] },
  { key: "tds", label: "TDS", example: "0", help: "Monthly TDS typed in, in rupees.", aliases: ["monthly tds", "tds per month", "income tax"] },
  { key: "fromDate", label: "Effective from", required: true, example: "01-11-2026", help: "The 1st of the month it starts, DD-MM-YYYY.", aliases: ["effective_from", "effective date", "from", "wef", "w.e.f"] },
];

type Options = { campusId: string | null };
type Row = { staffId: string; staffName: string; amounts: Map<string, bigint>; tds: bigint; from: Date; esi: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const options = (o: Record<string, unknown>): Options => ({ campusId: typeof o.campusId === "string" && UUID.test(o.campusId) ? o.campusId : null });

function dateOf(raw: string): Date | null {
  const v = raw.trim();
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(v) ?? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const iso = m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : d;
}

function makeKind(opts: Options): ImportKind<Row> {
  // The school's salary components and the first open month, looked up once for each check of a file.
  const memo = new WeakMap<Set<string>, Promise<{ comps: Awaited<ReturnType<typeof components>>; earliest: Date | null }>>();
  const lookups = (tx: Tx, ctx: SchoolContext, seen: Set<string>) => {
    let p = memo.get(seen);
    if (!p) { p = (async () => ({ comps: await components(tx, ctx), earliest: await earliestStart(tx) }))(); memo.set(seen, p); }
    return p;
  };
  return {
    key: SALARY_IMPORT,
    label: "Salary structures",
    columns: COLUMNS,
    withOptions: (o) => makeKind(options(o)),
    async check(tx, ctx, row, seen) {
      const problems: string[] = [];
      const { comps, earliest } = await lookups(tx, ctx, seen);
      const code = (row.staffId ?? "").trim();
      // One campus: a staff ID of another campus is "no staff with ID", like one that does not exist.
      const staff = code ? await tx.staff.findFirst({ where: { staffCode: { equals: code, mode: "insensitive" }, archivedAt: null, ...(opts.campusId ? { campusId: opts.campusId } : {}) }, select: { id: true, fullName: true } }) : null;
      if (code && !staff) problems.push(`No staff member has the staff ID ${code}.`);
      if (staff) {
        if (seen.has(`staff:${staff.id}`)) problems.push(`${staff.fullName} is twice in the file. Keep one row for each staff member.`);
        seen.add(`staff:${staff.id}`);
      }
      const from = dateOf(row.fromDate ?? "");
      if (!from) problems.push("Effective from must be a date like 01-11-2026.");
      else if (from.getUTCDate() !== 1) problems.push("Salary changes start on the 1st of a month. Write the 1st.");
      else if (earliest && from < earliest) problems.push(`Salary before ${formatDate(earliest)} is already approved. Start from ${formatDate(earliest)} or later, and add the difference as arrears in Generate Salary.`);
      const amount = (key: string, label: string) => {
        try {
          return parseRupees(row[key] ?? "", label);
        } catch (e) {
          if (e instanceof MoneyProblem) { problems.push(e.message); return null; }
          throw e;
        }
      };
      const basicPay = amount("basic", "Basic");
      if (basicPay === null || basicPay <= ZERO) { if (!problems.some((p) => p.startsWith("Basic"))) problems.push("Basic must be more than ₹0."); }
      const conveyance = amount("conveyance", "Conveyance");
      const special = amount("specialAllowance", "Special allowance");
      const tds = amount("tds", "TDS") ?? ZERO;
      if (problems.length || !staff || !from || basicPay === null) return { ok: false, problems };
      const byName = (n: string) => comps.find((c) => c.name.toLowerCase() === n || c.systemKey === n);
      const amounts = new Map<string, bigint>();
      const basic = byName("basic"), conv = byName("conveyance"), spec = byName("special allowance");
      if (basic) amounts.set(basic.id, basicPay);
      if (conv && conveyance) amounts.set(conv.id, conveyance);
      if (spec && special) amounts.set(spec.id, special);
      const gross = basicPay * BigInt(3) / BigInt(2) + (conveyance ?? ZERO) + (special ?? ZERO);
      return { ok: true, value: { staffId: staff.id, staffName: staff.fullName, amounts, tds, from, esi: gross <= ESI_LIMIT } };
    },
    async save(tx, ctx, v) {
      const comps = await components(tx, ctx);
      try {
        const row = await saveStructure(tx, ctx, { staffId: v.staffId, effectiveFrom: v.from, lines: linesFrom(comps, v.amounts), pfApplies: true, esiApplies: v.esi, tdsPaise: v.tds, reason: "Imported from a spreadsheet" });
        return { id: row.id, created: true };
      } catch (e) {
        if (e instanceof MoneyProblem) throw new RowProblem(`${v.staffName}: ${e.message}`);
        throw e;
      }
    },
    async undo(tx, ctx, ids) {
      const used = await tx.payrollLine.count({ where: { structureId: { in: ids } } });
      if (used) throw new Error("Salary has been worked out with some of these structures. Undo is no longer possible; revise the structures one by one.");
      const now = new Date();
      const rows = await tx.salaryStructure.findMany({ where: { id: { in: ids }, archivedAt: null }, select: { id: true, staffId: true, version: true } });
      await tx.salaryStructure.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { archivedAt: now } });
      await writeAudit(tx, ctx, { action: "archived", recordType: "Salary Structure", recordId: null, after: { reason: "Import undone", structures: rows.length } });
    },
  };
}

defineImport(makeKind({ campusId: null }));
