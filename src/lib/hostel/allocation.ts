// Allocation (15 §2): give a student a free bed (one active bed per student,
// the hostel matched to their gender), check in, move to another bed (the
// history is kept) and check out with a reason (the bed becomes free).
// Hostel fees follow the bed: allocating adds the hostel fee plan's
// installments to the student's fees in Fee Management (from the installment
// that covers the first night); checking out stops them from the next
// installment. Fees already paid are kept and never removed here.
import "server-only";

import type { BedAllocation, Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate, formatRupees } from "../format";
import { addCharge, removeDue } from "../fees/structure";
import { enrolmentsOf } from "../front-office/pickup";
import { STUDYING } from "../students/labels";
import { HostelProblem } from "./problem";
import { feePlans, planForRoom, type FeePlan } from "./settings";
import { BASE, GENDER, bedRoom, bedWords, bedYearOf, genderFits, isoOf, type BedYear, type ResidentStatus } from "./words";

const ZERO = BigInt(0);

export type StudentInfo = { id: string; name: string; first: string; admissionNo: string; photoFileId: string | null; gender: string | null; classSection: string | null; sectionId: string | null; status: string; campusId: string };

/**
 * Names, classes and genders of these students: this year's class and
 * section, or, for a student admitted for a later year (no class this year
 * yet), that year's class with the year's name.
 */
export async function studentsInfo(tx: Tx, ctx: SchoolContext, ids: string[]): Promise<Map<string, StudentInfo>> {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return new Map();
  const [rows, enr] = await Promise.all([
    tx.student.findMany({ where: { id: { in: uniq } }, select: { id: true, fullName: true, firstName: true, admissionNo: true, photoFileId: true, gender: true, status: true, campusId: true } }),
    enrolmentsOf(tx, ctx, uniq),
  ]);
  const later = await laterClasses(tx, uniq.filter((id) => !enr.has(id)));
  return new Map(rows.map((r) => {
    const now = enr.get(r.id);
    const next = later.get(r.id);
    return [r.id, { id: r.id, name: r.fullName, first: r.firstName, admissionNo: r.admissionNo, photoFileId: r.photoFileId, gender: r.gender, classSection: now?.label ?? next?.label ?? null, sectionId: now?.sectionId ?? next?.sectionId ?? null, status: r.status, campusId: r.campusId }];
  }));
}

/** The class of students with no class this year in the first later (Upcoming) year they have one: "1 A, 2027-28". */
async function laterClasses(tx: Tx, ids: string[]) {
  const out = new Map<string, { label: string; sectionId: string }>();
  if (!ids.length) return out;
  const years = await tx.academicYear.findMany({ where: { status: "UPCOMING", archivedAt: null }, orderBy: { startDate: "asc" }, select: { id: true, name: true } });
  if (!years.length) return out;
  const rows = await tx.enrolment.findMany({ where: { studentId: { in: ids }, archivedAt: null, status: { not: "LEFT" }, academicYearId: { in: years.map((y) => y.id) } }, select: { studentId: true, sectionId: true, academicYearId: true } });
  const sections = await tx.section.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.sectionId))] } }, select: { id: true, name: true, schoolClass: { select: { name: true } } } });
  for (const y of years) {
    for (const r of rows.filter((x) => x.academicYearId === y.id)) {
      const sec = sections.find((x) => x.id === r.sectionId);
      if (out.has(r.studentId) || !sec) continue;
      out.set(r.studentId, { label: `${sec.schoolClass.name.replace(/^Class\s+/i, "")} ${sec.name}, ${y.name}`, sectionId: sec.id });
    }
  }
  return out;
}

/**
 * The school years each student has a class in (not left, year not closed),
 * for choosing the year a bed belongs to (words.ts bedYearOf): this year's,
 * and next year's for a student promoted or admitted for next year.
 */
export async function bedYears(tx: Tx, ids: string[]): Promise<Map<string, BedYear[]>> {
  const out = new Map<string, BedYear[]>(ids.map((id) => [id, []]));
  if (!ids.length) return out;
  const rows = await tx.enrolment.findMany({ where: { studentId: { in: [...new Set(ids)] }, archivedAt: null, status: { not: "LEFT" } }, select: { studentId: true, academicYearId: true } });
  const years = await tx.academicYear.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.academicYearId))] }, status: { not: "CLOSED" }, archivedAt: null } });
  for (const r of rows) {
    const y = years.find((x) => x.id === r.academicYearId);
    const list = out.get(r.studentId)!;
    if (!y || list.some((x) => x.id === y.id)) continue;
    list.push({ id: y.id, name: y.name, start: isoOf(y.startDate), end: isoOf(y.endDate) });
  }
  for (const list of out.values()) list.sort((a, b) => a.start.localeCompare(b.start));
  return out;
}

/** The bed a student has now, if any, with its room and hostel. */
export async function activeBedOf(tx: Tx, studentId: string) {
  const a = await tx.bedAllocation.findFirst({ where: { studentId, status: "ACTIVE" } });
  if (!a) return null;
  const [room, bed, hostel] = await Promise.all([
    tx.hostelRoom.findUnique({ where: { id: a.roomId } }),
    tx.hostelBed.findUnique({ where: { id: a.bedId } }),
    tx.hostel.findUnique({ where: { id: a.hostelId } }),
  ]);
  return { allocation: a, room: room!, bed: bed!, hostel: hostel!, words: bedWords(room!.roomNo, bed!.bedNo), short: bedRoom(room!.roomNo, bed!.bedNo) };
}

async function freeBed(tx: Tx, bedId: string) {
  const bed = await tx.hostelBed.findFirst({ where: { id: bedId, archivedAt: null }, include: { room: true } });
  if (!bed || bed.room.archivedAt) throw new HostelProblem("Choose a free bed.", "bedId");
  const hostel = await tx.hostel.findFirst({ where: { id: bed.hostelId, archivedAt: null } });
  if (!hostel) throw new HostelProblem("This hostel is closed. Choose a bed in another hostel.", "bedId");
  if (bed.blockedAt) throw new HostelProblem(`${bedWords(bed.room.roomNo, bed.bedNo)} is blocked for repair. Choose another free bed.`, "bedId");
  const taken = await tx.bedAllocation.findFirst({ where: { bedId: bed.id, status: "ACTIVE" } });
  if (taken) throw new HostelProblem(`${bedWords(bed.room.roomNo, bed.bedNo)} was just given to someone else. Choose another free bed.`, "bedId");
  return { bed, room: bed.room, hostel };
}

/** "Girls' hostel. Choose the boys' hostel." when the student's gender does not fit the hostel. */
function assertGender(hostel: { gender: "BOYS" | "GIRLS" }, student: { gender: string | null }) {
  const fits = genderFits(student.gender);
  if (fits && fits !== hostel.gender) throw new HostelProblem(`${GENDER[hostel.gender].label}. Choose the ${GENDER[fits].student}' hostel.`, "bedId");
}

/* ---------- Hostel fees ---------- */

/**
 * Adds a plan's installments to the student's fees: the installment that
 * covers `from` and every later one (or, after a move, only those due after
 * `from`). Each becomes a row of the student's fees in Fee Management.
 */
async function addFees(tx: Tx, ctx: SchoolContext, a: BedAllocation, plan: FeePlan, from: Date, opts: { onlyAfter?: boolean } = {}) {
  const list = plan.installments;
  const firstLater = list.findIndex((i) => i.dueDate.getTime() > from.getTime());
  const start = opts.onlyAfter ? (firstLater < 0 ? list.length : firstLater) : Math.max(0, (firstLater < 0 ? list.length : firstLater) - 1);
  const chosen = list.slice(start);
  // A student who already has a row for an installment (moved within the same plan) is not charged twice.
  const had = new Set((await tx.hostelFeeCharge.findMany({ where: { studentId: a.studentId, state: { in: ["ADDED", "KEPT"] }, installmentId: { in: chosen.map((i) => i.id) } }, select: { installmentId: true } })).map((c) => c.installmentId));
  let total = ZERO;
  let rows = 0;
  for (const i of chosen) {
    if (had.has(i.id)) continue;
    const dueDate = i.dueDate.getTime() < from.getTime() ? from : i.dueDate;
    const due = await addCharge(tx, ctx, {
      studentId: a.studentId, feeHeadId: plan.feeHeadId, amountPaise: i.amountPaise, dueDate, academicYearId: plan.academicYearId,
      label: `Hostel fee: ${i.label}`.slice(0, 120), reason: `Hostel bed from ${formatDate(from, "UTC")}, ${plan.name}`,
    });
    await tx.hostelFeeCharge.create({ data: { schoolId: ctx.schoolId, allocationId: a.id, installmentId: i.id, studentId: a.studentId, dueId: due.id } });
    total += i.amountPaise;
    rows++;
  }
  return { total, rows };
}

/**
 * Stops a student's hostel fees due after `after`: unpaid rows are removed
 * from their fees with the reason; rows already paid (or with a concession)
 * are kept and listed, so the office can refund in Fee Management if needed.
 */
async function stopFees(tx: Tx, ctx: SchoolContext, studentId: string, after: Date, reason: string, onlyAllocationIds?: string[]) {
  const charges = await tx.hostelFeeCharge.findMany({ where: { studentId, state: "ADDED", ...(onlyAllocationIds ? { allocationId: { in: onlyAllocationIds } } : {}) } });
  const dues = await tx.studentFeeDue.findMany({ where: { id: { in: charges.map((c) => c.dueId) } } });
  let stopped = ZERO;
  let kept = ZERO;
  let stoppedRows = 0;
  for (const c of charges) {
    const d = dues.find((x) => x.id === c.dueId);
    if (!d || d.dueDate.getTime() <= after.getTime()) continue;
    if (d.state === "REMOVED") {
      await tx.hostelFeeCharge.update({ where: { id: c.id }, data: { state: "STOPPED", stoppedAt: new Date(), stoppedReason: "Removed in Fee Management" } });
      continue;
    }
    const concession = await tx.concessionLine.count({ where: { dueId: d.id } });
    if (d.paidPaise > ZERO || concession > 0) {
      await tx.hostelFeeCharge.update({ where: { id: c.id }, data: { state: "KEPT", stoppedAt: new Date(), stoppedReason: d.paidPaise > ZERO ? "Already paid" : "Has a concession" } });
      kept += d.amountPaise;
      continue;
    }
    await removeDue(tx, ctx, d.id, reason);
    await tx.hostelFeeCharge.update({ where: { id: c.id }, data: { state: "STOPPED", stoppedAt: new Date(), stoppedReason: reason } });
    stopped += d.amountPaise;
    stoppedRows++;
  }
  return { stopped, kept, stoppedRows };
}

/** Hostel fees still to pay that were due on or before a date (the check-out warning). */
export async function hostelFeesDue(tx: Tx, studentId: string, onOrBefore: Date) {
  const charges = await tx.hostelFeeCharge.findMany({ where: { studentId, state: { in: ["ADDED", "KEPT"] } }, select: { dueId: true } });
  if (!charges.length) return ZERO;
  const ids = charges.map((c) => c.dueId);
  const [own, late] = await Promise.all([
    tx.studentFeeDue.aggregate({ where: { id: { in: ids }, state: "OPEN", dueDate: { lte: onOrBefore } }, _sum: { balancePaise: true } }),
    tx.studentFeeDue.aggregate({ where: { parentDueId: { in: ids }, state: "OPEN" }, _sum: { balancePaise: true } }),
  ]);
  return (own._sum.balancePaise ?? ZERO) + (late._sum.balancePaise ?? ZERO);
}

/* ---------- Allocate, check in, move, check out ---------- */

export type AllocateInput = { studentId: string; bedId: string; startDate: Date; checkedIn: boolean; feePlanId: string | "none"; note: string | null };

/**
 * Gives a student a free bed. Any studying student can have one: a student
 * admitted today, or admitted for next year (their class only in next year),
 * whose bed then starts on the day they join. The bed belongs to the school
 * year of the student's class on its first night (bedYearOf), and the hostel
 * fee plan must be that year's. `today` (the school's day): a bed starting
 * later cannot be "checked in now".
 */
export async function allocate(tx: Tx, ctx: SchoolContext, input: AllocateInput, opts: { now: Date; today?: Date; assertHostel: (hostelId: string | null) => void }) {
  const student = await tx.student.findFirst({ where: { id: input.studentId, archivedAt: null } });
  if (!student) throw new HostelProblem("Choose the student.", "studentId");
  if (!(STUDYING as readonly string[]).includes(student.status)) throw new HostelProblem(`${student.fullName} is not studying at the school now.`, "studentId");
  const has = await activeBedOf(tx, student.id);
  if (has) throw new HostelProblem(`${student.firstName} already has ${has.short}`, "studentId", { href: `${BASE}/allocation?move=${has.allocation.id}`, label: "Move instead" });
  const { bed, room, hostel } = await freeBed(tx, input.bedId);
  opts.assertHostel(hostel.id);
  assertGender(hostel, student);
  // The year of the student's class on the bed's first night (campuses start the year on different dates; a new student may be admitted for next year).
  const years = (await bedYears(tx, [student.id])).get(student.id) ?? [];
  if (!years.length) throw new HostelProblem(`${student.fullName} is not in a class. Add them to a class first.`, "studentId");
  const by = bedYearOf(years, isoOf(input.startDate));
  if (!by) throw new HostelProblem(`${student.firstName}'s class is for ${years.map((y) => y.name).join(" and ")}. Give the bed from a day in ${years.length === 1 ? "that year" : "those years"}, or promote ${student.firstName} first.`, "startDate");
  const year = await tx.academicYear.findUniqueOrThrow({ where: { id: by.id } });
  if (input.checkedIn && opts.today && input.startDate.getTime() > opts.today.getTime()) {
    throw new HostelProblem(`The bed starts on ${formatDate(input.startDate, "UTC")}. Turn off “Checked in now” and check ${student.firstName} in on arrival.`, "startDate");
  }

  let plan: FeePlan | null = null;
  if (input.feePlanId !== "none") {
    // A hostel fee plan belongs to one campus's year: the year the bed belongs to.
    plan = (await feePlans(tx, year.id)).find((p) => p.id === input.feePlanId) ?? null;
    if (!plan) {
      const elsewhere = await tx.hostelFeePlan.findFirst({ where: { id: input.feePlanId, archivedAt: null }, select: { name: true, academicYearId: true } });
      const other = elsewhere ? await tx.academicYear.findUnique({ where: { id: elsewhere.academicYearId }, select: { name: true, campusId: true } }) : null;
      throw new HostelProblem(
        !elsewhere ? "Choose the hostel fee plan, or No hostel fees."
          : other && other.campusId !== year.campusId ? `“${elsewhere.name}” is for another campus’s school year. Choose a plan of ${student.firstName}’s campus, or No hostel fees.`
            : `“${elsewhere.name}” is for ${other?.name ?? "another year"}, and this bed is for ${year.name}. Choose a ${year.name} plan, or No hostel fees.`,
        "feePlanId",
      );
    }
    if (plan.hostelId && plan.hostelId !== hostel.id) throw new HostelProblem(`“${plan.name}” is for another hostel. Choose the plan for ${hostel.name}.`, "feePlanId");
  }

  const a = await tx.bedAllocation.create({
    data: {
      schoolId: ctx.schoolId, studentId: student.id, hostelId: hostel.id, roomId: room.id, bedId: bed.id, academicYearId: year.id,
      startDate: input.startDate, checkedInAt: input.checkedIn ? opts.now : null, checkInById: input.checkedIn ? ctx.userId : null,
      feePlanId: plan?.id ?? null, note: input.note, createdById: ctx.userId,
    },
  });
  const fees = plan ? await addFees(tx, ctx, a, plan, input.startDate) : { total: ZERO, rows: 0 };
  const where = bedWords(room.roomNo, bed.bedNo);
  await writeAudit(tx, ctx, {
    action: "allocated", recordType: "Bed Allocation", recordId: a.id,
    after: { student: student.fullName, hostel: hostel.name, bed: where, from: isoOf(input.startDate), checkedIn: input.checkedIn, feePlan: plan?.name ?? "No hostel fees", fees: formatRupees(fees.total) },
  });
  return { allocation: a, student, hostel, where, fees, plan };
}

export async function checkIn(tx: Tx, ctx: SchoolContext, allocationId: string, at: Date, assertHostelOf: (hostelId: string | null) => void) {
  const a = await tx.bedAllocation.findFirst({ where: { id: allocationId, status: "ACTIVE" } });
  if (!a) throw new HostelProblem("This student no longer has this bed.");
  assertHostelOf(a.hostelId);
  if (a.checkedInAt) throw new HostelProblem("Already checked in.");
  await tx.bedAllocation.update({ where: { id: a.id }, data: { checkedInAt: at, checkInById: ctx.userId } });
  const student = await tx.student.findUnique({ where: { id: a.studentId }, select: { fullName: true } });
  await writeAudit(tx, ctx, { action: "checked-in", recordType: "Bed Allocation", recordId: a.id, after: { student: student?.fullName, at: at.toISOString() } });
  return { name: student?.fullName ?? "The student" };
}

export type MoveInput = { allocationId: string; bedId: string; date: Date; reason: string };

export async function moveBed(tx: Tx, ctx: SchoolContext, input: MoveInput, opts: { now: Date; assertHostel: (hostelId: string | null) => void }) {
  const a = await tx.bedAllocation.findFirst({ where: { id: input.allocationId, status: "ACTIVE" } });
  if (!a) throw new HostelProblem("This student no longer has this bed. Refresh the page.");
  opts.assertHostel(a.hostelId);
  if (input.reason.trim().length < 3) throw new HostelProblem("Say why the student is moving.", "reason");
  if (input.bedId === a.bedId) throw new HostelProblem("Choose a different bed.", "bedId");
  if (input.date.getTime() < a.startDate.getTime()) throw new HostelProblem(`The move cannot be before the student got this bed (${formatDate(a.startDate, "UTC")}).`, "date");
  const student = await tx.student.findUniqueOrThrow({ where: { id: a.studentId } });
  const { bed, room, hostel } = await freeBed(tx, input.bedId);
  opts.assertHostel(hostel.id);
  assertGender(hostel, student);
  const [oldRoom, oldBed] = await Promise.all([tx.hostelRoom.findUniqueOrThrow({ where: { id: a.roomId } }), tx.hostelBed.findUniqueOrThrow({ where: { id: a.bedId } })]);

  // The fee plan for the new bed: unchanged when the same plan covers it.
  const plans = await feePlans(tx, a.academicYearId);
  const oldPlan = a.feePlanId ? plans.find((p) => p.id === a.feePlanId) ?? null : null;
  const newPlan = a.feePlanId ? planForRoom(plans, hostel.id, room.roomType) ?? oldPlan : null;

  await tx.bedAllocation.update({ where: { id: a.id }, data: { status: "MOVED", endDate: input.date, endedAt: opts.now, endedById: ctx.userId, endReason: input.reason.trim() } });
  const next = await tx.bedAllocation.create({
    data: {
      schoolId: ctx.schoolId, studentId: a.studentId, hostelId: hostel.id, roomId: room.id, bedId: bed.id, academicYearId: a.academicYearId,
      startDate: input.date, checkedInAt: a.checkedInAt ? opts.now : null, checkInById: a.checkedInAt ? ctx.userId : null,
      movedFromId: a.id, feePlanId: newPlan?.id ?? null, note: a.note, createdById: ctx.userId,
    },
  });
  await tx.bedAllocation.update({ where: { id: a.id }, data: { movedToId: next.id } });
  let feeChange: { stopped: bigint; added: bigint } | null = null;
  if (newPlan && oldPlan && newPlan.id !== oldPlan.id) {
    const s = await stopFees(tx, ctx, a.studentId, input.date, `Moved to ${bedWords(room.roomNo, bed.bedNo)} (${newPlan.name})`);
    const add = await addFees(tx, ctx, next, newPlan, input.date, { onlyAfter: true });
    feeChange = { stopped: s.stopped, added: add.total };
  }
  const from = bedWords(oldRoom.roomNo, oldBed.bedNo);
  const to = bedWords(room.roomNo, bed.bedNo);
  await writeAudit(tx, ctx, { action: "moved", recordType: "Bed Allocation", recordId: next.id, before: { bed: from }, after: { student: student.fullName, bed: to, hostel: hostel.name, reason: input.reason.trim(), fees: feeChange ? `${formatRupees(feeChange.stopped)} stopped, ${formatRupees(feeChange.added)} added` : "unchanged" } });
  return { name: student.fullName, from, to, feeChange };
}

export type CheckOutInput = { allocationId: string; date: Date; reason: string };

export async function checkOut(tx: Tx, ctx: SchoolContext, input: CheckOutInput, opts: { now: Date; assertHostel: (hostelId: string | null) => void }) {
  const a = await tx.bedAllocation.findFirst({ where: { id: input.allocationId, status: "ACTIVE" } });
  if (!a) throw new HostelProblem("This student no longer has this bed. Refresh the page.");
  opts.assertHostel(a.hostelId);
  if (input.reason.trim().length < 3) throw new HostelProblem("Say why the student is leaving the hostel.", "reason");
  if (input.date.getTime() < a.startDate.getTime()) throw new HostelProblem(`Check-out cannot be before the student got this bed (${formatDate(a.startDate, "UTC")}).`, "date");
  const out = await tx.gatePass.findFirst({ where: { kind: "HOSTEL_OUTING", studentId: a.studentId, status: "OUT", archivedAt: null } });
  const student = await tx.student.findUniqueOrThrow({ where: { id: a.studentId } });
  if (out) throw new HostelProblem(`${student.firstName} is out on pass ${out.passNo}. Mark them returned first, or check out after they are back.`);
  const [room, bed] = await Promise.all([tx.hostelRoom.findUniqueOrThrow({ where: { id: a.roomId } }), tx.hostelBed.findUniqueOrThrow({ where: { id: a.bedId } })]);
  // Warning only: fees due are collected in Fee Management; clearance happens in Leaving & Alumni.
  const dueBefore = await hostelFeesDue(tx, a.studentId, input.date);
  await tx.bedAllocation.update({ where: { id: a.id }, data: { status: "CHECKED_OUT", endDate: input.date, endedAt: opts.now, endedById: ctx.userId, endReason: input.reason.trim() } });
  const fees = await stopFees(tx, ctx, a.studentId, input.date, `Checked out of the hostel on ${formatDate(input.date, "UTC")}: ${input.reason.trim()}`);
  const where = bedWords(room.roomNo, bed.bedNo);
  await writeAudit(tx, ctx, { action: "checked-out", recordType: "Bed Allocation", recordId: a.id, before: { bed: where }, after: { student: student.fullName, date: isoOf(input.date), reason: input.reason.trim(), feesStopped: formatRupees(fees.stopped), feesKept: formatRupees(fees.kept), dueAtCheckout: formatRupees(dueBefore) } });
  return { name: student.fullName, first: student.firstName, where, fees, dueBefore };
}

/* ---------- Residents ---------- */

export type Resident = {
  allocation: BedAllocation; student: StudentInfo; hostelName: string; roomNo: string; floor: string; bedNo: number;
  status: ResidentStatus; passId: string | null; passNo: string | null; backBy: Date | null;
};

/** Gate passes out now (Hostel Outing kind) for these students, by student. */
export async function outNow(tx: Tx, studentIds?: string[]) {
  const rows = await tx.gatePass.findMany({ where: { kind: "HOSTEL_OUTING", status: "OUT", archivedAt: null, ...(studentIds ? { studentId: { in: studentIds } } : {}) } });
  return new Map(rows.map((p) => [p.studentId, p]));
}

export function residentStatus(a: Pick<BedAllocation, "status" | "checkedInAt">, pass: { outingType: string | null; toAt: Date | null } | undefined, now: Date): ResidentStatus {
  if (a.status !== "ACTIVE") return "OUT";
  if (!a.checkedInAt) return "NOT_ARRIVED";
  if (pass) {
    if (pass.toAt && pass.toAt.getTime() < now.getTime()) return "LATE";
    return pass.outingType === "LEAVE" ? "LEAVE" : "OUTING";
  }
  return "IN";
}

/** Residents (active allocations, or checked out within the filter) of these hostels with their status. */
export async function residents(tx: Tx, ctx: SchoolContext, where: Prisma.BedAllocationWhereInput, now: Date, opts: { take?: number; skip?: number } = {}) {
  const rows = await tx.bedAllocation.findMany({ where, orderBy: [{ status: "asc" }, { startDate: "desc" }, { id: "asc" }], take: opts.take, skip: opts.skip });
  const [info, rooms, beds, hostels, passes] = await Promise.all([
    studentsInfo(tx, ctx, rows.map((r) => r.studentId)),
    tx.hostelRoom.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.roomId))] } }, select: { id: true, roomNo: true, floor: true } }),
    tx.hostelBed.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.bedId))] } }, select: { id: true, bedNo: true } }),
    tx.hostel.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.hostelId))] } }, select: { id: true, name: true } }),
    outNow(tx, rows.map((r) => r.studentId)),
  ]);
  const out: Resident[] = [];
  for (const a of rows) {
    const s = info.get(a.studentId);
    if (!s) continue;
    const r = rooms.find((x) => x.id === a.roomId);
    const p = a.status === "ACTIVE" ? passes.get(a.studentId) : undefined;
    out.push({
      allocation: a, student: s, hostelName: hostels.find((h) => h.id === a.hostelId)?.name ?? "Hostel", roomNo: r?.roomNo ?? "?", floor: r?.floor ?? "", bedNo: beds.find((b) => b.id === a.bedId)?.bedNo ?? 0,
      status: residentStatus(a, p, now), passId: p?.id ?? null, passNo: p?.passNo ?? null, backBy: p?.toAt ?? null,
    });
  }
  return out;
}

/**
 * Waiting for a bed (inferred): students admitted with "hostel needed" in
 * their admission preferences who have never had a bed, including students
 * admitted for next year (status Admitted until they join). Each shows the
 * application it was asked on, when, the day the student joins and the years
 * of their class, so the warden can give the bed from the right day.
 */
export async function waitingForBed(tx: Tx, ctx: SchoolContext) {
  const apps = await tx.application.findMany({ where: { preferences: { path: ["hostelNeeded"], equals: true }, studentId: { not: null } }, select: { id: true, applicationNo: true, createdAt: true } });
  if (!apps.length) return [];
  const students = await tx.student.findMany({ where: { applicationId: { in: apps.map((a) => a.id) }, status: { in: [...STUDYING] }, archivedAt: null }, select: { id: true, applicationId: true, joiningDate: true } });
  const had = new Set((await tx.bedAllocation.findMany({ where: { studentId: { in: students.map((s) => s.id) } }, select: { studentId: true } })).map((r) => r.studentId));
  const left = students.filter((s) => !had.has(s.id));
  const [info, years] = await Promise.all([studentsInfo(tx, ctx, left.map((s) => s.id)), bedYears(tx, left.map((s) => s.id))]);
  return left.filter((s) => info.has(s.id)).map((s) => {
    const app = apps.find((a) => a.id === s.applicationId);
    return { ...info.get(s.id)!, askedAt: app?.createdAt ?? null, applicationNo: app?.applicationNo ?? null, joins: s.joiningDate, years: years.get(s.id) ?? [] };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** The "hostel needed" asked on a student's admission application, if any (for the hostel tab of the profile). */
export async function hostelAsked(tx: Tx, studentId: string) {
  const s = await tx.student.findFirst({ where: { id: studentId }, select: { applicationId: true } });
  if (!s?.applicationId) return null;
  return tx.application.findFirst({ where: { id: s.applicationId, preferences: { path: ["hostelNeeded"], equals: true } }, select: { applicationNo: true, createdAt: true } });
}

/** A student's beds over time (newest first), for the bed history. */
export async function bedHistory(tx: Tx, studentId: string) {
  const rows = await tx.bedAllocation.findMany({ where: { studentId }, orderBy: { startDate: "desc" } });
  const [rooms, beds, hostels] = await Promise.all([
    tx.hostelRoom.findMany({ where: { id: { in: rows.map((r) => r.roomId) } }, select: { id: true, roomNo: true } }),
    tx.hostelBed.findMany({ where: { id: { in: rows.map((r) => r.bedId) } }, select: { id: true, bedNo: true } }),
    tx.hostel.findMany({ where: { id: { in: rows.map((r) => r.hostelId) } }, select: { id: true, name: true } }),
  ]);
  return rows.map((r) => ({
    ...r, hostelName: hostels.find((h) => h.id === r.hostelId)?.name ?? "Hostel",
    where: bedWords(rooms.find((x) => x.id === r.roomId)?.roomNo ?? "?", beds.find((b) => b.id === r.bedId)?.bedNo ?? 0),
  }));
}
