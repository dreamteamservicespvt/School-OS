// Homework (17 §2): give homework to a section, a whole class or chosen
// students in three taps, with attachments and a due date that defaults to the
// next day the subject is taught; edit or archive it (with Undo); and the
// counts every list shows ("40 assigned, 24 submitted", checked, seen).
import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { saveFile, DOCUMENT_TYPES } from "../files";
import { dayOff } from "../academic/calendar";
import { effectiveVersion } from "../academic/timetable";
import { weekday } from "../academic/common";
import { formatDate } from "../format";
import { HomeworkProblem } from "./access";
import { mayRead, requireDesk, requireStaff, requireWork, requireYearOpen, shortSection, workSections, workSubjects, type HomeworkScope } from "./scope";
import { homeworkSettings } from "./settings";
import { dayDate, homeworkStatus, HANDED_IN, isPastDue, plural, TO_CHECK, type HomeworkStatus } from "./words";
import { tellParentsHomeworkSet } from "./notify-parents";

const DAY = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

export type DueDefault = { date: Date; words: string; fromTimetable: boolean };

/**
 * The next day the subject is taught to the section, from the Time Table in
 * force (17 §2, inferred), skipping holidays. Without a Time Table: the next
 * working day.
 */
export async function nextClassDay(tx: Tx, ctx: SchoolContext, sectionId: string, subjectId: string, today: Date): Promise<DueDefault> {
  const section = await tx.section.findFirst({ where: { id: sectionId }, include: { schoolClass: { select: { campusId: true } } } });
  if (!section) return { date: addDays(today, 1), words: dayDate(addDays(today, 1)), fromTimetable: false };
  const campusId = section.schoolClass.campusId;
  let firstWorking: Date | null = null;
  for (let i = 1; i <= 21; i++) {
    const d = addDays(today, i);
    if (await dayOff(tx, ctx, d, campusId)) continue;
    firstWorking ??= d;
    const version = await effectiveVersion(tx, ctx, campusId, d);
    if (!version) continue;
    const period = await tx.timetablePeriod.findFirst({ where: { versionId: version.id, sectionId, subjectId, dayOfWeek: weekday(d), archivedAt: null }, orderBy: { periodNo: "asc" } });
    if (period) return { date: d, words: `${dayDate(d)}, period ${period.periodNo}`, fromTimetable: true };
  }
  const d = firstWorking ?? addDays(today, 1);
  return { date: d, words: dayDate(d), fromTimetable: false };
}

/** The next working day (for "Tomorrow" when tomorrow is a holiday or Sunday). */
export async function nextWorkingDay(tx: Tx, ctx: SchoolContext, sectionId: string, today: Date) {
  const section = await tx.section.findFirst({ where: { id: sectionId }, include: { schoolClass: { select: { campusId: true } } } });
  for (let i = 1; i <= 14; i++) {
    const d = addDays(today, i);
    if (!section || !(await dayOff(tx, ctx, d, section.schoolClass.campusId))) return d;
  }
  return addDays(today, 1);
}

/** Students studying in a section this year, by roll number then name. */
export async function sectionStudents(tx: Tx, yearId: string, sectionId: string) {
  const rows = await tx.enrolment.findMany({
    where: { academicYearId: yearId, sectionId, archivedAt: null, status: "STUDYING", student: { archivedAt: null } },
    include: { student: { select: { id: true, fullName: true, admissionNo: true, userLoginId: true } } },
  });
  return rows
    .map((e) => ({ id: e.student.id, name: e.student.fullName, admissionNo: e.student.admissionNo, rollNo: e.rollNo, userLoginId: e.student.userLoginId }))
    .sort((a, b) => (a.rollNo ?? 9999) - (b.rollNo ?? 9999) || a.name.localeCompare(b.name));
}

export type NewAttachment = { kind: "photo" | "file"; file: File } | { kind: "link"; url: string; name?: string };

export type GiveInput = {
  sectionId: string;
  subjectId: string;
  title: string;
  instructions: string | null;
  givenTo: "SECTION" | "CLASS" | "STUDENTS";
  studentIds: string[];
  startDate: Date;
  dueDate: Date;
  maxMarks: number;
  onlineSubmission: boolean;
  fromSuggestion: boolean;
  attachments: NewAttachment[];
};

export function checkLink(raw: string) {
  const v = raw.trim();
  if (!v) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function addAttachments(tx: Tx, ctx: SchoolContext, homeworkIds: string[], list: NewAttachment[]) {
  for (const a of list) {
    if (a.kind === "link") {
      const url = checkLink(a.url);
      if (!url) throw new HomeworkProblem("That link does not look right. Paste a full web address, like https://ncert.nic.in.", "link");
      for (const id of homeworkIds) await tx.homeworkAttachment.create({ data: { schoolId: ctx.schoolId, homeworkId: id, kind: "link", name: a.name?.trim() || new URL(url).hostname.replace(/^www\./, ""), url } });
      continue;
    }
    const stored = await saveFile(tx, ctx, { file: a.file, purpose: "homework-attachment", allowed: DOCUMENT_TYPES, maxImageWidth: 2000 });
    for (const id of homeworkIds) await tx.homeworkAttachment.create({ data: { schoolId: ctx.schoolId, homeworkId: id, kind: a.kind, name: stored.fileName, fileId: stored.id, sizeBytes: stored.sizeBytes } });
  }
}

/** Gives homework. Returns the homework made (one per section for a whole class). */
export async function giveHomework(tx: Tx, s: HomeworkScope, input: GiveInput, today: Date) {
  requireStaff(s);
  requireDesk(s, "homework");
  requireYearOpen(s);
  const ctx = s.ctx;
  const title = input.title.trim().replace(/\s+/g, " ");
  if (!title) throw new HomeworkProblem("Give the homework a title, like “Exercise 4.3”.", "title");
  if (title.length > 200) throw new HomeworkProblem("The title can be at most 200 characters.", "title");
  if ((input.instructions ?? "").length > 4000) throw new HomeworkProblem("Instructions can be at most 4,000 characters.", "instructions");
  if (input.dueDate.getTime() < input.startDate.getTime()) throw new HomeworkProblem("Due date is before the start date.", "dueDate");
  if (!Number.isInteger(input.maxMarks) || input.maxMarks < 1 || input.maxMarks > 100) throw new HomeworkProblem("Maximum marks must be from 1 to 100.", "maxMarks");
  if (!input.instructions?.trim() && input.attachments.length === 0 && title.length < 3) throw new HomeworkProblem("Say what to do: type instructions or attach a photo of the board.", "instructions");

  const sections = await workSections(tx, s);
  const section = sections.find((x) => x.id === input.sectionId);
  if (!section) throw new HomeworkProblem("Choose one of your classes that has students.", "sectionId");
  const subjects = await workSubjects(tx, s, section.id, section.classId, today);
  const subject = subjects.find((x) => x.id === input.subjectId);
  if (!subject) throw new HomeworkProblem(`You do not teach this subject to ${section.label}. Ask the Academic Head if Teacher Allocation is wrong.`, "subjectId");

  // Whole class: every section of the class this person may give this subject to.
  let targets = [section];
  if (input.givenTo === "CLASS") {
    targets = [];
    for (const x of sections.filter((y) => y.classId === section.classId)) {
      const subs = await workSubjects(tx, s, x.id, x.classId, today);
      if (subs.some((y) => y.id === subject.id)) targets.push(x);
    }
  }
  const groupId = targets.length > 1 ? randomUUID() : null;
  const made: { id: string; sectionLabel: string; students: number }[] = [];
  const settings = await homeworkSettings(tx, ctx);
  for (const t of targets) {
    let students = await sectionStudents(tx, s.yearId!, t.id);
    if (input.givenTo === "STUDENTS") {
      const chosen = new Set(input.studentIds);
      students = students.filter((x) => chosen.has(x.id));
      if (!students.length) throw new HomeworkProblem("Choose at least one student of this section.", "studentIds");
    }
    const hw = await tx.homework.create({
      data: {
        schoolId: ctx.schoolId, academicYearId: s.yearId!, sectionId: t.id, classId: t.classId, subjectId: subject.id, teacherId: s.staffId, groupId,
        title, instructions: input.instructions?.trim() || null, givenTo: input.givenTo, startDate: input.startDate, dueDate: input.dueDate,
        maxMarks: input.maxMarks, onlineSubmission: input.onlineSubmission && settings.onlineSubmission, fromSuggestion: input.fromSuggestion, createdById: ctx.userId,
      },
    });
    await tx.submission.createMany({ data: students.map((st) => ({ schoolId: ctx.schoolId, homeworkId: hw.id, studentId: st.id })) });
    made.push({ id: hw.id, sectionLabel: t.label, students: students.length });
    await writeAudit(tx, ctx, {
      action: "created", recordType: "Homework", recordId: hw.id,
      after: { title, section: t.label, subject: subject.name, givenTo: input.givenTo, students: students.length, start: formatDate(input.startDate), due: formatDate(input.dueDate), maxMarks: input.maxMarks },
      actorNote: input.fromSuggestion ? "Drafted by the teacher assistant, checked and sent by the teacher" : null,
    });
    // Students with logins get an app notification (17 §2 "Students are notified when homework is set").
    for (const st of students) {
      if (st.userLoginId) await notify(tx, ctx, { to: st.userLoginId, type: "homework-set", text: `New homework in ${subject.name}: ${title}. Due ${dayDate(input.dueDate)}.`, link: "/homework-learning", groupKey: "homework-set", mergedText: (n) => `${n} new homework` });
    }
    await tellParentsHomeworkSet(tx, ctx, { homeworkId: hw.id, title, subject: subject.name, sectionLabel: t.label, dueDate: input.dueDate, studentIds: students.map((x) => x.id) });
  }
  await addAttachments(tx, ctx, made.map((m) => m.id), input.attachments);
  return { made, subject: subject.name };
}

export type EditInput = { title: string; instructions: string | null; startDate: Date; dueDate: Date; maxMarks: number; onlineSubmission: boolean; attachments: NewAttachment[]; removeAttachmentIds: string[] };

export async function editHomework(tx: Tx, s: HomeworkScope, id: string, input: EditInput) {
  const hw = await tx.homework.findFirst({ where: { id, archivedAt: null } });
  if (!hw) throw new HomeworkProblem("This homework was not found. It may have been archived.");
  requireWork(s, hw, "this homework");
  const year = await tx.academicYear.findUnique({ where: { id: hw.academicYearId }, select: { status: true } });
  if (year?.status === "CLOSED") throw new HomeworkProblem("This academic year is closed, so its homework can only be read.");
  const title = input.title.trim().replace(/\s+/g, " ");
  if (!title) throw new HomeworkProblem("Give the homework a title, like “Exercise 4.3”.", "title");
  if (input.dueDate.getTime() < input.startDate.getTime()) throw new HomeworkProblem("Due date is before the start date.", "dueDate");
  if (!Number.isInteger(input.maxMarks) || input.maxMarks < 1 || input.maxMarks > 100) throw new HomeworkProblem("Maximum marks must be from 1 to 100.", "maxMarks");
  const top = await tx.submission.aggregate({ where: { homeworkId: id, archivedAt: null }, _max: { score: true } });
  if (top._max.score !== null && top._max.score > input.maxMarks) throw new HomeworkProblem(`A student already has ${top._max.score}. The maximum cannot be below that.`, "maxMarks");
  const before = { title: hw.title, instructions: hw.instructions, start: formatDate(hw.startDate), due: formatDate(hw.dueDate), maxMarks: hw.maxMarks, onlineSubmission: hw.onlineSubmission };
  // A due date moved later gives Missing work back its chance (it is Assigned again).
  const reopen = input.dueDate.getTime() > hw.dueDate.getTime();
  await tx.homework.update({ where: { id }, data: { title, instructions: input.instructions?.trim() || null, startDate: input.startDate, dueDate: input.dueDate, maxMarks: input.maxMarks, onlineSubmission: input.onlineSubmission, updatedById: s.ctx.userId, ...(reopen ? { missingMarkedAt: null } : {}) } });
  if (reopen) await tx.submission.updateMany({ where: { homeworkId: id, status: "MISSING" }, data: { status: "ASSIGNED" } });
  if (input.removeAttachmentIds.length) await tx.homeworkAttachment.updateMany({ where: { homeworkId: id, id: { in: input.removeAttachmentIds }, archivedAt: null }, data: { archivedAt: new Date() } });
  await addAttachments(tx, s.ctx, [id], input.attachments);
  await writeAudit(tx, s.ctx, { action: "changed", recordType: "Homework", recordId: id, before, after: { title, instructions: input.instructions, start: formatDate(input.startDate), due: formatDate(input.dueDate), maxMarks: input.maxMarks, onlineSubmission: input.onlineSubmission, filesAdded: input.attachments.length, filesRemoved: input.removeAttachmentIds.length } });
  return { title };
}

export async function archiveHomework(tx: Tx, s: HomeworkScope, id: string) {
  const hw = await tx.homework.findFirst({ where: { id, archivedAt: null } });
  if (!hw) throw new HomeworkProblem("This homework was not found. It may already be archived.");
  requireWork(s, hw, "this homework");
  await tx.homework.update({ where: { id }, data: { archivedAt: new Date(), archivedById: s.ctx.userId } });
  await writeAudit(tx, s.ctx, { action: "archived", recordType: "Homework", recordId: id, before: { title: hw.title } });
  return hw;
}

export async function restoreHomework(tx: Tx, s: HomeworkScope, id: string) {
  const hw = await tx.homework.findFirst({ where: { id, archivedAt: { not: null } } });
  if (!hw) throw new HomeworkProblem("This homework is not archived.");
  requireWork(s, hw, "this homework");
  await tx.homework.update({ where: { id }, data: { archivedAt: null, archivedById: null } });
  await writeAudit(tx, s.ctx, { action: "restored", recordType: "Homework", recordId: id, after: { title: hw.title } });
  return hw;
}

// ---------------------------------------------------------------- counts and lists

export type Counts = { assigned: number; submitted: number; graded: number; toCheck: number; late: number; notIn: number; excused: number };

/** Submission counts per homework, all from the submissions table so the card and the table always agree (17 §9.3). */
export async function countsFor(tx: Tx, ids: string[]): Promise<Map<string, Counts>> {
  const rows = ids.length ? await tx.submission.groupBy({ by: ["homeworkId", "status"], where: { homeworkId: { in: ids }, archivedAt: null }, _count: true }) : [];
  const out = new Map<string, Counts>();
  for (const id of ids) out.set(id, { assigned: 0, submitted: 0, graded: 0, toCheck: 0, late: 0, notIn: 0, excused: 0 });
  for (const r of rows) {
    const c = out.get(r.homeworkId)!;
    if (r.status === "EXCUSED") { c.excused += r._count; continue; }
    c.assigned += r._count;
    if ((HANDED_IN as readonly string[]).includes(r.status)) c.submitted += r._count;
    if (r.status === "GRADED") c.graded += r._count;
    if ((TO_CHECK as readonly string[]).includes(r.status)) c.toCheck += r._count;
    if (r.status === "LATE") c.late += r._count;
    if (r.status === "ASSIGNED" || r.status === "MISSING") c.notIn += r._count;
  }
  return out;
}

/** First time a parent of each student saw each homework (WhatsApp read receipts; Parent Link opens once it shows homework). */
export async function seenFor(tx: Tx, homeworkIds: string[]) {
  if (!homeworkIds.length) return new Map<string, Map<string, { at: Date; via: string }>>();
  const rows = await tx.messageRecipient.findMany({
    where: { recipientType: "guardian", readAt: { not: null }, message: { sourceType: "Homework", sourceId: { in: homeworkIds } } },
    select: { studentId: true, guardianId: true, readAt: true, channel: true, message: { select: { sourceId: true } } },
    orderBy: { readAt: "asc" },
  });
  // A message to a parent of brothers and sisters may carry no student: count it for each of their children in the homework.
  const guardianIds = [...new Set(rows.filter((r) => !r.studentId && r.guardianId).map((r) => r.guardianId!))];
  const kids = guardianIds.length ? await tx.studentGuardian.findMany({ where: { guardianId: { in: guardianIds }, archivedAt: null }, select: { guardianId: true, studentId: true } }) : [];
  const out = new Map<string, Map<string, { at: Date; via: string }>>();
  for (const r of rows) {
    const hw = r.message.sourceId!;
    const m = out.get(hw) ?? new Map();
    out.set(hw, m);
    const students = r.studentId ? [r.studentId] : kids.filter((k) => k.guardianId === r.guardianId).map((k) => k.studentId);
    for (const st of students) if (!m.has(st)) m.set(st, { at: r.readAt!, via: r.channel === "whatsapp" ? "WhatsApp" : r.channel === "sms" ? "SMS" : r.channel === "email" ? "Email" : "Parent Link" });
  }
  return out;
}

/** Homework that had a message to parents (so "Seen by" means something). */
export async function messagedHomework(tx: Tx, homeworkIds: string[]) {
  if (!homeworkIds.length) return new Set<string>();
  const rows = await tx.message.findMany({ where: { sourceType: "Homework", sourceId: { in: homeworkIds } }, select: { sourceId: true }, distinct: ["sourceId"] });
  return new Set(rows.map((r) => r.sourceId!));
}

export type HomeworkRow = {
  id: string; title: string; sectionId: string; subjectId: string; teacherId: string | null; sectionLabel: string; className: string; subject: string; teacher: string;
  startDate: Date; dueDate: Date; maxMarks: number; status: HomeworkStatus; counts: Counts; seen: number | null; files: number; givenTo: string; archived: boolean;
};

export type ListFilter = { history?: boolean; classId?: string | null; subjectId?: string | null; q?: string; from?: Date | null; to?: Date | null; archived?: boolean; status?: string | null };

/** The homework this person may read, with counts. Current: due today or later; History: past due and closed. */
export async function listHomework(tx: Tx, s: HomeworkScope, today: Date, f: ListFilter = {}) {
  const where: Prisma.HomeworkWhereInput = {
    academicYearId: s.yearId ?? undefined,
    archivedAt: f.archived ? { not: null } : null,
    ...(s.level === "student" ? { submissions: { some: { studentId: s.student?.id ?? "00000000-0000-0000-0000-000000000000", archivedAt: null } } } : {}),
    ...(s.level === "own" ? { OR: [...s.pairs.map((p) => ({ sectionId: p.sectionId, subjectId: p.subjectId })), ...(s.staffId ? [{ teacherId: s.staffId }] : []), ...(s.ctSections.length ? [{ sectionId: { in: s.ctSections } }] : [])] } : {}),
    ...(f.classId ? { classId: f.classId } : {}),
    ...(f.subjectId ? { subjectId: f.subjectId } : {}),
    ...(f.q ? { title: { contains: f.q, mode: "insensitive" as const } } : {}),
    ...(f.from && f.to ? { startDate: { lte: f.to }, dueDate: { gte: f.from } } : {}),
  };
  if (s.level === "own" && !(where.OR as unknown[]).length) where.OR = [{ id: "00000000-0000-0000-0000-000000000000" }];
  const rows = await tx.homework.findMany({ where, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }], include: { _count: { select: { attachments: { where: { archivedAt: null } } } } } });
  const [counts, seen, messaged, sections, subjects, staff] = await Promise.all([
    countsFor(tx, rows.map((r) => r.id)),
    seenFor(tx, rows.map((r) => r.id)),
    messagedHomework(tx, rows.map((r) => r.id)),
    tx.section.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.sectionId))] } }, include: { schoolClass: { select: { name: true } } } }),
    tx.subject.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.subjectId))] } }, select: { id: true, name: true } }),
    tx.staff.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.teacherId).filter((x): x is string => !!x))] } }, select: { id: true, fullName: true } }),
  ]);
  const sec = new Map(sections.map((x) => [x.id, x]));
  const sub = new Map(subjects.map((x) => [x.id, x.name]));
  const who = new Map(staff.map((x) => [x.id, x.fullName]));
  const all: HomeworkRow[] = rows.map((h) => {
    const c = counts.get(h.id)!;
    const x = sec.get(h.sectionId);
    return {
      id: h.id, title: h.title, sectionId: h.sectionId, subjectId: h.subjectId, teacherId: h.teacherId,
      sectionLabel: x ? shortSection(x.schoolClass.name, x.name) : "", className: x?.schoolClass.name ?? "", subject: sub.get(h.subjectId) ?? "", teacher: h.teacherId ? who.get(h.teacherId) ?? "" : "",
      startDate: h.startDate, dueDate: h.dueDate, maxMarks: h.maxMarks, status: homeworkStatus(h, today, c), counts: c,
      seen: messaged.has(h.id) ? (seen.get(h.id)?.size ?? 0) : null, files: h._count.attachments, givenTo: h.givenTo, archived: !!h.archivedAt,
    };
  });
  const byTab = f.archived ? all : all.filter((r) => (f.history ? r.status !== "Current" : r.status === "Current"));
  const byStatus = f.status ? byTab.filter((r) => r.status === f.status) : byTab;
  // History newest first.
  if (f.history) byStatus.sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime());
  return { rows: byStatus, all };
}

/** Totals for the band at the top of Homework: this week's homework. */
export function bandTotals(rows: HomeworkRow[]) {
  const assigned = rows.reduce((a, r) => a + r.counts.assigned, 0);
  const submitted = rows.reduce((a, r) => a + r.counts.submitted, 0);
  const toCheck = rows.reduce((a, r) => a + r.counts.toCheck, 0);
  const messaged = rows.filter((r) => r.seen !== null);
  const seenOf = messaged.reduce((a, r) => a + r.counts.assigned, 0);
  const seen = messaged.reduce((a, r) => a + (r.seen ?? 0), 0);
  return { given: rows.length, assigned, submitted, toCheck, classes: new Set(rows.map((r) => r.sectionId)).size, seen, seenOf, messaged: messaged.length };
}

/** One homework with everything the details page needs, if this person may read it. */
export async function homeworkDetail(tx: Tx, s: HomeworkScope, id: string, today: Date) {
  const h = await tx.homework.findFirst({ where: { id }, include: { attachments: { where: { archivedAt: null }, orderBy: { createdAt: "asc" } } } });
  if (!h) return null;
  if (!mayRead(s, h)) return null;
  if (s.level === "student" && !(await tx.submission.findFirst({ where: { homeworkId: id, studentId: s.student?.id ?? "", archivedAt: null } }))) return null;
  const [section, subject, teacher, subs] = await Promise.all([
    tx.section.findUnique({ where: { id: h.sectionId }, include: { schoolClass: { select: { name: true } } } }),
    tx.subject.findUnique({ where: { id: h.subjectId }, select: { name: true } }),
    h.teacherId ? tx.staff.findUnique({ where: { id: h.teacherId }, select: { fullName: true } }) : null,
    tx.submission.findMany({ where: { homeworkId: id, archivedAt: null } }),
  ]);
  const counts = (await countsFor(tx, [id])).get(id)!;
  return {
    hw: h, counts, subs,
    sectionLabel: section ? shortSection(section.schoolClass.name, section.name) : "", className: section?.schoolClass.name ?? "",
    subject: subject?.name ?? "", teacher: teacher?.fullName ?? "", status: homeworkStatus(h, today, counts), pastDue: isPastDue(h.dueDate, today),
  };
}

export const givenToWords = (givenTo: string, students: number, sectionLabel: string) =>
  givenTo === "STUDENTS" ? `Chosen students · ${plural(students, "student")}` : givenTo === "CLASS" ? `Whole class · ${plural(students, "student")} in ${sectionLabel}` : `Whole section · ${plural(students, "student")}`;
