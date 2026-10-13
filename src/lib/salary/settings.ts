// Salary Settings (10 §6): salary components, designation templates, payroll
// preferences, PF, ESI and Professional Tax (rates from a chosen month, never
// changing approved payrolls), and salary slip options.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { MoneyProblem } from "../fees/problem";
import { formatRupees } from "../format";
import { monthName } from "./words";
import type { PtSlab, Statutory, StructureLine } from "./calc";

const R = (rupees: number) => BigInt(Math.round(rupees * 100));

export const DEFAULT_COMPONENTS = [
  { name: "Basic pay", kind: "EARNING", calc: "FIXED", percentBp: null, taxable: true, systemKey: "basic", sortOrder: 1 },
  { name: "Dearness allowance", kind: "EARNING", calc: "PERCENT", percentBp: 2000, taxable: true, systemKey: null, sortOrder: 2 },
  { name: "House rent allowance", kind: "EARNING", calc: "PERCENT", percentBp: 3000, taxable: true, systemKey: null, sortOrder: 3 },
  { name: "Conveyance", kind: "EARNING", calc: "FIXED", percentBp: null, taxable: true, systemKey: null, sortOrder: 4 },
  { name: "Special allowance", kind: "EARNING", calc: "FIXED", percentBp: null, taxable: true, systemKey: null, sortOrder: 5 },
  { name: "Loss of pay", kind: "DEDUCTION", calc: "ATTENDANCE", percentBp: null, taxable: false, systemKey: "lop", sortOrder: 6 },
  { name: "Staff welfare fund", kind: "DEDUCTION", calc: "FIXED", percentBp: null, taxable: false, systemKey: null, sortOrder: 7 },
] as const;

/** Basic, conveyance and special allowance of each starting template (DA and HRA come from basic). */
export const DEFAULT_TEMPLATES: { name: string; basic: number; conveyance: number; special: number }[] = [
  { name: "PRT", basic: 15000, conveyance: 1200, special: 2800 },
  { name: "TGT", basic: 20500, conveyance: 1600, special: 3150 },
  { name: "PGT", basic: 29000, conveyance: 1600, special: 4900 },
  { name: "Driver", basic: 10000, conveyance: 1000, special: 2500 },
  { name: "Office staff", basic: 10000, conveyance: 1000, special: 2000 },
  { name: "Support staff", basic: 7000, conveyance: 800, special: 1200 },
];

/** Telangana's monthly Professional Tax table (inferred default; the school can change it). */
export const DEFAULT_PT_SLABS = [
  { fromPaise: R(0), toPaise: R(15000), taxPaise: R(0) },
  { fromPaise: R(15000.01), toPaise: R(20000), taxPaise: R(150) },
  { fromPaise: R(20000.01), toPaise: null, taxPaise: R(200) },
];

export async function ensureSalaryDefaults(tx: Tx, ctx: SchoolContext) {
  const setting = await tx.salarySetting.findUnique({ where: { schoolId: ctx.schoolId } });
  if (setting) return setting;
  const made = await tx.salarySetting.create({ data: { schoolId: ctx.schoolId } });
  for (const c of DEFAULT_COMPONENTS) {
    await tx.salaryComponent.upsert({ where: { schoolId_name: { schoolId: ctx.schoolId, name: c.name } }, create: { schoolId: ctx.schoolId, ...c }, update: {} });
  }
  // Rules from the start of this financial year; earlier months use them too.
  await tx.statutorySetting.create({ data: { schoolId: ctx.schoolId, validFrom: new Date("2000-01-01T00:00:00Z"), pfOn: true, esiOn: true, ptOn: false } });
  for (const s of DEFAULT_PT_SLABS) await tx.professionalTaxSlab.create({ data: { schoolId: ctx.schoolId, state: "Telangana", ...s } });
  const comps = await tx.salaryComponent.findMany({ where: { schoolId: ctx.schoolId } });
  const id = (n: string) => comps.find((c) => c.name === n)!.id;
  for (const t of DEFAULT_TEMPLATES) {
    await tx.salaryTemplate.upsert({
      where: { schoolId_name: { schoolId: ctx.schoolId, name: t.name } },
      create: { schoolId: ctx.schoolId, name: t.name, lines: [{ componentId: id("Basic pay"), amountPaise: String(R(t.basic)) }, { componentId: id("Conveyance"), amountPaise: String(R(t.conveyance)) }, { componentId: id("Special allowance"), amountPaise: String(R(t.special)) }] },
      update: {},
    });
  }
  return made;
}

export async function salarySettings(tx: Tx, ctx: SchoolContext) {
  return ensureSalaryDefaults(tx, ctx);
}

export async function components(tx: Tx, ctx: SchoolContext) {
  await ensureSalaryDefaults(tx, ctx);
  return tx.salaryComponent.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}

export type TemplateLine = { componentId: string; amountPaise: bigint };
export async function templates(tx: Tx, ctx: SchoolContext) {
  await ensureSalaryDefaults(tx, ctx);
  const rows = await tx.salaryTemplate.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } });
  return rows.map((t) => ({ id: t.id, name: t.name, lines: ((t.lines as { componentId: string; amountPaise: string }[]) ?? []).map((l) => ({ componentId: l.componentId, amountPaise: BigInt(l.amountPaise) })) }));
}

/** Structure lines from the school's components and the typed fixed amounts (by component id). */
export function linesFrom(comps: { id: string; name: string; kind: string; calc: string; percentBp: number | null; taxable: boolean; systemKey: string | null }[], amounts: Map<string, bigint>): StructureLine[] {
  return comps
    .filter((c) => c.calc !== "ATTENDANCE")
    .map((c) => ({ componentId: c.id, name: c.name, kind: c.kind as StructureLine["kind"], calc: c.calc as StructureLine["calc"], percentBp: c.percentBp, amountPaise: c.calc === "FIXED" ? amounts.get(c.id) ?? BigInt(0) : BigInt(0), taxable: c.taxable, systemKey: c.systemKey }))
    .filter((l) => l.calc === "PERCENT" || l.amountPaise > BigInt(0) || l.systemKey === "basic");
}

/** The PF, ESI and Professional Tax rules for a month. */
export async function statutoryFor(tx: Tx, ctx: SchoolContext, month: Date) {
  await ensureSalaryDefaults(tx, ctx);
  return tx.statutorySetting.findFirstOrThrow({ where: { archivedAt: null, validFrom: { lte: month } }, orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }] });
}

export const asStatutory = (s: { pfOn: boolean; pfEmployeeBp: number; pfEmployerBp: number; pfCeilingPaise: bigint; esiOn: boolean; esiEmployeeBp: number; esiEmployerBp: number; esiLimitPaise: bigint; ptOn: boolean }): Statutory => ({
  pfOn: s.pfOn, pfEmployeeBp: s.pfEmployeeBp, pfEmployerBp: s.pfEmployerBp, pfCeilingPaise: s.pfCeilingPaise,
  esiOn: s.esiOn, esiEmployeeBp: s.esiEmployeeBp, esiEmployerBp: s.esiEmployerBp, esiLimitPaise: s.esiLimitPaise, ptOn: s.ptOn,
});

export async function ptSlabs(tx: Tx, state: string): Promise<PtSlab[]> {
  const rows = await tx.professionalTaxSlab.findMany({ where: { state, archivedAt: null }, orderBy: { fromPaise: "asc" } });
  return rows.map((r) => ({ fromPaise: r.fromPaise, toPaise: r.toPaise, taxPaise: r.taxPaise, specialMonth: r.specialMonth, specialPaise: r.specialPaise }));
}

/** The last month whose salary is approved (or later) for any campus: rules and structures may not change it. */
export async function lastFrozenMonth(tx: Tx): Promise<Date | null> {
  const run = await tx.payrollRun.findFirst({ where: { status: { in: ["APPROVED", "PAID", "LOCKED"] } }, orderBy: { month: "desc" }, select: { month: true } });
  return run?.month ?? null;
}

export type StatutoryInput = Statutory & { ptState: string };

/** New PF, ESI and Professional Tax rules from a month. Approved salaries keep the rules they were worked out with. */
export async function saveStatutory(tx: Tx, ctx: SchoolContext, input: StatutoryInput, from: Date) {
  const frozen = await lastFrozenMonth(tx);
  if (frozen && from <= frozen) throw new MoneyProblem(`${monthName(frozen)} salary is already approved. Choose ${monthName(new Date(Date.UTC(frozen.getUTCFullYear(), frozen.getUTCMonth() + 1, 1)))} or later.`, "from");
  if (input.pfEmployeeBp < 0 || input.pfEmployeeBp > 5000 || input.pfEmployerBp < 0 || input.pfEmployerBp > 5000) throw new MoneyProblem("PF rates must be between 0% and 50%.", "pfEmployee");
  if (input.esiEmployeeBp < 0 || input.esiEmployeeBp > 1000 || input.esiEmployerBp < 0 || input.esiEmployerBp > 1000) throw new MoneyProblem("ESI rates must be between 0% and 10%.", "esiEmployee");
  const before = await statutoryFor(tx, ctx, from);
  const row = await tx.statutorySetting.create({ data: { schoolId: ctx.schoolId, validFrom: from, ...input, createdById: ctx.userId } });
  await writeAudit(tx, ctx, {
    action: "salary-rates-changed", recordType: "Statutory Setting", recordId: row.id,
    before: { pf: before.pfOn, pfRate: before.pfEmployeeBp, pfCeiling: formatRupees(before.pfCeilingPaise), esi: before.esiOn, esiRate: before.esiEmployeeBp, esiLimit: formatRupees(before.esiLimitPaise), pt: before.ptOn },
    after: { from: monthName(from), pf: row.pfOn, pfRate: row.pfEmployeeBp, pfCeiling: formatRupees(row.pfCeilingPaise), esi: row.esiOn, esiRate: row.esiEmployeeBp, esiLimit: formatRupees(row.esiLimitPaise), pt: row.ptOn },
  });
  return row;
}

export type PreferenceInput = { payDay: string; lopDays: string; lateMarksPerHalfDay: number; overtimeOn: boolean; overtimeHourPaise: bigint; tdsReminderAbovePaise: bigint };

export async function savePreferences(tx: Tx, ctx: SchoolContext, input: PreferenceInput) {
  if (input.payDay !== "last-working" && !(Number(input.payDay) >= 1 && Number(input.payDay) <= 28)) throw new MoneyProblem("Choose the pay day.", "payDay");
  if (!["calendar", "thirty"].includes(input.lopDays)) throw new MoneyProblem("Choose how a month's days are counted.", "lopDays");
  if (input.lateMarksPerHalfDay < 0 || input.lateMarksPerHalfDay > 10) throw new MoneyProblem("Late marks must be between 0 (off) and 10.", "lateMarksPerHalfDay");
  const before = await salarySettings(tx, ctx);
  const after = await tx.salarySetting.update({ where: { schoolId: ctx.schoolId }, data: input });
  await writeAudit(tx, ctx, { action: "salary-preferences-changed", recordType: "Salary Setting", recordId: after.id, before: prefsWords(before), after: prefsWords(after) });
  return after;
}

const prefsWords = (s: { payDay: string; lopDays: string; lateMarksPerHalfDay: number; overtimeOn: boolean; overtimeHourPaise: bigint; tdsReminderAbovePaise: bigint }) => ({
  payDay: s.payDay, lopDays: s.lopDays, lateMarks: s.lateMarksPerHalfDay, overtime: s.overtimeOn ? formatRupees(s.overtimeHourPaise) : "off", tdsReminder: formatRupees(s.tdsReminderAbovePaise),
});

export const SLIP_OPTIONS = [
  { key: "slipWhatsapp", title: "Send slips on WhatsApp when approved" },
  { key: "slipEmail", title: "Also send by email" },
  { key: "slipShowEmployer", title: "Show the school’s PF and ESI share" },
  { key: "slipShowLeave", title: "Show leave and loss of pay on the slip" },
  { key: "advancesOn", title: "Advances & Loans", sub: "For schools that give staff advances or loans" },
] as const;
export type SlipOption = (typeof SLIP_OPTIONS)[number]["key"];

export async function setSlipOption(tx: Tx, ctx: SchoolContext, key: SlipOption, on: boolean) {
  if (!SLIP_OPTIONS.some((o) => o.key === key)) throw new MoneyProblem("This option was not found.");
  const before = await salarySettings(tx, ctx);
  await tx.salarySetting.update({ where: { schoolId: ctx.schoolId }, data: { [key]: on } });
  await writeAudit(tx, ctx, { action: "salary-option-changed", recordType: "Salary Setting", recordId: before.id, before: { [key]: before[key] }, after: { [key]: on } });
}

export type ComponentInput = { name: string; kind: "EARNING" | "DEDUCTION"; calc: "FIXED" | "PERCENT"; percentBp: number | null; taxable: boolean };

export async function addComponent(tx: Tx, ctx: SchoolContext, input: ComponentInput) {
  const name = input.name.trim();
  if (name.length < 2) throw new MoneyProblem("Give the component a name.", "name");
  if (await tx.salaryComponent.findFirst({ where: { name: { equals: name, mode: "insensitive" }, archivedAt: null } })) throw new MoneyProblem(`${name} already exists.`, "name");
  if (input.calc === "PERCENT" && !(input.percentBp && input.percentBp > 0 && input.percentBp <= 10000)) throw new MoneyProblem("Enter the percentage of basic pay, like 10.", "percent");
  const last = await tx.salaryComponent.aggregate({ _max: { sortOrder: true } });
  const c = await tx.salaryComponent.create({ data: { schoolId: ctx.schoolId, name, kind: input.kind, calc: input.calc, percentBp: input.calc === "PERCENT" ? input.percentBp : null, taxable: input.kind === "EARNING" && input.taxable, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  await writeAudit(tx, ctx, { action: "salary-component-added", recordType: "Salary Component", recordId: c.id, after: { name, kind: input.kind, calc: input.calc, percent: input.percentBp ? input.percentBp / 100 : null } });
  return c;
}

/** Archive a component: old structure versions keep it, new ones cannot use it. Basic pay and loss of pay stay. */
export async function archiveComponent(tx: Tx, ctx: SchoolContext, id: string) {
  const c = await tx.salaryComponent.findFirst({ where: { id, archivedAt: null } });
  if (!c) throw new MoneyProblem("This component was not found.");
  if (c.systemKey) throw new MoneyProblem(`${c.name} is needed to work out salary, so it stays.`);
  await tx.salaryComponent.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "salary-component-archived", recordType: "Salary Component", recordId: id, before: { name: c.name } });
  return c;
}

export type SlabInput = { fromPaise: bigint; toPaise: bigint | null; taxPaise: bigint };

/** Replaces the state's slab table. Old rows are archived, never deleted. */
export async function saveSlabs(tx: Tx, ctx: SchoolContext, state: string, slabs: SlabInput[]) {
  if (!slabs.length) throw new MoneyProblem("Add at least one row to the table.", "slabs");
  const sorted = [...slabs].sort((a, b) => (a.fromPaise < b.fromPaise ? -1 : 1));
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if (s.toPaise !== null && s.toPaise < s.fromPaise) throw new MoneyProblem(`Row ${i + 1}: "to" is below "from".`, "slabs");
    if (i > 0 && sorted[i - 1].toPaise !== null && s.fromPaise <= sorted[i - 1].toPaise!) throw new MoneyProblem(`Rows ${i} and ${i + 1} overlap.`, "slabs");
    if (i < sorted.length - 1 && s.toPaise === null) throw new MoneyProblem("Only the last row can have no upper end.", "slabs");
  }
  const old = await tx.professionalTaxSlab.findMany({ where: { state, archivedAt: null } });
  await tx.professionalTaxSlab.updateMany({ where: { state, archivedAt: null }, data: { archivedAt: new Date() } });
  for (const s of sorted) await tx.professionalTaxSlab.create({ data: { schoolId: ctx.schoolId, state, ...s } });
  await writeAudit(tx, ctx, {
    action: "professional-tax-slabs-changed", recordType: "Professional Tax Slab", recordId: null,
    before: old.map((s) => `${formatRupees(s.fromPaise)}–${s.toPaise === null ? "above" : formatRupees(s.toPaise)}: ${formatRupees(s.taxPaise)}`),
    after: sorted.map((s) => `${formatRupees(s.fromPaise)}–${s.toPaise === null ? "above" : formatRupees(s.toPaise)}: ${formatRupees(s.taxPaise)}`),
  });
}
