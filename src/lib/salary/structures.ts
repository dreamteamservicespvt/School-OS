// Salary Structures (10 §2): each staff member's earnings and deductions.
// Every change is a new version from the 1st of a month; past payrolls keep
// the version they used (Done when 9). A revision dated into a month whose
// salary is already approved is refused: the difference is paid as arrears.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { encryptField } from "../crypto";
import { MoneyProblem } from "../fees/problem";
import { formatDate, formatRupees } from "../format";
import { resolveLines, structureGross, toRupee, type StructureLine } from "./calc";
import { lastFrozenMonth } from "./settings";
import { addMonths, monthName } from "./words";

const ZERO = BigInt(0);

export type StoredLine = Omit<StructureLine, "amountPaise"> & { amountPaise: string };

export const toStored = (lines: StructureLine[]): StoredLine[] => lines.map((l) => ({ ...l, amountPaise: String(l.amountPaise) }));
export const fromStored = (json: Prisma.JsonValue): StructureLine[] => ((json as StoredLine[] | null) ?? []).map((l) => ({ ...l, amountPaise: BigInt(l.amountPaise) }));

/** The structure version that applies in a month (the latest starting on or before the month's first day). */
export async function structureFor(tx: Tx, staffId: string, month: Date) {
  return tx.salaryStructure.findFirst({ where: { staffId, archivedAt: null, effectiveFrom: { lte: month } }, orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }] });
}

/** For each staff member, the version that applies on a day (or the next one if none has started yet). */
export async function structuresOn(tx: Tx, day: Date, staffIds?: string[]) {
  const rows = await tx.salaryStructure.findMany({ where: { archivedAt: null, ...(staffIds ? { staffId: { in: staffIds } } : {}) }, orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }] });
  const out = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (r.effectiveFrom <= day && !out.has(r.staffId)) out.set(r.staffId, r);
  for (const r of [...rows].reverse()) if (!out.has(r.staffId)) out.set(r.staffId, r);
  return out;
}

/** First month a new version may start: after the last approved salary. */
export async function earliestStart(tx: Tx) {
  const frozen = await lastFrozenMonth(tx);
  return frozen ? addMonths(frozen, 1) : null;
}

export type StructureInput = {
  staffId: string;
  effectiveFrom: Date;
  lines: StructureLine[];
  pfApplies: boolean;
  esiApplies: boolean;
  tdsPaise: bigint;
  reason: string | null;
  bank?: { account: string; ifsc: string | null; bankName: string | null } | null;
};

export async function saveStructure(tx: Tx, ctx: SchoolContext, input: StructureInput) {
  const staff = await tx.staff.findFirst({ where: { id: input.staffId, archivedAt: null }, select: { id: true, fullName: true, joiningDate: true } });
  if (!staff) throw new MoneyProblem("Choose the staff member.", "staffId");
  if (input.effectiveFrom.getUTCDate() !== 1) throw new MoneyProblem("Salary changes start on the 1st of a month. Pick the 1st.", "effectiveFrom");
  const earliest = await earliestStart(tx);
  if (earliest && input.effectiveFrom < earliest) {
    throw new MoneyProblem(`Salary up to ${monthName(addMonths(earliest, -1))} is already approved. A revision before ${formatDate(earliest)} will be paid as arrears: pick ${formatDate(earliest)} or later, and add the difference as arrears in Generate Salary.`, "effectiveFrom");
  }
  const earnings = input.lines.filter((l) => l.kind === "EARNING");
  if (!earnings.length || !earnings.some((l) => l.calc === "FIXED" && l.amountPaise > ZERO)) throw new MoneyProblem("Enter at least basic pay.", "basic");
  for (const l of input.lines) {
    if (l.amountPaise < ZERO) throw new MoneyProblem(`${l.name} cannot be below ₹0.`);
    if (l.amountPaise > BigInt(100000000)) throw new MoneyProblem(`${l.name} is more than ₹10 lakh a month: check the amount.`);
  }
  if (input.tdsPaise < ZERO) throw new MoneyProblem("TDS cannot be below ₹0.", "tds");
  const gross = structureGross(input.lines);
  if (input.tdsPaise > gross) throw new MoneyProblem("TDS is more than the monthly gross. Check the amount.", "tds");

  const last = await tx.salaryStructure.findFirst({ where: { staffId: staff.id }, orderBy: { version: "desc" } });
  const version = (last?.version ?? 0) + 1;
  const row = await tx.salaryStructure.create({
    data: {
      schoolId: ctx.schoolId, staffId: staff.id, version, effectiveFrom: input.effectiveFrom, lines: toStored(resolveLines(input.lines)) as Prisma.InputJsonValue,
      pfApplies: input.pfApplies, esiApplies: input.esiApplies, tdsPaise: input.tdsPaise, grossPaise: gross, reason: input.reason, createdById: ctx.userId,
    },
  });
  if (input.bank?.account) {
    await tx.staff.update({ where: { id: staff.id }, data: { bankAccountEnc: encryptField(input.bank.account), bankIfsc: input.bank.ifsc, bankName: input.bank.bankName } });
  }
  await writeAudit(tx, ctx, {
    action: last ? "salary-structure-revised" : "salary-structure-added", recordType: "Salary Structure", recordId: row.id,
    before: last ? { version: last.version, from: formatDate(last.effectiveFrom), gross: formatRupees(last.grossPaise), tds: formatRupees(last.tdsPaise) } : null,
    after: { staff: staff.fullName, version, from: formatDate(input.effectiveFrom), gross: formatRupees(gross), tds: formatRupees(input.tdsPaise), pf: input.pfApplies, esi: input.esiApplies, reason: input.reason, bankChanged: Boolean(input.bank?.account) },
  });
  return row;
}

/** A new version with only the monthly TDS changed ("Enter TDS" in Generate Salary). */
export async function setTds(tx: Tx, ctx: SchoolContext, staffId: string, tdsPaise: bigint, from: Date, reason: string) {
  const cur = await structureFor(tx, staffId, from);
  if (!cur) throw new MoneyProblem("Add a salary structure for this person first.");
  return saveStructure(tx, ctx, { staffId, effectiveFrom: from, lines: fromStored(cur.lines), pfApplies: cur.pfApplies, esiApplies: cur.esiApplies, tdsPaise, reason });
}

/** The lines raised by a percentage: fixed earnings go up, rounded to the rupee; percentage lines follow basic pay. */
export function raisedLines(lines: StructureLine[], percentBp: number) {
  return lines.map((l) => (l.kind === "EARNING" && l.calc === "FIXED" ? { ...l, amountPaise: toRupee((l.amountPaise * BigInt(10000 + percentBp)) / BigInt(10000)) } : l));
}

/** Bulk revise: a percentage increase for several people from a date, each a new version. */
export async function reviseByPercent(tx: Tx, ctx: SchoolContext, staffIds: string[], percentBp: number, from: Date, reason: string) {
  if (!staffIds.length) throw new MoneyProblem("Choose the staff to revise.");
  if (!(percentBp > 0 && percentBp <= 10000)) throw new MoneyProblem("Enter the increase in percent, like 5.", "percent");
  let done = 0;
  for (const id of staffIds) {
    const cur = await structureFor(tx, id, from);
    if (!cur) continue;
    await saveStructure(tx, ctx, { staffId: id, effectiveFrom: from, lines: raisedLines(fromStored(cur.lines), percentBp), pfApplies: cur.pfApplies, esiApplies: cur.esiApplies, tdsPaise: cur.tdsPaise, reason });
    done++;
  }
  if (!done) throw new MoneyProblem("None of them has a salary structure to revise.");
  return done;
}
