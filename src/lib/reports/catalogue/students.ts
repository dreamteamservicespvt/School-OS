// Student reports (19 §2, §7): master list, demographics, lifecycle,
// transfers between sections, withdrawals and TCs, and document status.
// These live here, in Reports & Analytics; they read Student Management's
// records within the person's reach.
import "server-only";

import type { Prisma } from "@prisma/client";
import { getStudentSettings } from "../../students/settings";
import { CATEGORIES as SOCIAL } from "../../students/labels";
import type { ReportEntry, Row, Table } from "../types";
import { pct, scopeSections, sectionNames, studentSections, totalsOf } from "./util";

const STATUS_WORDS: Record<string, string> = { ADMITTED: "Admitted", ACTIVE: "Active", PROMOTED: "Promoted", TRANSFERRED: "Transferred", WITHDRAWN: "Withdrawn", GRADUATED: "Passed out", ALUMNI: "Alumni", INACTIVE: "Inactive" };

/** Studying this year in the sections the run may read. */
function enrolled(yearId: string, ids: string[] | null): Prisma.EnrolmentWhereInput {
  return { academicYearId: yearId, archivedAt: null, status: "STUDYING", student: { archivedAt: null }, ...(ids ? { sectionId: { in: ids } } : {}) };
}

export const STUDENT_REPORTS: ReportEntry[] = [
  {
    key: "st-master", category: "Students", name: "Student master list", sub: "Every student with class, admission no., parent and phone", byClass: true, own: true,
    async run(rc) {
      if (!rc.f.year) return { columns: [], rows: [], empty: "No academic year is set up yet." };
      const ids = await scopeSections(rc);
      const names = await sectionNames(rc);
      const list = await rc.tx.enrolment.findMany({
        where: enrolled(rc.f.year.id, ids),
        include: { student: { select: { fullName: true, admissionNo: true, status: true, gender: true, guardians: { where: { archivedAt: null, isPrimary: true }, include: { guardian: { select: { name: true, phone: true } } }, take: 1 } } } },
      });
      const rows: Row[] = list
        .map((e) => ({ name: e.student.fullName, cls: names.get(e.sectionId)?.label ?? "", roll: e.rollNo, adm: e.student.admissionNo, parent: e.student.guardians[0]?.guardian.name ?? "", phone: e.student.guardians[0]?.guardian.phone ?? "", gender: e.student.gender ?? "", status: STATUS_WORDS[e.student.status] ?? e.student.status, _sort: names.get(e.sectionId)?.sort ?? 0 }))
        .sort((a, b) => a._sort - b._sort || (a.roll ?? 999) - (b.roll ?? 999) || a.name.localeCompare(b.name))
        .map(({ _sort, ...r }) => (void _sort, r));
      return {
        columns: [{ key: "name", label: "Student" }, { key: "cls", label: "Class" }, { key: "roll", label: "Roll no.", kind: "number" }, { key: "adm", label: "Admission no." }, { key: "parent", label: "Parent" }, { key: "phone", label: "Phone" }, { key: "gender", label: "Gender" }, { key: "status", label: "Status" }],
        rows,
      };
    },
  },
  {
    key: "st-demo", category: "Students", name: "Demographics", sub: "Boys and girls, and social category, class by class", byClass: true,
    async run(rc) {
      if (!rc.f.year) return { columns: [], rows: [], empty: "No academic year is set up yet." };
      const ids = await scopeSections(rc);
      const list = await rc.tx.enrolment.findMany({ where: enrolled(rc.f.year.id, ids), select: { classId: true, student: { select: { gender: true, category: true } } } });
      const classes = await rc.tx.schoolClass.findMany({ where: { id: { in: [...new Set(list.map((e) => e.classId))] } }, select: { id: true, name: true, sortOrder: true }, orderBy: { sortOrder: "asc" } });
      const rows: Row[] = classes.map((c) => {
        const mine = list.filter((e) => e.classId === c.id).map((e) => e.student);
        const row: Row = { cls: c.name, students: mine.length, boys: mine.filter((s) => s.gender === "Male").length, girls: mine.filter((s) => s.gender === "Female").length };
        for (const k of SOCIAL) row[k] = mine.filter((s) => s.category === k).length;
        row.notSet = mine.filter((s) => !s.category || !(SOCIAL as readonly string[]).includes(s.category)).length;
        return row;
      });
      const t: Table = {
        columns: [{ key: "cls", label: "Class" }, { key: "students", label: "Students", kind: "number" }, { key: "boys", label: "Boys", kind: "number" }, { key: "girls", label: "Girls", kind: "number" }, ...SOCIAL.map((k) => ({ key: k, label: k, kind: "number" as const })), { key: "notSet", label: "Category not recorded", kind: "number" }],
        rows,
      };
      return { ...t, totals: totalsOf(t, "All classes") };
    },
  },
  {
    key: "st-life", category: "Students", name: "Student lifecycle", sub: "How many are active, new, inactive or left, and what changed",
    async run(rc) {
      const { f, tx } = rc;
      if (!f.year) return { columns: [], rows: [], empty: "No academic year is set up yet." };
      const ids = await scopeSections(rc);
      const inYear = await tx.enrolment.findMany({ where: { academicYearId: f.year.id, archivedAt: null, ...(ids ? { sectionId: { in: ids } } : {}) }, select: { studentId: true, status: true, student: { select: { status: true, joiningDate: true, createdAt: true } } } });
      const studentIds = inYear.map((e) => e.studentId);
      const changes = await tx.studentStatusChange.findMany({ where: { studentId: { in: studentIds }, effectiveDate: { gte: f.year.startDate, lte: f.today } }, select: { toStatus: true } });
      const now = (st: string) => inYear.filter((e) => e.student.status === st).length;
      const since = (st: string) => changes.filter((c) => c.toStatus === st).length;
      const isNew = inYear.filter((e) => (e.student.joiningDate ?? e.student.createdAt) >= f.year!.startDate).length;
      const left = inYear.filter((e) => ["TRANSFERRED", "WITHDRAWN"].includes(e.student.status)).length;
      const rows: Row[] = [
        { status: "Active", students: now("ACTIVE") + now("ADMITTED"), since: since("ACTIVE"), note: "On the rolls today" },
        { status: "New this year", students: isNew, since: isNew, note: `Joined in ${f.year.name}` },
        { status: "Inactive", students: now("INACTIVE"), since: since("INACTIVE"), note: "Still on the rolls, not attending" },
        { status: "Left during the year", students: left, since: since("TRANSFERRED") + since("WITHDRAWN"), note: "Transferred or withdrawn" },
        { status: "Passed out", students: now("GRADUATED") + now("ALUMNI"), since: since("GRADUATED"), note: "Finished school" },
      ];
      return { columns: [{ key: "status", label: "Status" }, { key: "students", label: "Students", kind: "number" }, { key: "since", label: `Changed since ${f.year.startDate.toISOString().slice(0, 10).split("-").reverse().join("-")}`, kind: "number" }, { key: "note", label: "Note" }], rows };
    },
  },
  {
    key: "st-transfer", category: "Students", name: "Transfers between sections", sub: "Students who moved section or class in these dates", byClass: true, own: true, dated: true, fallback: "acyear",
    async run(rc) {
      const { f, tx } = rc;
      const ids = await scopeSections(rc);
      const names = await sectionNames(rc, null);
      const moves = await tx.sectionChange.findMany({
        where: { undoneAt: null, createdAt: { gte: f.from, lt: new Date(f.to.getTime() + 86_400_000) }, ...(ids ? { OR: [{ fromSectionId: { in: ids } }, { toSectionId: { in: ids } }] } : {}) },
        orderBy: { createdAt: "asc" },
      });
      const students = new Map((await tx.student.findMany({ where: { id: { in: moves.map((m) => m.studentId) } }, select: { id: true, fullName: true } })).map((s) => [s.id, s.fullName]));
      return {
        columns: [{ key: "name", label: "Student" }, { key: "from", label: "From" }, { key: "to", label: "To" }, { key: "date", label: "Date", kind: "date" }, { key: "reason", label: "Reason" }],
        rows: moves.map((m) => ({ name: students.get(m.studentId) ?? "", from: names.get(m.fromSectionId)?.label ?? "", to: names.get(m.toSectionId)?.label ?? "", date: m.createdAt, reason: m.reason ?? "" })),
      };
    },
  },
  {
    key: "st-withdraw", category: "Students", name: "Withdrawals and TCs", sub: "Who left, when, why, and whether the TC is issued", byClass: true, own: true, dated: true, fallback: "acyear",
    async run(rc) {
      const { f, tx } = rc;
      const ids = await scopeSections(rc);
      const leaving = await tx.leavingRequest.findMany({ where: { status: { not: "CANCELLED" }, type: { in: ["TRANSFER", "WITHDRAWAL"] }, lastDate: { gte: f.from, lte: f.to } }, orderBy: { lastDate: "asc" } });
      const secOf = await studentSections(rc, leaving.map((l) => l.studentId));
      const names = await sectionNames(rc);
      const mine = leaving.filter((l) => !ids || ids.includes(secOf.get(l.studentId) ?? ""));
      const [students, tcs] = await Promise.all([
        tx.student.findMany({ where: { id: { in: mine.map((l) => l.studentId) } }, select: { id: true, fullName: true } }),
        tx.certificate.findMany({ where: { studentId: { in: mine.map((l) => l.studentId) }, type: "TC", status: { not: "CANCELLED" } }, select: { studentId: true, status: true } }),
      ]);
      const tcWord = (sid: string) => { const t = tcs.find((c) => c.studentId === sid); return !t ? "Not yet" : t.status === "ISSUED" ? "Issued" : "Applied"; };
      return {
        columns: [{ key: "name", label: "Student" }, { key: "cls", label: "Class" }, { key: "left", label: "Left on", kind: "date" }, { key: "type", label: "Type" }, { key: "reason", label: "Reason" }, { key: "tc", label: "TC" }],
        rows: mine.map((l) => ({ name: students.find((s) => s.id === l.studentId)?.fullName ?? "", cls: names.get(secOf.get(l.studentId) ?? "")?.label ?? "", left: l.leftOn ?? l.lastDate, type: l.type === "TRANSFER" ? "Transfer" : "Withdrawal", reason: l.reason, tc: tcWord(l.studentId) })),
      };
    },
  },
  {
    key: "st-docs", category: "Students", name: "Document status", sub: "Which papers are still missing, and for how many students", byClass: true,
    async run(rc) {
      const { f, tx, ctx } = rc;
      if (!f.year) return { columns: [], rows: [], empty: "No academic year is set up yet." };
      const ids = await scopeSections(rc);
      const settings = await getStudentSettings(tx, ctx);
      const list = await tx.enrolment.findMany({ where: enrolled(f.year.id, ids), select: { studentId: true } });
      const studentIds = list.map((e) => e.studentId);
      const docs = await tx.studentDocument.findMany({ where: { studentId: { in: studentIds }, archivedAt: null }, select: { studentId: true, kind: true } });
      const rows: Row[] = settings.requiredDocuments.map((kind) => {
        const have = new Set(docs.filter((d) => d.kind === kind).map((d) => d.studentId)).size;
        return { doc: kind, collected: have, missing: studentIds.length - have, needed: studentIds.length, share: pct(have, studentIds.length) };
      });
      return {
        columns: [{ key: "doc", label: "Document" }, { key: "collected", label: "Collected", kind: "number" }, { key: "missing", label: "Missing", kind: "number" }, { key: "needed", label: "Needed from", kind: "number" }, { key: "share", label: "Collected %", kind: "percent" }],
        rows,
        note: "The papers asked for are set in Student Settings.",
      };
    },
  },
];
