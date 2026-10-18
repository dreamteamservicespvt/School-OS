// Year-end promotion (automation A13, 03 §2 "Promotion", workflow 11).
// Promotion adds a new Enrolment in the new year; last year's Enrolment stays
// exactly as it was apart from its status (04-data-model.md rule 4). A batch
// can be undone while nothing is recorded for those students in the new year.
import "server-only";

import type { PromotionDecisionKind } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatRupees } from "../format";
import { currentPolicy } from "./settings";
import { promotionFacts, runEnrolled, yearActivity, type PromotionFacts } from "./hooks";
import { applyStatus, StudentProblem } from "./students";
import { STUDYING } from "./labels";
// Modules that give promotion facts and year activity (./hooks.ts).
import "../attendance/student-hooks";

export type PreviewRow = {
  studentId: string;
  enrolmentId: string;
  fullName: string;
  admissionNo: string;
  rollNo: number | null;
  status: string;
  facts: PromotionFacts;
  suggested: PromotionDecisionKind;
  why: string;
  /** Set when the student is already in the target year (promoted before). */
  alreadyIn: string | null;
  leavingRequestId: string | null;
};

export type Preview = Awaited<ReturnType<typeof promotionPreview>>;

/** Next class in order on the same campus, or null for the final class. */
export async function nextClass(tx: Tx, classId: string) {
  const c = await tx.schoolClass.findUniqueOrThrow({ where: { id: classId } });
  return tx.schoolClass.findFirst({ where: { campusId: c.campusId, archivedAt: null, sortOrder: { gt: c.sortOrder } }, orderBy: { sortOrder: "asc" } });
}

/** The next academic year after this one (same campus), if it is set up. */
export async function nextYear(tx: Tx, yearId: string) {
  const y = await tx.academicYear.findUniqueOrThrow({ where: { id: yearId } });
  return tx.academicYear.findFirst({ where: { campusId: y.campusId, archivedAt: null, startDate: { gt: y.startDate } }, orderBy: { startDate: "asc" } });
}

export async function promotionPreview(tx: Tx, ctx: SchoolContext, q: { fromSectionId: string; toYearId?: string | null; toClassId?: string | null }) {
  const from = await tx.section.findFirst({ where: { id: q.fromSectionId, archivedAt: null }, include: { schoolClass: true, academicYear: true } });
  if (!from) throw new StudentProblem("Choose the class and section to promote.", "fromSectionId");
  if (from.academicYear.status === "CLOSED") throw new StudentProblem(`Locked: ${from.academicYear.name} is closed. Promotion is done before the year is closed.`, "fromSectionId");
  // The next year and class are on the class's own campus (each campus has its own years).
  const toYear = q.toYearId
    ? await tx.academicYear.findFirst({ where: { id: q.toYearId, archivedAt: null, campusId: from.academicYear.campusId } })
    : await nextYear(tx, from.academicYearId);
  if (!toYear) {
    const name = `${from.academicYear.startDate.getUTCFullYear() + 1}-${String((from.academicYear.startDate.getUTCFullYear() + 2) % 100).padStart(2, "0")}`;
    throw new StudentProblem(`${name} is not set up yet. Open it in Academic Management, then return.`, "toYearId");
  }
  if (toYear.status === "CLOSED") throw new StudentProblem(`${toYear.name} is closed. Choose an open year.`, "toYearId");
  if (toYear.startDate <= from.academicYear.startDate) throw new StudentProblem(`${toYear.name} is not after ${from.academicYear.name}. Choose the next year.`, "toYearId");

  const defaultNext = await nextClass(tx, from.classId);
  const toClass = q.toClassId ? await tx.schoolClass.findFirst({ where: { id: q.toClassId, archivedAt: null, campusId: from.schoolClass.campusId } }) : defaultNext;
  const finalClass = !defaultNext && !q.toClassId;

  const policy = await currentPolicy(tx, from.academicYearId);
  const rules = { passRequired: policy?.passRequired ?? true, minAttendancePct: policy?.minAttendancePct ?? null, feeDuesAllowed: policy?.feeDuesAllowed ?? true };

  const enrolments = await tx.enrolment.findMany({
    where: { sectionId: from.id, academicYearId: from.academicYearId, archivedAt: null, student: { archivedAt: null, status: { in: [...STUDYING] } } },
    include: { student: true },
    orderBy: [{ rollNo: "asc" }],
  });
  const ids = enrolments.map((e) => e.studentId);
  const { facts, hasProviders } = await promotionFacts(tx, ctx, ids, from.academicYearId);
  const inTarget = await tx.enrolment.findMany({ where: { studentId: { in: ids }, academicYearId: toYear.id, archivedAt: null }, include: { student: false } });
  const targetSections = toClass ? await tx.section.findMany({ where: { classId: toClass.id, academicYearId: toYear.id, archivedAt: null }, orderBy: { name: "asc" } }) : [];
  const sameClassTarget = await tx.section.findMany({ where: { classId: from.classId, academicYearId: toYear.id, archivedAt: null }, orderBy: { name: "asc" } });
  const allTargetIds = [...targetSections, ...sameClassTarget].map((s) => s.id);
  const inTargetSections = await tx.section.findMany({ where: { id: { in: inTarget.map((e) => e.sectionId) } }, include: { schoolClass: true } });
  const leaving = await tx.leavingRequest.findMany({ where: { studentId: { in: ids }, status: "IN_PROGRESS" } });

  const rows: PreviewRow[] = enrolments.map((e) => {
    const f = facts.get(e.studentId) ?? {};
    const already = inTarget.find((t) => t.studentId === e.studentId);
    const alreadySec = already ? inTargetSections.find((s) => s.id === already.sectionId) : null;
    const leave = leaving.find((l) => l.studentId === e.studentId);
    let suggested: PromotionDecisionKind = "PROMOTE";
    const why: string[] = [];
    if (leave) { suggested = "LEAVING"; why.push("leaving request in progress"); }
    else if (finalClass) { suggested = "LEAVING"; why.push("final class"); }
    else {
      if (rules.passRequired && f.result === "fail") { suggested = "DETAIN"; why.push("did not pass"); }
      if (rules.minAttendancePct !== null && f.attendancePct !== undefined && f.attendancePct !== null && f.attendancePct < rules.minAttendancePct) { suggested = "DETAIN"; why.push(`attendance ${f.attendancePct}% is below ${rules.minAttendancePct}%`); }
      if (!rules.feeDuesAllowed && f.feeDuePaise && f.feeDuePaise > BigInt(0)) { suggested = "DETAIN"; why.push(`${formatRupees(f.feeDuePaise)} fees due`); }
      if (suggested === "PROMOTE") why.push(f.result === "pass" ? "passed" : "meets the promotion policy");
    }
    return {
      studentId: e.studentId, enrolmentId: e.id, fullName: e.student.fullName, admissionNo: e.student.admissionNo, rollNo: e.rollNo, status: e.student.status,
      facts: f, suggested, why: why.join(", "),
      alreadyIn: already ? (alreadySec ? `${alreadySec.schoolClass.name} ${alreadySec.name}` : "the new year") : null,
      leavingRequestId: leave?.id ?? null,
    };
  });

  return {
    from: { id: from.id, label: `${from.schoolClass.name} ${from.name}`, name: from.name, classId: from.classId, className: from.schoolClass.name, year: from.academicYear },
    toYear,
    toClass,
    finalClass,
    targetSections: targetSections.map((s) => ({ id: s.id, name: s.name, seats: s.seats })),
    detainSections: sameClassTarget.map((s) => ({ id: s.id, name: s.name, seats: s.seats })),
    /** Default target: same section name; created on save when missing. */
    defaultSectionName: from.name,
    rules,
    policyVersion: policy?.version ?? null,
    hasFacts: hasProviders,
    rows,
    usedTargetIds: allTargetIds,
  };
}

export type DecisionInput = { studentId: string; decision: PromotionDecisionKind; toSectionId?: string | null; reason?: string | null };

async function targetSection(tx: Tx, ctx: SchoolContext, classId: string, yearId: string, name: string, copyFrom: { seats: number; classTeacherId: string | null; room: string | null }, created: string[]) {
  const found = await tx.section.findFirst({ where: { classId, academicYearId: yearId, name, archivedAt: null } });
  if (found) return found;
  const s = await tx.section.create({ data: { schoolId: ctx.schoolId, classId, academicYearId: yearId, name, seats: copyFrom.seats, classTeacherId: copyFrom.classTeacherId, room: copyFrom.room, createdById: ctx.userId } });
  created.push(s.id);
  await writeAudit(tx, ctx, { action: "created", recordType: "Section", recordId: s.id, after: { name, reason: "Made by year-end promotion for the new year" } });
  return s;
}

/** Saves a promotion batch (A13). Every changed decision needs a reason. */
export async function confirmPromotion(tx: Tx, ctx: SchoolContext, q: { fromSectionId: string; toYearId: string; toClassId?: string | null; decisions: DecisionInput[] }) {
  const p = await promotionPreview(tx, ctx, q);
  const byId = new Map(q.decisions.map((d) => [d.studentId, d]));
  const rows = p.rows.filter((r) => !r.alreadyIn);
  if (rows.length === 0) throw new StudentProblem(`Everyone in ${p.from.label} is already in ${p.toYear.name}. Nothing to promote.`);
  const problems: string[] = [];
  for (const r of rows) {
    const d = byId.get(r.studentId);
    if (!d) { problems.push(`Choose a decision for ${r.fullName}.`); continue; }
    if (d.decision !== r.suggested && !(d.reason && d.reason.trim().length >= 3)) problems.push(`Give a reason for ${r.fullName}: the suggestion was ${r.suggested.toLowerCase()}.`);
    if (d.decision === "PROMOTE" && !p.toClass) problems.push(`${p.from.className} is the final class, so ${r.fullName} cannot be promoted. Choose Leaving or Detain.`);
  }
  if (problems.length) throw new StudentProblem(problems.slice(0, 3).join(" ") + (problems.length > 3 ? ` And ${problems.length - 3} more.` : ""));

  const fromSection = await tx.section.findUniqueOrThrow({ where: { id: p.from.id } });
  const createdSections: string[] = [];
  const batch = await tx.promotionBatch.create({
    data: {
      schoolId: ctx.schoolId, fromYearId: p.from.year.id, fromSectionId: p.from.id, toYearId: p.toYear.id, toClassId: p.toClass?.id ?? p.from.classId,
      policyId: (await currentPolicy(tx, p.from.year.id))?.id ?? null, summary: "", confirmedById: ctx.userId,
    },
  });
  const counts = { PROMOTE: 0, DETAIN: 0, LEAVING: 0 };
  const sectionCounts = new Map<string, number>();
  const newYearStarted = p.toYear.status === "ACTIVE";

  for (const r of rows) {
    const d = byId.get(r.studentId)!;
    counts[d.decision]++;
    let toEnrolmentId: string | null = null;
    let toSectionId: string | null = null;
    let leavingRequestId: string | null = r.leavingRequestId;
    if (d.decision === "PROMOTE" || d.decision === "DETAIN") {
      const classId = d.decision === "PROMOTE" ? p.toClass!.id : p.from.classId;
      const allowed = d.decision === "PROMOTE" ? p.targetSections : p.detainSections;
      const chosen = d.toSectionId && allowed.some((s) => s.id === d.toSectionId)
        ? await tx.section.findUniqueOrThrow({ where: { id: d.toSectionId } })
        : await targetSection(tx, ctx, classId, p.toYear.id, p.defaultSectionName, fromSection, createdSections);
      toSectionId = chosen.id;
      // An enrolment archived by an earlier undo is reused, so the year keeps one row per student.
      const old = await tx.enrolment.findUnique({ where: { studentId_academicYearId: { studentId: r.studentId, academicYearId: p.toYear.id } } });
      const data = { classId, sectionId: chosen.id, rollNo: null, status: "STUDYING" as const, archivedAt: null, createdById: ctx.userId };
      const enr = old
        ? await tx.enrolment.update({ where: { id: old.id }, data })
        : await tx.enrolment.create({ data: { schoolId: ctx.schoolId, studentId: r.studentId, academicYearId: p.toYear.id, ...data } });
      toEnrolmentId = enr.id;
      await tx.enrolment.update({ where: { id: r.enrolmentId }, data: { status: d.decision === "PROMOTE" ? "PROMOTED" : "HELD_BACK" } });
      sectionCounts.set(chosen.id, (sectionCounts.get(chosen.id) ?? 0) + 1);
      if (d.decision === "PROMOTE") {
        await applyStatus(tx, ctx, r.studentId, newYearStarted ? "ACTIVE" : "PROMOTED", p.from.year.endDate, `Promoted to ${p.toClass!.name} ${chosen.name} (${p.toYear.name})`, `promotion:${batch.id}`);
      }
      await runEnrolled(tx, ctx, { studentId: r.studentId, enrolmentId: enr.id, academicYearId: p.toYear.id, classId, sectionId: chosen.id, how: "promoted", applyFeePlan: true });
    } else if (!leavingRequestId) {
      const lr = await tx.leavingRequest.create({
        data: {
          schoolId: ctx.schoolId, studentId: r.studentId, type: p.finalClass ? "GRADUATION" : "WITHDRAWAL",
          reason: d.reason?.trim() || (p.finalClass ? "Finished the last class" : "Leaving at year end"), lastDate: p.from.year.endDate,
          previousStatus: r.status, createdById: ctx.userId,
        },
      });
      leavingRequestId = lr.id;
    }
    await tx.promotionDecision.create({
      data: {
        schoolId: ctx.schoolId, batchId: batch.id, studentId: r.studentId, decision: d.decision, suggested: r.suggested,
        reason: d.reason?.trim() || null, facts: { ...r.facts, feeDuePaise: r.facts.feeDuePaise?.toString() ?? null },
        fromEnrolmentId: r.enrolmentId, toEnrolmentId, toSectionId, previousStatus: r.status, leavingRequestId,
      },
    });
  }

  // Roll numbers in the new sections, in name order, after anyone already there.
  for (const sectionId of sectionCounts.keys()) {
    const enr = await tx.enrolment.findMany({ where: { sectionId, academicYearId: p.toYear.id, archivedAt: null }, include: { student: { select: { fullName: true } } } });
    const numbered = enr.filter((e) => e.rollNo !== null);
    let n = Math.max(0, ...numbered.map((e) => e.rollNo!));
    for (const e of enr.filter((x) => x.rollNo === null).sort((a, b) => a.student.fullName.localeCompare(b.student.fullName))) {
      await tx.enrolment.update({ where: { id: e.id }, data: { rollNo: ++n } });
    }
  }

  const sectionNames = await tx.section.findMany({ where: { id: { in: [...sectionCounts.keys()] } }, include: { schoolClass: true } });
  const parts = sectionNames.filter((s) => s.classId !== p.from.classId).map((s) => `${sectionCounts.get(s.id)} promoted to ${s.schoolClass.name} ${s.name}`);
  if (parts.length === 0 && counts.PROMOTE) parts.push(`${counts.PROMOTE} promoted`);
  if (counts.DETAIN) parts.push(`${counts.DETAIN} detained`);
  if (counts.LEAVING) parts.push(`${counts.LEAVING} leaving`);
  const summary = parts.join(", ");
  await tx.promotionBatch.update({ where: { id: batch.id }, data: { promoted: counts.PROMOTE, detained: counts.DETAIN, leaving: counts.LEAVING, summary } });
  await writeAudit(tx, ctx, {
    action: "promoted",
    recordType: "Promotion Batch",
    recordId: batch.id,
    after: { from: `${p.from.label} (${p.from.year.name})`, to: p.toYear.name, summary, sectionsCreated: createdSections.length },
  });
  return { batch: { ...batch, summary }, createdSections };
}

/** Undo a batch while nothing is recorded for those students in the new year (inferred rule). */
export async function undoPromotion(tx: Tx, ctx: SchoolContext, batchId: string) {
  const batch = await tx.promotionBatch.findUnique({ where: { id: batchId }, include: { decisions: true } });
  if (!batch) throw new StudentProblem("This promotion was not found.");
  if (batch.undoneAt) throw new StudentProblem("This promotion was already undone.");
  const ids = batch.decisions.map((d) => d.studentId);
  const activity = await yearActivity(tx, ctx, ids, batch.toYearId);
  if (activity) throw new StudentProblem(`This promotion cannot be undone: ${activity} in the new year. Move single students on their Student Profile instead.`);
  const toEnrolments = batch.decisions.map((d) => d.toEnrolmentId).filter((x): x is string => Boolean(x));
  const moved = await tx.sectionChange.count({ where: { enrolmentId: { in: toEnrolments }, undoneAt: null } });
  if (moved) throw new StudentProblem("Some of these students were moved to another section since. Move them back first, or move single students on their Student Profile.");
  const leavingIds = batch.decisions.map((d) => d.leavingRequestId).filter((x): x is string => Boolean(x));
  const left = await tx.leavingRequest.count({ where: { id: { in: leavingIds }, status: "LEFT" } });
  const certs = await tx.certificate.count({ where: { leavingRequestId: { in: leavingIds }, status: { in: ["APPROVED", "ISSUED"] } } });
  if (left || certs) throw new StudentProblem("Some leaving students have already left or have a TC. Undo is no longer possible.");

  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  for (const d of batch.decisions) {
    if (d.toEnrolmentId) await tx.enrolment.update({ where: { id: d.toEnrolmentId }, data: { archivedAt: new Date() } });
    await tx.enrolment.update({ where: { id: d.fromEnrolmentId }, data: { status: "STUDYING" } });
    const student = await tx.student.findUniqueOrThrow({ where: { id: d.studentId } });
    if (student.status !== d.previousStatus) {
      await applyStatus(tx, ctx, d.studentId, d.previousStatus as never, today, "Promotion undone", `promotion-undo:${batch.id}`);
    }
    // Leaving requests made by this batch are cancelled; ones that existed before stay.
    if (d.decision === "LEAVING" && d.leavingRequestId) {
      const lr = await tx.leavingRequest.findUnique({ where: { id: d.leavingRequestId } });
      if (lr && lr.createdAt >= batch.confirmedAt && lr.status === "IN_PROGRESS") {
        await tx.leavingRequest.update({ where: { id: lr.id }, data: { status: "CANCELLED", cancelReason: "Promotion undone" } });
      }
    }
  }
  await tx.promotionBatch.update({ where: { id: batchId }, data: { undoneAt: new Date(), undoneById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "promotion-undone", recordType: "Promotion Batch", recordId: batchId, before: { summary: batch.summary }, after: { students: ids.length } });
  return ids.length;
}
