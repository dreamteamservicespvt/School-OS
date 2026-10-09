// Student ID cards (03 §2 "Certificates & ID Cards", "Done when" 8). Printed
// class by class in batches of up to 50 (P9) as a print-ready PDF. A reprint
// needs a reason, and the old card is kept on record as replaced.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { esc } from "../pdf";
import { getStudentSettings } from "./settings";
import { StudentProblem } from "./students";
import { STUDYING } from "./labels";
import { barcodeSvg, qrSvg } from "./codes";
import { fileDataUri } from "./certificates";

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
    students: enrolments.map((e) => ({ ...e.student, rollNo: e.rollNo, guardianPhone: e.student.guardians[0]?.guardian.phone ?? null, printed: printed.some((p) => p.studentId === e.studentId) })),
    batches: Math.max(1, Math.ceil(enrolments.length / ID_BATCH_SIZE)),
  };
}

type CardStudent = { id: string; fullName: string; admissionNo: string; dateOfBirth: Date | null; bloodGroup: string | null; address: string | null; photoFileId: string | null; guardianPhone: string | null; rollNo: number | null };

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

/** A sheet of ID cards (CR80 size, 85.6 × 54 mm) for an A4 page. */
export async function idCardsHtml(tx: Tx, ctx: SchoolContext, students: CardStudent[], q: { classLabel: string; yearName: string; validUntil: Date; replacement?: boolean }) {
  const settings = await getStudentSettings(tx, ctx);
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId } });
  const logo = await fileDataUri(tx, school.logoFileId);
  const show = new Set(settings.idCardFields);
  const cards: string[] = [];
  for (const s of students) {
    const photo = await fileDataUri(tx, s.photoFileId);
    const qr = await qrSvg(`${school.code}:${s.admissionNo}`, 64);
    const lines: [string, string | null][] = [
      ["Adm. no", show.has("admissionNo") ? s.admissionNo : null],
      ["Roll no", s.rollNo ? String(s.rollNo) : null],
      ["Date of birth", show.has("dateOfBirth") && s.dateOfBirth ? formatDate(s.dateOfBirth) : null],
      ["Blood group", show.has("bloodGroup") ? s.bloodGroup : null],
      ["Parent", show.has("guardianPhone") ? s.guardianPhone : null],
    ];
    cards.push(`<div class="card">
      <div class="top">${logo ? `<img class="logo" src="${logo}" alt="">` : ""}<div><div class="school">${esc(school.name)}</div><div class="year">Academic year ${esc(q.yearName)}</div></div></div>
      <div class="mid">
        <div class="photo">${photo ? `<img src="${photo}" alt="">` : "<span>No photo</span>"}</div>
        <div class="info"><div class="name">${esc(s.fullName)}</div><div class="cls">${esc(q.classLabel)}</div>
          ${lines.filter(([, v]) => v).map(([k, v]) => `<div class="row"><span>${esc(k)}</span> ${esc(v)}</div>`).join("")}
          ${show.has("address") && s.address ? `<div class="addr">${esc(s.address)}</div>` : ""}
        </div>
        <div class="qr">${qr}</div>
      </div>
      <div class="bottom"><div class="bar">${barcodeSvg(s.admissionNo, 22, 0.9)}</div><div class="valid">Valid until ${esc(formatDate(q.validUntil))}${q.replacement ? " · Replacement" : ""}</div></div>
    </div>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 10mm; }
    body { margin: 0; font-family: Arial, "Noto Sans", sans-serif; color: #111; }
    .sheet { display: grid; grid-template-columns: repeat(2, 85.6mm); gap: 6mm 8mm; justify-content: center; }
    .card { width: 85.6mm; height: 54mm; border: 0.3mm solid #888; border-radius: 3mm; overflow: hidden; display: flex; flex-direction: column; break-inside: avoid; page-break-inside: avoid; }
    .top { background: #1d3a8a; color: #fff; display: flex; align-items: center; gap: 2mm; padding: 1.5mm 2.5mm; height: 10mm; }
    .logo { height: 7mm; width: 7mm; object-fit: contain; background: #fff; border-radius: 1mm; }
    .school { font-weight: bold; font-size: 8.5pt; line-height: 1.1; } .year { font-size: 6.5pt; opacity: .9; }
    .mid { flex: 1; display: flex; gap: 2mm; padding: 1.5mm 2.5mm; }
    .photo { width: 19mm; height: 23mm; border: 0.2mm solid #aaa; display: grid; place-items: center; font-size: 6pt; color: #888; flex-shrink: 0; overflow: hidden; }
    .photo img { width: 100%; height: 100%; object-fit: cover; }
    .info { flex: 1; font-size: 6.6pt; line-height: 1.3; min-width: 0; }
    .name { font-weight: bold; font-size: 8.6pt; } .cls { font-weight: bold; color: #1d3a8a; margin-bottom: .5mm; }
    .row span { color: #555; } .addr { color: #333; font-size: 6pt; max-height: 6mm; overflow: hidden; }
    .qr { width: 16mm; flex-shrink: 0; } .qr svg { width: 16mm; height: 16mm; }
    .bottom { display: flex; justify-content: space-between; align-items: center; padding: 0 2.5mm 1.2mm; }
    .bar svg { height: 5.5mm; width: auto; } .valid { font-size: 6pt; color: #333; }
    .sheet + .sheet { break-before: page; page-break-before: always; }
  </style></head><body>${sheets(cards, Math.min(8, Math.max(1, settings.idCardsPerPage)))}</body></html>`;
}

/** Cards per page from the ID card settings (at most 8 fit on A4). */
function sheets(cards: string[], perPage: number) {
  const out: string[] = [];
  for (let i = 0; i < cards.length; i += perPage) out.push(`<div class="sheet">${cards.slice(i, i + perPage).join("")}</div>`);
  return out.join("");
}
