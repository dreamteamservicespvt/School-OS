// Student ID cards (03 §2 "Certificates & ID Cards", "Done when" 8). Printed
// class by class in batches of up to 50 (P9) as a print-ready PDF. A reprint
// needs a reason, and the old card is kept on record as replaced.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { getStudentSettings } from "./settings";
import { StudentProblem } from "./students";
import { STUDYING } from "./labels";
import { renderDocument } from "../documents";
import { currentDesign } from "../documents/designs";

/** The Settings, Document Designs type student ID cards print with. */
export const ID_CARD_DOC = "student-id-card";

export const ID_BATCH_SIZE = 50;

export async function sectionCards(tx: Tx, sectionId: string) {
  const section = await tx.section.findFirst({ where: { id: sectionId, archivedAt: null }, include: { schoolClass: true, academicYear: true } });
  if (!section) throw new StudentProblem("Choose a class and section.");
  const enrolments = await tx.enrolment.findMany({
    where: { sectionId, academicYearId: section.academicYearId, archivedAt: null, status: { not: "LEFT" }, student: { archivedAt: null, status: { in: [...STUDYING] } } },
    include: { student: { include: { guardians: { where: { archivedAt: null, isPrimary: true }, include: { guardian: true } } } } },
    orderBy: [{ rollNo: "asc" }],
  });
  const printed = await tx.idCardPrint.findMany({ where: { academicYearId: section.academicYearId, studentId: { in: enrolments.map((e) => e.studentId) }, replacedAt: null } });
  return {
    section,
    label: `${section.schoolClass.name} ${section.name}`,
    students: enrolments.map((e) => ({ ...e.student, rollNo: e.rollNo, guardianPhone: e.student.guardians[0]?.guardian.phone ?? null, guardianName: e.student.guardians[0]?.guardian.name ?? null, printed: printed.some((p) => p.studentId === e.studentId) })),
    batches: Math.max(1, Math.ceil(enrolments.length / ID_BATCH_SIZE)),
  };
}

type CardStudent = { id: string; fullName: string; admissionNo: string; dateOfBirth: Date | null; bloodGroup: string | null; address: string | null; photoFileId: string | null; guardianPhone: string | null; guardianName?: string | null; rollNo: number | null };

/** Records one batch as printed (a student already holding a card this year is not counted twice). */
export async function recordBatch(tx: Tx, ctx: SchoolContext, sectionId: string, batch: number) {
  const data = await sectionCards(tx, sectionId);
  const slice = data.students.slice(batch * ID_BATCH_SIZE, (batch + 1) * ID_BATCH_SIZE);
  if (slice.length === 0) throw new StudentProblem("This batch has no students.");
  const settings = await getStudentSettings(tx, ctx);
  let fresh = 0;
  for (const s of slice) {
    if (s.printed) continue;
    await tx.idCardPrint.create({
      data: { schoolId: ctx.schoolId, studentId: s.id, academicYearId: data.section.academicYearId, sectionId, batchKey: `${sectionId}:${batch}`, validUntil: settings.idCardValidUntil ?? data.section.academicYear.endDate, printedById: ctx.userId },
    });
    fresh++;
  }
  await writeAudit(tx, ctx, { action: "printed", recordType: "ID Card Print", recordId: null, after: { section: data.label, batch: batch + 1, cards: slice.length, firstPrint: fresh } });
  return { data, slice };
}

/** Reprint a replacement card with a reason (lost, damaged, details changed); the old card is marked replaced. */
export async function replaceCard(tx: Tx, ctx: SchoolContext, studentId: string, reason: string) {
  if (reason.trim().length < 3) throw new StudentProblem("Give the reason for the reprint (lost, damaged, details changed).", "reason");
  const openYears = await tx.academicYear.findMany({ where: { status: { not: "CLOSED" }, archivedAt: null } });
  const enr = await tx.enrolment.findFirst({ where: { studentId, archivedAt: null, academicYearId: { in: openYears.map((y) => y.id) } }, orderBy: { createdAt: "desc" } });
  if (!enr) throw new StudentProblem("This student has no class this year.");
  const enrYear = openYears.find((y) => y.id === enr.academicYearId)!;
  const settings = await getStudentSettings(tx, ctx);
  const old = await tx.idCardPrint.findFirst({ where: { studentId, academicYearId: enr.academicYearId, replacedAt: null }, orderBy: { createdAt: "desc" } });
  if (old) await tx.idCardPrint.update({ where: { id: old.id }, data: { replacedAt: new Date() } });
  const card = await tx.idCardPrint.create({
    data: { schoolId: ctx.schoolId, studentId, academicYearId: enr.academicYearId, sectionId: enr.sectionId, isReplacement: true, reason: reason.trim(), replacesId: old?.id ?? null, validUntil: settings.idCardValidUntil ?? enrYear.endDate, printedById: ctx.userId },
  });
  await writeAudit(tx, ctx, { action: "reprinted", recordType: "ID Card Print", recordId: card.id, before: old ? { cardId: old.id } : null, after: { studentId, reason: reason.trim() } });
  return card;
}

/**
 * Sheets of ID cards for A4 pages, in the school's Student ID card design
 * (Settings, Document Designs: layout, colours, card size, logo, QR and
 * barcode). Student Settings still decide which details may be printed and
 * how many cards go on a page.
 */
export async function idCardsHtml(tx: Tx, ctx: SchoolContext, students: CardStudent[], q: { classLabel: string; yearName: string; validUntil: Date; replacement?: boolean }) {
  const settings = await getStudentSettings(tx, ctx);
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { code: true } });
  const show = new Set(settings.idCardFields);
  const design = await currentDesign(tx, ID_CARD_DOC);
  const options = { ...design.options, card: { ...design.options.card, validUntil: `${formatDate(q.validUntil)}${q.replacement ? " · Replacement" : ""}` } };
  const records = students.map((s) => ({
    fields: {
      student_name: s.fullName,
      admission_no: show.has("admissionNo") ? s.admissionNo : null,
      class_section: q.classLabel,
      roll_no: s.rollNo ? String(s.rollNo) : null,
      date_of_birth: show.has("dateOfBirth") ? s.dateOfBirth : null,
      blood_group: show.has("bloodGroup") ? s.bloodGroup : null,
      guardian_phone: show.has("guardianPhone") ? s.guardianPhone : null,
      father_name: s.guardianName ?? null,
      guardian_name: s.guardianName ?? null,
      address: show.has("address") ? s.address : null,
      academic_year: q.yearName,
    },
    photoFileId: s.photoFileId,
    verifyText: `${school.code}:${s.admissionNo}`,
  }));
  const perPage = Math.min(8, Math.max(1, settings.idCardsPerPage));
  const pages: string[] = [];
  for (let i = 0; i < records.length; i += perPage) {
    pages.push((await renderDocument(tx, ctx, ID_CARD_DOC, records.slice(i, i + perPage), { design: { base: design.base, options } })).html);
  }
  if (pages.length <= 1) return pages[0] ?? "";
  const head = pages[0].slice(0, pages[0].indexOf("<body>"));
  const bodies = pages.map((p) => p.slice(p.indexOf("<body>") + 6, p.lastIndexOf("</body>")));
  return `${head}<body>${bodies.join('<div style="break-before:page;page-break-before:always"></div>')}</body></html>`;
}
