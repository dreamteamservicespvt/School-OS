// Defaulters (06 §2): students with overdue fees, how long overdue (in the
// school's ageing groups), and the reminders already sent. Also the call log.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { DAY_MS } from "../staff/dates";
import { MoneyProblem } from "./problem";
import { classOfStudents } from "./dues";
import { ageingGroupOf, featureOn, feeSettings } from "./settings";
import { PROMISE_FEATURE, promisesOf, recordPromise, type PromiseView } from "./promises";
import { studentScope, type FeeViewer } from "./access";
import { ageingLabel, type AgeingGroup } from "./words";
import { studentIdsMatching } from "../students/find";
import { OPEN_LINK } from "../students/guardian-access";

const ZERO = BigInt(0);

export type DefaulterFilter = {
  classId?: string | null;
  sectionId?: string | null;
  feeHeadId?: string | null;
  /** Index of the ageing group. */
  ageing?: number | null;
  amountAbove?: bigint | null;
  reminded?: "yes" | "no" | null;
  q?: string | null;
  /** Only students whose oldest overdue row fell due in these days (the shared date filter). */
  oldestFrom?: Date | null;
  oldestTo?: Date | null;
};

export type DefaulterRow = {
  studentId: string;
  name: string;
  admissionNo: string;
  classId: string | null;
  sectionId: string | null;
  classLabel: string;
  className: string;
  parentName: string | null;
  phone: string | null;
  optedOut: boolean;
  overduePaise: bigint;
  oldestDue: Date;
  daysOverdue: number;
  ageing: AgeingGroup | null;
  ageingIndex: number;
  lastReminder: Date | null;
  reminders: number;
  promisedOn: Date | null;
  /** The current Promise to Pay (latest call note), while Promise to Pay is on. */
  promise: PromiseView | null;
  /** The fee heads overdue, like "Tuition fee, Late fee". */
  heads: string;
};

/** Every student with overdue fees for one search and fee head, before the other filters (see defaulterLists). */
async function defaulterBase(tx: Tx, ctx: SchoolContext, viewer: FeeViewer, today: Date, f: Pick<DefaulterFilter, "q" | "feeHeadId">) {
  const settings = await feeSettings(tx, ctx);
  const where: Prisma.StudentFeeDueWhereInput = {
    state: "OPEN",
    balancePaise: { gt: 0 },
    dueDate: { lt: today },
    broughtIn: undefined,
    ...(f.feeHeadId ? { feeHeadId: f.feeHeadId } : {}),
  };
  const scope = studentScope(viewer);
  const studentWhere: Prisma.StudentWhereInput = {
    archivedAt: null,
    ...scope,
    // The one student search: name with one letter wrong, admission or roll number, parent name or phone.
    ...(f.q ? { id: { in: await studentIdsMatching(tx, f.q, { scope, yearId: viewer.yearIds, statuses: "any" }) } } : {}),
  };
  const students = await tx.student.findMany({ where: studentWhere, select: { id: true, fullName: true, admissionNo: true } });
  const sIds = students.map((s) => s.id);
  const dues = await tx.studentFeeDue.findMany({ where: { ...where, studentId: { in: sIds } }, select: { studentId: true, balancePaise: true, dueDate: true, feeHeadId: true, kind: true } });
  const headNames = new Map((await tx.feeHead.findMany({ where: { id: { in: [...new Set(dues.map((d) => d.feeHeadId))] } }, select: { id: true, name: true } })).map((h) => [h.id, h.name]));
  const headOf = (d: { kind: string; feeHeadId: string }) => (d.kind === "LATE_FEE" ? "Late fee" : headNames.get(d.feeHeadId) ?? "Fees");
  const byStudent = new Map<string, { overdue: bigint; oldest: Date; heads: Set<string> }>();
  for (const d of dues) {
    const cur = byStudent.get(d.studentId);
    if (cur) {
      cur.overdue += d.balancePaise;
      if (d.dueDate < cur.oldest) cur.oldest = d.dueDate;
      cur.heads.add(headOf(d));
    } else byStudent.set(d.studentId, { overdue: d.balancePaise, oldest: d.dueDate, heads: new Set([headOf(d)]) });
  }
  const ids = [...byStudent.keys()];
  // Each student's class in their own campus's current year.
  const classes = await classOfStudents(tx, ids, viewer.yearIds);
  // The first parent in this order is the one shown; only what the list shows is read.
  const guardians = await tx.studentGuardian.findMany({ where: { studentId: { in: ids }, ...OPEN_LINK }, select: { studentId: true, guardian: { select: { name: true, phone: true, optedOut: true } } }, orderBy: [{ isPrimary: "desc" }, { emergencyOrder: "asc" }] });
  const parentOf = new Map<string, (typeof guardians)[number]["guardian"]>();
  for (const g of guardians) if (!parentOf.has(g.studentId)) parentOf.set(g.studentId, g.guardian);
  const reminders = new Map((await tx.feeReminder.groupBy({ by: ["studentId"], where: { studentId: { in: ids } }, _count: { _all: true }, _max: { sentAt: true } })).map((r) => [r.studentId, r]));
  // The latest call note with a promised date (newest first).
  const promisedOn = new Map<string, Date | null>();
  for (const n of await tx.feeCallNote.findMany({ where: { studentId: { in: ids }, promisedOn: { not: null } }, orderBy: { createdAt: "desc" }, select: { studentId: true, promisedOn: true } })) {
    if (!promisedOn.has(n.studentId)) promisedOn.set(n.studentId, n.promisedOn);
  }
  const promises = await promisesOf(tx, ctx, ids, today);
  const rows: DefaulterRow[] = [];
  for (const s of students) {
    const info = byStudent.get(s.id);
    if (!info) continue;
    const c = classes.get(s.id);
    const days = Math.floor((today.getTime() - info.oldest.getTime()) / DAY_MS);
    const group = ageingGroupOf(settings.ageing, days);
    const index = group ? settings.ageing.indexOf(group) : -1;
    const r = reminders.get(s.id);
    const g = parentOf.get(s.id) ?? null;
    rows.push({
      studentId: s.id,
      name: s.fullName,
      admissionNo: s.admissionNo,
      classId: c?.classId ?? null,
      sectionId: c?.sectionId ?? null,
      classLabel: c?.label ?? "No class",
      className: c?.className ?? "No class",
      parentName: g?.name ?? null,
      phone: g?.phone ?? null,
      optedOut: g?.optedOut ?? false,
      overduePaise: info.overdue,
      oldestDue: info.oldest,
      daysOverdue: days,
      ageing: group,
      ageingIndex: index,
      lastReminder: r?._max.sentAt ?? null,
      reminders: r?._count._all ?? 0,
      promisedOn: promisedOn.get(s.id) ?? null,
      promise: promises.get(s.id) ?? null,
      heads: [...info.heads].join(", "),
    });
  }
  // The call list order: a broken promise first (call them again), then the longest overdue; families with an open promise last.
  rows.sort((a, b) => callOrder(a) - callOrder(b) || b.daysOverdue - a.daysOverdue || Number(b.overduePaise - a.overduePaise));
  return { rows, ageing: settings.ageing };
}

/** The rows that pass the list's own filters, with totals by class and by ageing group. */
async function pickDefaulters(tx: Tx, base: Awaited<ReturnType<typeof defaulterBase>>, f: DefaulterFilter) {
  const rows = base.rows.filter((r) =>
    !(f.classId && r.classId !== f.classId) &&
    !(f.sectionId && r.sectionId !== f.sectionId) &&
    !(f.amountAbove && r.overduePaise < f.amountAbove) &&
    !(f.oldestFrom && r.oldestDue < f.oldestFrom) &&
    !(f.oldestTo && r.oldestDue > f.oldestTo) &&
    !(f.ageing !== null && f.ageing !== undefined && f.ageing !== r.ageingIndex) &&
    !(f.reminded === "yes" && !r.reminders) &&
    !(f.reminded === "no" && r.reminders));
  // Totals by class, and by ageing group.
  const byClass = new Map<string, { classId: string | null; className: string; amount: bigint; students: number }>();
  for (const r of rows) {
    const k = r.classId ?? "none";
    const cur = byClass.get(k) ?? { classId: r.classId, className: r.className, amount: ZERO, students: 0 };
    cur.amount += r.overduePaise;
    cur.students++;
    byClass.set(k, cur);
  }
  const classOrder = new Map((await tx.schoolClass.findMany({ where: { id: { in: [...byClass.values()].map((c) => c.classId).filter((x): x is string => Boolean(x)) } }, select: { id: true, sortOrder: true } })).map((c) => [c.id, c.sortOrder]));
  const orderOf = (id: string | null) => (id ? classOrder.get(id) : undefined) ?? 999;
  const classTotals = [...byClass.values()].sort((a, b) => orderOf(a.classId) - orderOf(b.classId));
  const ageingTotals = base.ageing.map((g, i) => ({ index: i, label: ageingLabel(g), amount: rows.filter((r) => r.ageingIndex === i).reduce((s, r) => s + r.overduePaise, ZERO), students: rows.filter((r) => r.ageingIndex === i).length }));
  const total = rows.reduce((s, r) => s + r.overduePaise, ZERO);
  return { rows, classTotals, ageingTotals, total, ageing: base.ageing };
}

export async function defaulters(tx: Tx, ctx: SchoolContext, viewer: FeeViewer, today: Date, f: DefaulterFilter = {}) {
  return pickDefaulters(tx, await defaulterBase(tx, ctx, viewer, today, f), f);
}

/**
 * Several lists at once, such as the whole list and the filtered one on the
 * Defaulters page: lists with the same search and fee head share one read
 * (G37: a big school's defaulters took seconds to read, and the page read them twice).
 */
export async function defaulterLists(tx: Tx, ctx: SchoolContext, viewer: FeeViewer, today: Date, filters: DefaulterFilter[]) {
  const bases = new Map<string, Promise<Awaited<ReturnType<typeof defaulterBase>>>>();
  const out: Awaited<ReturnType<typeof defaulters>>[] = [];
  for (const f of filters) {
    const k = JSON.stringify([f.q ?? null, f.feeHeadId ?? null]);
    if (!bases.has(k)) bases.set(k, defaulterBase(tx, ctx, viewer, today, f));
    out.push(await pickDefaulters(tx, await bases.get(k)!, f));
  }
  return out;
}

/** 0 for a broken promise, 2 for an open one, else 1. */
export const callOrder = (r: Pick<DefaulterRow, "promise">) => (r.promise?.state === "BROKEN" ? 0 : r.promise?.state === "OPEN" ? 2 : 1);

/**
 * A note of a call with the family. With Promise to Pay on and a promised
 * date, it is a Promise to Pay (./promises.ts): the note is optional, an
 * amount may be given, and the date must be within 60 days.
 */
export async function addCallNote(tx: Tx, ctx: SchoolContext, input: { studentId: string; note: string; promisedOn: Date | null; amountPaise?: bigint | null; today: Date }) {
  if (input.promisedOn && (await featureOn(tx, ctx, PROMISE_FEATURE))) {
    return recordPromise(tx, ctx, { studentId: input.studentId, note: input.note, promisedOn: input.promisedOn, amountPaise: input.amountPaise ?? null, today: input.today });
  }
  if (input.amountPaise) throw new MoneyProblem("Give the date the family promised to pay, or leave the amount empty.", "promisedOn");
  if (input.note.trim().length < 3) throw new MoneyProblem("Write what was said, such as Called parent, promised by 15-10-2026.", "note");
  if (input.note.length > 500) throw new MoneyProblem("Note can be at most 500 characters.", "note");
  const n = await tx.feeCallNote.create({ data: { schoolId: ctx.schoolId, studentId: input.studentId, note: input.note.trim(), promisedOn: input.promisedOn, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "call-note", recordType: "Fee Call Note", recordId: n.id, after: { note: input.note, promisedOn: input.promisedOn?.toISOString().slice(0, 10) ?? null } });
  return n;
}
