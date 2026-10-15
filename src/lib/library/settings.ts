// Library Settings (13 §6): borrowing limits and loan days by member type,
// fine rates, the lost and damaged charge rule, renewals, the reservation
// queue order, categories and shelves, accession numbers, labels and
// reminders. One row per school, made with the defaults on first use.
import "server-only";

import type { LibrarySetting } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatRupees } from "../format";
import { LibraryProblem } from "./problem";
import { CLASS_LEVELS, DEFAULT_STUDENT_RULES, type StudentRule } from "./words";

export type LibrarySettings = LibrarySetting & { rules: StudentRule[] };

/** The categories a new library starts with (the approved design); the school changes them. */
export const DEFAULT_CATEGORIES: { name: string; shelf: string; forLoan?: boolean }[] = [
  { name: "Fiction", shelf: "A" }, { name: "Biography", shelf: "B" }, { name: "General", shelf: "B" }, { name: "Science", shelf: "C" },
  { name: "Children's", shelf: "D" }, { name: "Comics", shelf: "D" }, { name: "Telugu", shelf: "E" }, { name: "Hindi", shelf: "E" },
  { name: "Reference", shelf: "R", forLoan: false },
];

function parseRules(raw: unknown): StudentRule[] {
  const list = Array.isArray(raw) ? (raw as Partial<StudentRule>[]) : [];
  return CLASS_LEVELS.map((level) => {
    const found = list.find((r) => r?.level === level);
    const d = DEFAULT_STUDENT_RULES.find((r) => r.level === level)!;
    return { level, books: Number.isInteger(found?.books) ? Number(found!.books) : d.books, loanDays: Number.isInteger(found?.loanDays) ? Number(found!.loanDays) : d.loanDays };
  });
}

/** The school's Library Settings, made with the defaults (and the starting categories) the first time. */
export async function librarySettings(tx: Tx, ctx: SchoolContext): Promise<LibrarySettings> {
  let s = await tx.librarySetting.findUnique({ where: { schoolId: ctx.schoolId } });
  if (!s) {
    s = await tx.librarySetting.upsert({ where: { schoolId: ctx.schoolId }, create: { schoolId: ctx.schoolId, studentRules: DEFAULT_STUDENT_RULES }, update: {} });
    if ((await tx.libraryCategory.count()) === 0) {
      await tx.libraryCategory.createMany({ data: DEFAULT_CATEGORIES.map((c, i) => ({ schoolId: ctx.schoolId, name: c.name, shelf: c.shelf, forLoan: c.forLoan ?? true, sortOrder: i + 1 })), skipDuplicates: true });
    }
  }
  return { ...s, rules: parseRules(s.studentRules) };
}

/** The next accession number the software will give (without taking it). */
export async function nextAccessionPreview(tx: Tx, ctx: SchoolContext, s: Pick<LibrarySetting, "accessionPrefix" | "accessionWidth">) {
  const row = await tx.numberSequence.findUnique({ where: { schoolId_key: { schoolId: ctx.schoolId, key: ACCESSION_KEY } } });
  return formatAccession(s, row?.nextValue ?? 1);
}

export const ACCESSION_KEY = "library-accession";
export const formatAccession = (s: Pick<LibrarySetting, "accessionPrefix" | "accessionWidth">, n: number) => `${s.accessionPrefix}${String(n).padStart(s.accessionWidth, "0")}`;

export type SettingsInput = {
  rules: StudentRule[];
  studentBooks: number;
  studentLoanDays: number;
  staffBooks: number;
  staffLoanDays: number;
  moveDueOffHolidays: boolean;
  finePerDayPaise: bigint;
  maxFinePaise: bigint;
  graceDays: number;
  blockFinesAbovePaise: bigint;
  finesToFees: boolean;
  lostCharge: "price" | "price-plus";
  lostExtraPaise: bigint;
  approvalAbovePaise: bigint;
  maxRenewals: number;
  queueOrder: "fcfs" | "staff-first";
  labelType: "barcode" | "qr" | "rfid";
  accessionPrefix: string;
  accessionWidth: number;
  nextAccession: number | null;
  remindDueTomorrow: boolean;
  remindOverdue: boolean;
  remindReservation: boolean;
};

const between = (n: number, lo: number, hi: number, label: string, field: string) => {
  if (!Number.isInteger(n) || n < lo || n > hi) throw new LibraryProblem(`${label} must be a whole number from ${lo} to ${hi}.`, field);
};

export async function saveSettings(tx: Tx, ctx: SchoolContext, input: SettingsInput) {
  const before = await librarySettings(tx, ctx);
  input.rules.forEach((r) => {
    between(r.books, 0, 20, `Books for ${r.level}`, `books-${r.level}`);
    between(r.loanDays, 1, 90, `Loan days for ${r.level}`, `days-${r.level}`);
  });
  between(input.studentBooks, 0, 20, "Books for other students", "studentBooks");
  between(input.studentLoanDays, 1, 90, "Loan days for other students", "studentLoanDays");
  between(input.staffBooks, 0, 30, "Books for staff", "staffBooks");
  between(input.staffLoanDays, 1, 180, "Loan days for staff", "staffLoanDays");
  between(input.graceDays, 0, 30, "Days of grace", "graceDays");
  between(input.maxRenewals, 0, 10, "Most renewals", "maxRenewals");
  between(input.accessionWidth, 3, 8, "Digits in accession numbers", "accessionWidth");
  if (input.maxFinePaise < input.finePerDayPaise) throw new LibraryProblem("The most fine for one book cannot be less than the fine for one day.", "maxFine");
  if (input.accessionPrefix && !/^[A-Za-z0-9/-]{1,8}$/.test(input.accessionPrefix)) throw new LibraryProblem("The prefix can have up to 8 letters, digits, - or /.", "accessionPrefix");
  if (input.nextAccession !== null) {
    between(input.nextAccession, 1, 99_999_999, "The next accession number", "nextAccession");
    const now = await tx.numberSequence.findUnique({ where: { schoolId_key: { schoolId: ctx.schoolId, key: ACCESSION_KEY } } });
    if (now && input.nextAccession < now.nextValue) throw new LibraryProblem(`The next accession number can only go up, so numbers are never given twice. It is ${now.nextValue} now.`, "nextAccession");
    await tx.numberSequence.upsert({ where: { schoolId_key: { schoolId: ctx.schoolId, key: ACCESSION_KEY } }, create: { schoolId: ctx.schoolId, key: ACCESSION_KEY, nextValue: input.nextAccession }, update: { nextValue: input.nextAccession } });
  }
  const { nextAccession: _next, rules, ...rest } = input;
  void _next;
  const after = await tx.librarySetting.update({ where: { schoolId: ctx.schoolId }, data: { ...rest, studentRules: rules, updatedById: ctx.userId } });
  const show = (s: LibrarySetting) => ({
    staff: `${s.staffBooks} books, ${s.staffLoanDays} days`, fine: `${formatRupees(s.finePerDayPaise)} a day, up to ${formatRupees(s.maxFinePaise)}, ${s.graceDays} days grace`,
    block: formatRupees(s.blockFinesAbovePaise), approvalAbove: formatRupees(s.approvalAbovePaise), lost: s.lostCharge === "price" ? "Price" : `Price + ${formatRupees(s.lostExtraPaise)}`,
    renewals: s.maxRenewals, queue: s.queueOrder, labels: s.labelType, finesToFees: s.finesToFees, rules: s.studentRules,
  });
  await writeAudit(tx, ctx, { action: "updated", recordType: "Library Settings", recordId: ctx.schoolId, before: show(before), after: { ...show(after), nextAccession: input.nextAccession } });
  return after;
}

/* ---------- Categories ---------- */

export async function saveCategory(tx: Tx, ctx: SchoolContext, input: { id: string | null; name: string; shelf: string | null; loanDays: number | null; forLoan: boolean }) {
  const name = input.name.trim();
  if (name.length < 2) throw new LibraryProblem("Give the category a name.", "name");
  if (input.loanDays !== null) between(input.loanDays, 1, 180, "Loan days", "loanDays");
  const clash = await tx.libraryCategory.findFirst({ where: { name: { equals: name, mode: "insensitive" }, archivedAt: null, ...(input.id ? { id: { not: input.id } } : {}) } });
  if (clash) throw new LibraryProblem(`There is already a category called ${clash.name}.`, "name");
  if (input.id) {
    const before = await tx.libraryCategory.findFirst({ where: { id: input.id } });
    if (!before) throw new LibraryProblem("This category was not found.");
    const c = await tx.libraryCategory.update({ where: { id: input.id }, data: { name, shelf: input.shelf, loanDays: input.loanDays, forLoan: input.forLoan, archivedAt: null } });
    await writeAudit(tx, ctx, { action: "updated", recordType: "Library Category", recordId: c.id, before: { name: before.name, shelf: before.shelf, forLoan: before.forLoan }, after: { name, shelf: input.shelf, forLoan: input.forLoan } });
    return c;
  }
  const archived = await tx.libraryCategory.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  const sortOrder = (await tx.libraryCategory.count()) + 1;
  const c = archived
    ? await tx.libraryCategory.update({ where: { id: archived.id }, data: { name, shelf: input.shelf, loanDays: input.loanDays, forLoan: input.forLoan, archivedAt: null } })
    : await tx.libraryCategory.create({ data: { schoolId: ctx.schoolId, name, shelf: input.shelf, loanDays: input.loanDays, forLoan: input.forLoan, sortOrder } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Library Category", recordId: c.id, after: { name, shelf: input.shelf, forLoan: input.forLoan } });
  return c;
}

/** Archives a category; its books keep it in their history and show "No category". */
export async function archiveCategory(tx: Tx, ctx: SchoolContext, id: string) {
  const c = await tx.libraryCategory.findFirst({ where: { id, archivedAt: null } });
  if (!c) throw new LibraryProblem("This category was not found.");
  const used = await tx.book.count({ where: { categoryId: id, archivedAt: null } });
  if (used) throw new LibraryProblem(`${used} book${used === 1 ? " is" : "s are"} in ${c.name}. Move ${used === 1 ? "it" : "them"} to another category first.`);
  await tx.libraryCategory.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Library Category", recordId: id, before: { name: c.name } });
}
