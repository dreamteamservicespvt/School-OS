// Everything the Student Profile shows from this module, read once, within
// what the person may see (restricted fields masked, private notes hidden).
import { consentRows } from "@/lib/students/consent";
import "server-only";

import type { Tx } from "@/lib/db";
import type { Current } from "@/lib/current";
import { decryptField, maskLast4 } from "@/lib/crypto";
import { fileLink } from "@/lib/files";
import { loadVisibleStudent, noteVisible, studentScope, type ProfileView, type StudentAbilities } from "@/lib/students/access";
import { emergencyList, previousSchoolLocked } from "@/lib/students/students";
import { pointsTotal } from "@/lib/students/behaviour";
import { pickupList } from "@/lib/students/guardians";
import { currentEnrolments, currentYear } from "@/lib/academic/years";
import type { ResolvedSettings } from "@/lib/students/settings";
import { schoolRoles } from "@/lib/school-roles";

/** The student row with the parts this person may not see taken out (ProfileView). */
export function redactStudent<T extends Record<string, unknown> & { customFields: unknown }>(row: T, v: ProfileView): T {
  const out = { ...row };
  const extra = { ...((row.customFields ?? {}) as Record<string, unknown>) };
  if (!v.personal) {
    Object.assign(out, { dateOfBirth: null, gender: null, bloodGroup: null, category: null, religion: null, motherTongue: null, medicalNotes: null, aadhaarEnc: null, apaarId: null, pen: null, previousSchool: null });
    for (const k of Object.keys(extra)) if (!k.startsWith("_")) delete extra[k];
  }
  if (!v.address) {
    Object.assign(out, { address: null, city: null, state: null, pinCode: null });
    delete extra._permanentAddress;
  }
  if (!v.phones || !v.personal) { delete extra._studentPhone; delete extra._studentEmail; }
  return { ...out, customFields: extra };
}

export async function loadProfile(tx: Tx, current: Current, id: string, can: StudentAbilities, settings: ResolvedSettings, fallbackYearId: string | null) {
  const v = can.view;
  const student = redactStudent(await loadVisibleStudent(tx, current, id), v);
  // "This year" for a student is their own campus's current year (two campuses can start the year on different dates).
  const yearId = (await currentYear(tx, current.ctx, student.campusId))?.id ?? fallbackYearId;
  const none = <T,>(x: T) => Promise.resolve(x);
  const [enrolments, links, emergency, previous, identifiers, notes, customFields, docs, leaving, incidentsCount, points, openSuspension, roles, photoOk, pickups, lockedYear] = await Promise.all([
    tx.enrolment.findMany({ where: { studentId: id }, orderBy: { createdAt: "desc" } }),
    v.parents ? tx.studentGuardian.findMany({ where: { studentId: id, archivedAt: null, guardian: { archivedAt: null } }, include: { guardian: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }) : none([]),
    v.emergency ? emergencyList(tx, id) : none([]),
    v.personal ? tx.studentPreviousSchool.findUnique({ where: { studentId: id } }) : none(null),
    v.personal && (can.seeRestricted || !can.lookupOnly) ? tx.studentIdentifier.findMany({ where: { studentId: id, archivedAt: null } }) : Promise.resolve([]),
    can.lookupOnly ? Promise.resolve([]) : tx.studentNote.findMany({ where: { studentId: id, archivedAt: null }, orderBy: { createdAt: "desc" } }),
    tx.customField.findMany({ where: { recordType: "student", archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
    can.seeDocuments ? tx.studentDocument.findMany({ where: { studentId: id, archivedAt: null }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
    tx.leavingRequest.findFirst({ where: { studentId: id, status: "IN_PROGRESS" }, include: { checks: true } }),
    can.seeBehaviour ? tx.behaviourIncidentStudent.count({ where: { studentId: id, incident: { archivedAt: null, ...(yearId ? { academicYearId: yearId } : {}) } } }) : Promise.resolve(0),
    can.seeBehaviour && settings.pointsOn ? pointsTotal(tx, id) : Promise.resolve(null),
    can.seeBehaviour ? tx.behaviourIncidentStudent.findFirst({ where: { studentId: id, incident: { archivedAt: null, kind: "suspension", suspensionTo: { gte: new Date(new Date().toISOString().slice(0, 10)) } } }, include: { incident: true } }) : Promise.resolve(null),
    schoolRoles(tx, current.ctx, { where: { archivedAt: null, isEnabled: true, key: { not: null } }, select: { key: true, name: true }, orderBy: { name: "asc" } }),
    consentRows(tx, current.ctx, { studentIds: [id], consentType: "photo" }).then((r) => r.filter((x) => x.status === "WITHDRAWN").length),
    v.pickup || v.mode === "pickup" ? pickupList(tx, id) : none({ allowed: [], restricted: [] }),
    previousSchoolLocked(tx, id),
  ]);

  // Brothers and sisters: other students sharing a parent (Admission Counsellor, full view).
  const siblings = v.siblings ? await siblingsOf(tx, current, id, yearId) : [];
  const shownPickups = v.phones ? pickups : { ...pickups, allowed: pickups.allowed.map((g) => ({ ...g, phone: "" })) };

  const sectionIds = [...new Set(enrolments.map((e) => e.sectionId))];
  const sections = await tx.section.findMany({ where: { id: { in: sectionIds } }, include: { schoolClass: true, academicYear: true } });
  const sec = new Map(sections.map((s) => [s.id, s]));
  const history = enrolments
    .map((e) => ({ ...e, section: sec.get(e.sectionId) ?? null }))
    .sort((a, b) => (b.section?.academicYear.startDate.getTime() ?? 0) - (a.section?.academicYear.startDate.getTime() ?? 0));
  const now = history.find((e) => e.academicYearId === yearId && !e.archivedAt && e.status !== "LEFT") ?? null;

  // Restricted values: full for the School Admin and Principal, masked for everyone else.
  const show = (plain: string | null) => (plain ? (can.seeRestricted ? plain : maskLast4(plain)) : null);
  let aadhaar: string | null = null;
  if (student.aadhaarEnc) {
    try { aadhaar = show(decryptField(student.aadhaarEnc)); } catch { aadhaar = "On record (could not be read)"; }
  }
  // Aadhaar, APAAR and PEN always show (India); the school's own identifier types follow.
  const fixed: { key: string; label: string; level: "restricted" | "highly" }[] = [
    { key: "aadhaar", label: "Aadhaar number", level: "highly" },
    { key: "apaar", label: "APAAR ID", level: "restricted" },
    { key: "pen", label: "PEN", level: "restricted" },
  ];
  const idValues = [...fixed, ...settings.identifierTypes.filter((t) => !fixed.some((f) => f.key === t.key))].map((t) => {
    if (t.key === "aadhaar") return { ...t, value: aadhaar };
    if (t.key === "apaar") return { ...t, value: show(student.apaarId) };
    if (t.key === "pen") return { ...t, value: show(student.pen) };
    const row = identifiers.find((i) => i.typeKey === t.key);
    if (!row) return { ...t, value: null };
    if (!can.seeRestricted) return { ...t, value: maskLast4(row.last4) };
    try { return { ...t, value: decryptField(row.valueEnc) }; } catch { return { ...t, value: maskLast4(row.last4) }; }
  });

  const extra = (student.customFields ?? {}) as Record<string, string | null>;
  const docKinds = new Set(docs.filter((d) => !d.guardianId).map((d) => d.kind));
  const requiredDone = settings.requiredDocuments.filter((k) => docKinds.has(k)).length;
  const files = docs.length ? await tx.storedFile.findMany({ where: { id: { in: docs.map((d) => d.fileId) } } }) : [];

  return {
    student,
    /** The student's own campus's current year, for this year's class and the other modules' tabs. */
    yearId,
    photo: student.photoFileId ? fileLink(student.photoFileId, current.ctx.schoolId) : null,
    /** A parent withdrew photo consent: the photo is hidden from the gallery and social posts. */
    photoWithdrawn: photoOk > 0,
    history,
    now,
    links,
    pickups: shownPickups,
    siblings,
    emergency,
    previous,
    previousLocked: lockedYear,
    identifiers: v.personal ? idValues : [],
    notes: notes.filter((n) => noteVisible(n, current)),
    roles: roles.filter((r, i): r is { key: string; name: string } => Boolean(r.key) && roles.findIndex((x) => x.key === r.key) === i),
    customFields: v.personal ? customFields.filter((f) => f.visibility !== "restricted" || can.seeRestricted) : [],
    extra,
    permanentAddress: extra._permanentAddress ?? null,
    studentPhone: extra._studentPhone ?? null,
    studentEmail: extra._studentEmail ?? null,
    documents: docs.map((d) => ({ ...d, file: files.find((f) => f.id === d.fileId) ?? null, link: fileLink(d.fileId, current.ctx.schoolId) })),
    documentsDone: requiredDone,
    leaving,
    incidentsCount,
    points,
    openSuspension,
  };
}

export type Profile = Awaited<ReturnType<typeof loadProfile>>;

/** Other students (in this person's reach) who share a parent with this one, with their class this year. */
async function siblingsOf(tx: Tx, current: Current, id: string, yearId: string | null) {
  const links = await tx.studentGuardian.findMany({ where: { studentId: id, archivedAt: null }, select: { guardianId: true } });
  if (links.length === 0) return [];
  const scope = await studentScope(tx, current, yearId);
  const rows = await tx.student.findMany({
    where: { AND: [scope, { id: { not: id }, archivedAt: null, guardians: { some: { guardianId: { in: links.map((l) => l.guardianId) }, archivedAt: null } } }] },
    select: { id: true, fullName: true, admissionNo: true, photoFileId: true, status: true },
    orderBy: { fullName: "asc" },
  });
  // Each sibling's class this year, in their own campus's current year (a sibling may study on the other campus).
  const thisYear = await currentEnrolments(tx, rows.map((r) => r.id));
  const secs = await tx.section.findMany({ where: { id: { in: [...thisYear.values()].map((e) => e.sectionId) } }, include: { schoolClass: true } });
  return rows.map((r) => {
    const sec = secs.find((x) => x.id === thisYear.get(r.id)?.sectionId);
    return { id: r.id, name: r.fullName, admissionNo: r.admissionNo, status: r.status, className: sec?.schoolClass.name ?? null, sectionName: sec?.name ?? null, photo: r.photoFileId ? fileLink(r.photoFileId, current.ctx.schoolId) : null };
  });
}
