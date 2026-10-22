// Study Material (17 §2): a course workspace for each section and subject,
// with lessons in order (the learning path), each holding notes, documents,
// videos and links; lessons are published or hidden, reordered, and a course
// can be copied to another section. Who opened each lesson is kept (Lesson
// View), and students mark lessons done. Students see only the courses the
// Course access rules give them (Homework Settings).
import "server-only";

import type { LessonItemKind } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { saveFile, DOCUMENT_TYPES, FileProblem } from "../files";
import { flatten, syllabusTree } from "../academic/syllabus";
import { HomeworkProblem } from "./access";
import { inYears, mayRead, onCampus, requireDesk, requireWork, requireYearOpen, shortSection, type HomeworkScope } from "./scope";
import { homeworkSettings } from "./settings";
import { sectionStudents } from "./homework";
import { checkLink } from "./homework";

export type CourseRow = {
  id: string | null; sectionId: string; classId: string; subjectId: string; sectionLabel: string; subject: string; teacher: string;
  teacherId: string | null; lessons: number; visible: number; students: number; canWork: boolean;
  /** The section's own academic year (each campus has its own). */
  yearId: string;
};

/**
 * The courses this person may open: a teacher's own sections and subjects (and,
 * when the settings allow, every subject of the class they are class teacher of);
 * every taught pair for Full reach (on their campus, when limited to one); a
 * student's own section (or whole class). Each campus's own current year.
 */
export async function courseList(tx: Tx, s: HomeworkScope): Promise<CourseRow[]> {
  const years = inYears(s);
  if (!years) return [];
  const settings = await homeworkSettings(tx, s.ctx);
  let pairs: { sectionId: string; subjectId: string; staffId: string | null }[] = [];
  const alloc = await tx.teacherAllocation.findMany({ where: { academicYearId: years, archivedAt: null, ...(s.campusSections ? { sectionId: { in: s.campusSections } } : {}) }, select: { sectionId: true, subjectId: true, staffId: true } });
  if (s.level === "full") pairs = alloc;
  else if (s.level === "own") {
    const ct = settings.classTeacherReadsCourses ? s.ctSections : [];
    pairs = alloc.filter((a) => s.pairs.some((p) => p.sectionId === a.sectionId && p.subjectId === a.subjectId) || ct.includes(a.sectionId));
    for (const p of s.pairs) if (!pairs.some((x) => x.sectionId === p.sectionId && x.subjectId === p.subjectId)) pairs.push({ ...p, staffId: s.staffId });
  } else if (s.student) {
    const sectionIds = settings.studentCourses === "class"
      ? (await tx.section.findMany({ where: { classId: s.student.classId, academicYearId: years, archivedAt: null }, select: { id: true } })).map((x) => x.id)
      : [s.student.sectionId];
    pairs = alloc.filter((a) => sectionIds.includes(a.sectionId));
  }
  // One row per section and subject (two teachers sharing a subject are one course).
  const seen = new Map<string, (typeof pairs)[number]>();
  for (const p of pairs) if (!seen.has(`${p.sectionId}|${p.subjectId}`)) seen.set(`${p.sectionId}|${p.subjectId}`, p);
  const list = [...seen.values()];
  if (!list.length) return [];
  const [courses, sections, subjects, staff, counts] = await Promise.all([
    tx.course.findMany({ where: { academicYearId: years, archivedAt: null, sectionId: { in: list.map((p) => p.sectionId) } }, include: { lessons: { where: { archivedAt: null }, select: { visible: true } } } }),
    tx.section.findMany({ where: { id: { in: list.map((p) => p.sectionId) } }, include: { schoolClass: { select: { name: true, sortOrder: true } } } }),
    tx.subject.findMany({ where: { id: { in: list.map((p) => p.subjectId) } }, select: { id: true, name: true } }),
    tx.staff.findMany({ where: { id: { in: list.map((p) => p.staffId).filter((x): x is string => !!x) } }, select: { id: true, fullName: true } }),
    tx.enrolment.groupBy({ by: ["sectionId"], where: { academicYearId: years, archivedAt: null, status: "STUDYING", sectionId: { in: list.map((p) => p.sectionId) } }, _count: true }),
  ]);
  const sec = new Map(sections.map((x) => [x.id, x]));
  const sub = new Map(subjects.map((x) => [x.id, x.name]));
  const who = new Map(staff.map((x) => [x.id, x.fullName]));
  const n = new Map(counts.map((c) => [c.sectionId, c._count]));
  const rows = list.map((p) => {
    const c = courses.find((x) => x.sectionId === p.sectionId && x.subjectId === p.subjectId);
    const x = sec.get(p.sectionId);
    const teacherId = c?.teacherId ?? p.staffId;
    return {
      id: c?.id ?? null, sectionId: p.sectionId, classId: x?.classId ?? "", subjectId: p.subjectId,
      sectionLabel: x ? shortSection(x.schoolClass.name, x.name) : "", subject: sub.get(p.subjectId) ?? "", teacher: teacherId ? who.get(teacherId) ?? "" : "", teacherId,
      lessons: c?.lessons.length ?? 0, visible: c?.lessons.filter((l) => l.visible).length ?? 0, students: n.get(p.sectionId) ?? 0,
      canWork: s.modes["study-material"] === "edit" && (s.level === "full" || s.pairs.some((q) => q.sectionId === p.sectionId && q.subjectId === p.subjectId)),
      yearId: x?.academicYearId ?? "",
      sort: x?.schoolClass.sortOrder ?? 0,
    };
  });
  // Students see only courses with something to read.
  const shown = s.level === "student" ? rows.filter((r) => r.visible > 0) : rows;
  return shown.sort((a, b) => a.sort - b.sort || a.sectionLabel.localeCompare(b.sectionLabel) || a.subject.localeCompare(b.subject)).map((r) => { const { sort, ...rest } = r; void sort; return rest; });
}

/** The course of a section and subject, made the first time a teacher adds to it. */
export async function ensureCourse(tx: Tx, s: HomeworkScope, sectionId: string, subjectId: string) {
  requireDesk(s, "study-material");
  requireYearOpen(s);
  // The class in one of the person's current years (each campus has its own); another campus's class is not found.
  const section = await tx.section.findFirst({ where: { id: sectionId, academicYearId: { in: s.yearIds }, archivedAt: null } });
  if (!section || !onCampus(s, section.id)) throw new HomeworkProblem("This class was not found in this academic year.");
  requireYearOpen(s, section.academicYearId);
  const existing = await tx.course.findFirst({ where: { academicYearId: section.academicYearId, sectionId, subjectId, archivedAt: null } });
  const alloc = await tx.teacherAllocation.findFirst({ where: { sectionId, subjectId, academicYearId: section.academicYearId, archivedAt: null }, select: { staffId: true } });
  requireWork(s, { sectionId, subjectId, teacherId: existing?.teacherId ?? alloc?.staffId ?? null }, "this course", "study-material");
  if (existing) return existing;
  const c = await tx.course.create({ data: { schoolId: s.ctx.schoolId, academicYearId: section.academicYearId, sectionId, classId: section.classId, subjectId, teacherId: alloc?.staffId ?? s.staffId, createdById: s.ctx.userId } });
  await writeAudit(tx, s.ctx, { action: "created", recordType: "Course", recordId: c.id, after: { sectionId, subjectId } });
  return c;
}

async function courseFor(tx: Tx, s: HomeworkScope, courseId: string, write: boolean) {
  const c = await tx.course.findFirst({ where: { id: courseId, archivedAt: null } });
  if (!c || !onCampus(s, c.sectionId)) throw new HomeworkProblem("This course was not found.");
  if (write) {
    requireWork(s, c, "this course", "study-material");
    const y = await tx.academicYear.findUnique({ where: { id: c.academicYearId }, select: { status: true } });
    if (y?.status === "CLOSED") throw new HomeworkProblem("This academic year is closed, so its courses can only be read.");
  } else if (!(await mayReadCourse(tx, s, c))) throw new HomeworkProblem("This course was not found.");
  return c;
}

async function mayReadCourse(tx: Tx, s: HomeworkScope, c: { sectionId: string; subjectId: string; classId: string; teacherId: string | null }) {
  const settings = await homeworkSettings(tx, s.ctx);
  if (s.level === "student") {
    if (!s.student) return false;
    return settings.studentCourses === "class" ? c.classId === s.student.classId : c.sectionId === s.student.sectionId;
  }
  if (s.level === "own" && !settings.classTeacherReadsCourses) return s.pairs.some((p) => p.sectionId === c.sectionId && p.subjectId === c.subjectId) || c.teacherId === s.staffId;
  return mayRead(s, c);
}

export type LessonItemInput = { kind: "file"; file: File } | { kind: "link"; url: string; name?: string };

const KIND_OF_LINK = (url: string): LessonItemKind => (/youtube\.com|youtu\.be|vimeo\.com|drive\.google\.com\/file/i.test(url) ? "VIDEO" : "LINK");

async function addItems(tx: Tx, s: HomeworkScope, lessonId: string, items: LessonItemInput[], startAt = 0) {
  let i = startAt;
  for (const it of items) {
    if (it.kind === "link") {
      const url = checkLink(it.url);
      if (!url) throw new HomeworkProblem("That link does not look right. Paste a full web address, like https://youtu.be/…", "link");
      await tx.lessonItem.create({ data: { schoolId: s.ctx.schoolId, lessonId, kind: KIND_OF_LINK(url), name: it.name?.trim() || new URL(url).hostname.replace(/^www\./, ""), url, sortOrder: i++ } });
      continue;
    }
    try {
      const stored = await saveFile(tx, s.ctx, { file: it.file, purpose: "study-material", allowed: DOCUMENT_TYPES, maxImageWidth: 2000 });
      await tx.lessonItem.create({ data: { schoolId: s.ctx.schoolId, lessonId, kind: stored.contentType === "application/pdf" ? "DOCUMENT" : "NOTES", name: stored.fileName, fileId: stored.id, sizeBytes: stored.sizeBytes, sortOrder: i++ } });
    } catch (e) {
      if (e instanceof FileProblem) throw new HomeworkProblem(e.message, "files");
      throw e;
    }
  }
}

export type LessonInput = { title: string; chapterId: string | null; notes: string | null; visible: boolean; items: LessonItemInput[] };

function checkLesson(input: LessonInput, needContent: boolean) {
  const title = input.title.trim().replace(/\s+/g, " ");
  if (!title) throw new HomeworkProblem("Give the lesson a title, like “Simple Equations”.", "title");
  if (title.length > 160) throw new HomeworkProblem("The title can be at most 160 characters.", "title");
  if ((input.notes ?? "").length > 8000) throw new HomeworkProblem("Notes can be at most 8,000 characters.", "notes");
  if (needContent && !input.notes?.trim() && !input.items.length) throw new HomeworkProblem("Add the content: type notes, upload a file or add a video link.", "notes");
  return title;
}

/** A chapter of the course's own class's syllabus (so never another campus's). */
async function chapterTitle(tx: Tx, chapterId: string | null, classId: string) {
  if (!chapterId) return null;
  const c = await tx.syllabusItem.findFirst({ where: { id: chapterId, classId, archivedAt: null }, select: { title: true, kind: true } });
  if (!c) throw new HomeworkProblem("That chapter was not found in the syllabus.", "chapterId");
  return c.title;
}

/** Adds a lesson at the end of the learning path. Students with logins hear about it when it is visible. */
export async function addLesson(tx: Tx, s: HomeworkScope, courseId: string, input: LessonInput) {
  const c = await courseFor(tx, s, courseId, true);
  const title = checkLesson(input, true);
  const last = await tx.lesson.aggregate({ where: { courseId, archivedAt: null }, _max: { sortOrder: true } });
  const l = await tx.lesson.create({
    data: { schoolId: s.ctx.schoolId, courseId, title, chapterId: input.chapterId, chapterTitle: await chapterTitle(tx, input.chapterId, c.classId), notes: input.notes?.trim() || null, visible: input.visible, sortOrder: (last._max.sortOrder ?? -1) + 1, createdById: s.ctx.userId },
  });
  await addItems(tx, s, l.id, input.items);
  await writeAudit(tx, s.ctx, { action: "created", recordType: "Lesson", recordId: l.id, after: { title, visible: input.visible, items: input.items.length } });
  if (input.visible) await tellStudents(tx, s.ctx, c, `New lesson: ${title}`);
  return l;
}

export async function editLesson(tx: Tx, s: HomeworkScope, lessonId: string, input: LessonInput & { removeItemIds: string[] }) {
  const l = await tx.lesson.findFirst({ where: { id: lessonId, archivedAt: null } });
  if (!l) throw new HomeworkProblem("This lesson was not found.");
  const c = await courseFor(tx, s, l.courseId, true);
  const title = checkLesson(input, false);
  if (input.removeItemIds.length) await tx.lessonItem.updateMany({ where: { lessonId, id: { in: input.removeItemIds }, archivedAt: null }, data: { archivedAt: new Date() } });
  const last = await tx.lessonItem.aggregate({ where: { lessonId, archivedAt: null }, _max: { sortOrder: true } });
  await addItems(tx, s, lessonId, input.items, (last._max.sortOrder ?? -1) + 1);
  const left = await tx.lessonItem.count({ where: { lessonId, archivedAt: null } });
  if (!left && !input.notes?.trim()) throw new HomeworkProblem("A lesson needs some content: notes, a file or a link.", "notes");
  await tx.lesson.update({ where: { id: lessonId }, data: { title, chapterId: input.chapterId, chapterTitle: await chapterTitle(tx, input.chapterId, c.classId), notes: input.notes?.trim() || null, visible: input.visible } });
  await writeAudit(tx, s.ctx, { action: "changed", recordType: "Lesson", recordId: lessonId, before: { title: l.title, visible: l.visible }, after: { title, visible: input.visible, added: input.items.length, removed: input.removeItemIds.length } });
}

/** Publish or hide one lesson (with Undo). */
export async function setLessonVisible(tx: Tx, s: HomeworkScope, lessonId: string, visible: boolean) {
  const l = await tx.lesson.findFirst({ where: { id: lessonId, archivedAt: null } });
  if (!l) throw new HomeworkProblem("This lesson was not found.");
  const c = await courseFor(tx, s, l.courseId, true);
  if (l.visible === visible) return l;
  await tx.lesson.update({ where: { id: lessonId }, data: { visible } });
  await writeAudit(tx, s.ctx, { action: visible ? "published" : "hidden", recordType: "Lesson", recordId: lessonId, before: { visible: l.visible }, after: { visible, title: l.title } });
  if (visible) await tellStudents(tx, s.ctx, c, `New lesson: ${l.title}`);
  return l;
}

/** Moves a lesson one place up or down in the learning path. */
export async function moveLesson(tx: Tx, s: HomeworkScope, lessonId: string, dir: "up" | "down") {
  const l = await tx.lesson.findFirst({ where: { id: lessonId, archivedAt: null } });
  if (!l) throw new HomeworkProblem("This lesson was not found.");
  await courseFor(tx, s, l.courseId, true);
  const all = await tx.lesson.findMany({ where: { courseId: l.courseId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } });
  const i = all.findIndex((x) => x.id === lessonId);
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  for (let k = 0; k < all.length; k++) await tx.lesson.update({ where: { id: all[k].id }, data: { sortOrder: k } });
  await writeAudit(tx, s.ctx, { action: "reordered", recordType: "Lesson", recordId: lessonId, after: { title: l.title, place: j + 1 } });
}

export async function archiveLesson(tx: Tx, s: HomeworkScope, lessonId: string) {
  const l = await tx.lesson.findFirst({ where: { id: lessonId, archivedAt: null } });
  if (!l) throw new HomeworkProblem("This lesson was not found. It may already be archived.");
  await courseFor(tx, s, l.courseId, true);
  await tx.lesson.update({ where: { id: lessonId }, data: { archivedAt: new Date() } });
  await writeAudit(tx, s.ctx, { action: "archived", recordType: "Lesson", recordId: lessonId, before: { title: l.title } });
  return l;
}

export async function restoreLesson(tx: Tx, s: HomeworkScope, lessonId: string) {
  const l = await tx.lesson.findFirst({ where: { id: lessonId, archivedAt: { not: null } } });
  if (!l) throw new HomeworkProblem("This lesson is not archived.");
  await courseFor(tx, s, l.courseId, true);
  await tx.lesson.update({ where: { id: lessonId }, data: { archivedAt: null } });
  await writeAudit(tx, s.ctx, { action: "restored", recordType: "Lesson", recordId: lessonId, after: { title: l.title } });
}

/** Copies every lesson and its items to another section's course of the same subject. They start hidden there. */
export async function copyCourse(tx: Tx, s: HomeworkScope, courseId: string, toSectionId: string) {
  const from = await courseFor(tx, s, courseId, true);
  if (toSectionId === from.sectionId) throw new HomeworkProblem("Choose another section to copy to.", "toSectionId");
  const target = await ensureCourse(tx, s, toSectionId, from.subjectId);
  const lessons = await tx.lesson.findMany({ where: { courseId, archivedAt: null }, orderBy: { sortOrder: "asc" }, include: { items: { where: { archivedAt: null }, orderBy: { sortOrder: "asc" } } } });
  if (!lessons.length) throw new HomeworkProblem("This course has no lessons to copy yet.");
  const last = await tx.lesson.aggregate({ where: { courseId: target.id, archivedAt: null }, _max: { sortOrder: true } });
  let order = (last._max.sortOrder ?? -1) + 1;
  for (const l of lessons) {
    const copy = await tx.lesson.create({ data: { schoolId: s.ctx.schoolId, courseId: target.id, title: l.title, chapterId: l.chapterId, chapterTitle: l.chapterTitle, notes: l.notes, visible: false, sortOrder: order++, createdById: s.ctx.userId } });
    if (l.items.length) await tx.lessonItem.createMany({ data: l.items.map((it) => ({ schoolId: s.ctx.schoolId, lessonId: copy.id, kind: it.kind, name: it.name, fileId: it.fileId, url: it.url, sizeBytes: it.sizeBytes, sortOrder: it.sortOrder })) });
  }
  await writeAudit(tx, s.ctx, { action: "copied", recordType: "Course", recordId: target.id, after: { from: courseId, lessons: lessons.length } });
  return { lessons: lessons.length, courseId: target.id };
}

/** One course with its lessons, items and who opened each lesson. */
export async function courseDetail(tx: Tx, s: HomeworkScope, courseId: string) {
  const c = await courseFor(tx, s, courseId, false);
  const lessons = await tx.lesson.findMany({
    where: { courseId, archivedAt: null, ...(s.level === "student" ? { visible: true } : {}) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { items: { where: { archivedAt: null }, orderBy: { sortOrder: "asc" } }, views: s.level === "student" ? { where: { studentId: s.student?.id ?? "" } } : { select: { studentId: true, doneAt: true } } },
  });
  return { course: c, lessons };
}

/** Chapters of the syllabus for this course's class and subject, for the Lesson form. */
export async function chaptersFor(tx: Tx, yearId: string, c: { classId: string; subjectId: string; sectionId: string }, today: Date) {
  const tree = await syllabusTree(tx, yearId, c.classId, c.subjectId, c.sectionId, today);
  return flatten(tree).filter((n) => n.kind === "CHAPTER" || n.kind === "UNIT" || n.depth === 0).map((n) => ({ id: n.id, title: n.title, kind: n.kind }));
}

/** A student opens a lesson: the first time is kept, for "Opened by 31 of 38". */
export async function openLesson(tx: Tx, s: HomeworkScope, lessonId: string) {
  if (s.level !== "student" || !s.student) return null;
  const l = await tx.lesson.findFirst({ where: { id: lessonId, archivedAt: null, visible: true } });
  if (!l) throw new HomeworkProblem("This lesson was not found.");
  await courseFor(tx, s, l.courseId, false);
  const existing = await tx.lessonView.findUnique({ where: { lessonId_studentId: { lessonId, studentId: s.student.id } } });
  if (existing) return existing;
  return tx.lessonView.create({ data: { schoolId: s.ctx.schoolId, lessonId, studentId: s.student.id } });
}

/** A student marks a lesson done, or not done. */
export async function markLessonDone(tx: Tx, s: HomeworkScope, lessonId: string, done: boolean) {
  if (s.level !== "student" || !s.student) throw new HomeworkProblem("Only students mark lessons done.");
  const v = await openLesson(tx, s, lessonId);
  await tx.lessonView.update({ where: { id: v!.id }, data: { doneAt: done ? new Date() : null } });
}

/** Who opened a lesson, for "Opened by 31 of 38". */
export async function lessonViewers(tx: Tx, s: HomeworkScope, lessonId: string) {
  const l = await tx.lesson.findFirst({ where: { id: lessonId, archivedAt: null } });
  if (!l) return null;
  const c = await courseFor(tx, s, l.courseId, false);
  if (s.level === "student") return null;
  const [students, views] = await Promise.all([sectionStudents(tx, c.academicYearId, c.sectionId), tx.lessonView.findMany({ where: { lessonId } })]);
  const v = new Map(views.map((x) => [x.studentId, x]));
  return { lesson: l, rows: students.map((st) => ({ ...st, openedAt: v.get(st.id)?.firstOpenedAt ?? null, doneAt: v.get(st.id)?.doneAt ?? null })) };
}

async function tellStudents(tx: Tx, ctx: SchoolContext, c: { sectionId: string; academicYearId: string; subjectId: string }, text: string) {
  const students = await sectionStudents(tx, c.academicYearId, c.sectionId);
  const subject = await tx.subject.findUnique({ where: { id: c.subjectId }, select: { name: true } });
  for (const st of students) {
    if (st.userLoginId) await notify(tx, ctx, { to: st.userLoginId, type: "lesson-added", text: `${subject?.name ?? "Study Material"}: ${text}`, link: "/homework-learning/study-material", groupKey: "lesson-added", mergedText: (n) => `${n} new lessons in Study Material` });
  }
}
