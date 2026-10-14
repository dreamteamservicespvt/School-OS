// Online Classes (17 §2): the online class schedule with meeting links (one
// class, or the same day and time every week), who joined (marked by the
// teacher), materials shared in the class and the recording link after.
// Students and staff get a reminder 15 minutes before the start.
import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { saveFile, DOCUMENT_TYPES, FileProblem } from "../files";
import { HomeworkProblem } from "./access";
import { requireDesk, requireWork, requireYearOpen, shortSection, workSections, workSubjects, type HomeworkScope } from "./scope";
import { checkLink, sectionStudents } from "./homework";
import { momentWords, sessionWord } from "./words";

const WEEK = 7 * 86_400_000;
export const REMIND_BEFORE_MIN = 15;
export const JOIN_OPENS_MIN = 10;

export type ScheduleInput = { sectionId: string; subjectId: string; title: string; startsAt: Date; lengthMin: number; meetingLink: string; repeatWeeks: number };

/** Schedules an online class, or one each week for some weeks. */
export async function scheduleClass(tx: Tx, s: HomeworkScope, input: ScheduleInput, now: Date, today: Date, timeZone: string) {
  requireDesk(s, "online-classes");
  requireYearOpen(s);
  const section = (await workSections(tx, s, "online-classes")).find((x) => x.id === input.sectionId);
  if (!section) throw new HomeworkProblem("Choose one of your classes that has students.", "sectionId");
  const subject = (await workSubjects(tx, s, section.id, section.classId, today)).find((x) => x.id === input.subjectId);
  if (!subject) throw new HomeworkProblem(`You do not teach this subject to ${section.label}.`, "subjectId");
  const title = input.title.trim().replace(/\s+/g, " ") || `${subject.name} for ${section.label}`;
  if (title.length > 160) throw new HomeworkProblem("The title can be at most 160 characters.", "title");
  if (input.startsAt.getTime() < now.getTime() - 5 * 60_000) throw new HomeworkProblem("This time has passed. Choose a time from now on.", "startsAt");
  if (!Number.isInteger(input.lengthMin) || input.lengthMin < 10 || input.lengthMin > 180) throw new HomeworkProblem("Length can be from 10 to 180 minutes.", "lengthMin");
  const link = checkLink(input.meetingLink);
  if (!link) throw new HomeworkProblem("Paste the meeting link, like https://meet.google.com/abc-defg-hij.", "meetingLink");
  if (!Number.isInteger(input.repeatWeeks) || input.repeatWeeks < 1 || input.repeatWeeks > 20) throw new HomeworkProblem("Repeat for 1 to 20 weeks.", "repeatWeeks");
  // The teacher cannot be in two online classes at once.
  if (s.staffId) {
    for (let w = 0; w < input.repeatWeeks; w++) {
      const start = new Date(input.startsAt.getTime() + w * WEEK);
      const end = new Date(start.getTime() + input.lengthMin * 60_000);
      const clash = await tx.onlineClassSession.findFirst({ where: { teacherId: s.staffId, archivedAt: null, status: "SCHEDULED", startsAt: { lt: end, gte: new Date(start.getTime() - 180 * 60_000) } } });
      if (clash && clash.startsAt.getTime() + clash.lengthMin * 60_000 > start.getTime()) throw new HomeworkProblem(`You already have “${clash.title}” at ${momentWords(clash.startsAt, timeZone)}.`, "startsAt");
    }
  }
  const seriesId = input.repeatWeeks > 1 ? randomUUID() : null;
  const made = [];
  for (let w = 0; w < input.repeatWeeks; w++) {
    made.push(await tx.onlineClassSession.create({
      data: {
        schoolId: s.ctx.schoolId, academicYearId: s.yearId!, sectionId: section.id, classId: section.classId, subjectId: subject.id, teacherId: s.staffId, title,
        startsAt: new Date(input.startsAt.getTime() + w * WEEK), lengthMin: input.lengthMin, meetingLink: link, seriesId, createdById: s.ctx.userId,
      },
    }));
  }
  await writeAudit(tx, s.ctx, { action: "scheduled", recordType: "Online Class Session", recordId: made[0].id, after: { title, section: section.label, subject: subject.name, starts: input.startsAt.toISOString(), weeks: input.repeatWeeks } });
  const students = await sectionStudents(tx, s.yearId!, section.id);
  for (const st of students) {
    if (st.userLoginId) await notify(tx, s.ctx, { to: st.userLoginId, type: "online-class", text: `Online class: ${title}, ${momentWords(input.startsAt, timeZone)}.`, link: "/homework-learning/online-classes", groupKey: "online-class", mergedText: (n) => `${n} online classes scheduled` }, now);
  }
  return { made, section: section.label };
}

async function sessionFor(tx: Tx, s: HomeworkScope, id: string) {
  const x = await tx.onlineClassSession.findFirst({ where: { id, archivedAt: null } });
  if (!x) throw new HomeworkProblem("This online class was not found.");
  requireWork(s, x, "this online class", "online-classes");
  return x;
}

/** Cancels a class that has not happened; students are told. Undo puts it back. */
export async function cancelClass(tx: Tx, s: HomeworkScope, id: string, note: string, now: Date) {
  const x = await sessionFor(tx, s, id);
  if (x.status === "CANCELLED") throw new HomeworkProblem("This class is already cancelled.");
  if (sessionWord(x, now) === "Done") throw new HomeworkProblem("This class has already happened.");
  const why = note.trim() || "Cancelled by the teacher";
  await tx.onlineClassSession.update({ where: { id }, data: { status: "CANCELLED", cancelNote: why.slice(0, 200) } });
  await writeAudit(tx, s.ctx, { action: "cancelled", recordType: "Online Class Session", recordId: id, before: { status: x.status }, after: { status: "CANCELLED", note: why } });
  const students = await sectionStudents(tx, x.academicYearId, x.sectionId);
  for (const st of students) if (st.userLoginId) await notify(tx, s.ctx, { to: st.userLoginId, type: "online-class", text: `Cancelled: ${x.title}. ${why}`, link: "/homework-learning/online-classes", groupKey: "online-class-cancel" }, now);
  return x;
}

export async function restoreClass(tx: Tx, s: HomeworkScope, id: string) {
  const x = await sessionFor(tx, s, id);
  if (x.status !== "CANCELLED") return x;
  await tx.onlineClassSession.update({ where: { id }, data: { status: "SCHEDULED", cancelNote: null } });
  await writeAudit(tx, s.ctx, { action: "restored", recordType: "Online Class Session", recordId: id, after: { status: "SCHEDULED" } });
  return x;
}

/** Records who joined (from the teacher's list); everyone else did not. */
export async function markJoined(tx: Tx, s: HomeworkScope, id: string, joined: string[], now: Date) {
  const x = await sessionFor(tx, s, id);
  if (x.status === "CANCELLED") throw new HomeworkProblem("This class was cancelled.");
  if (x.startsAt.getTime() > now.getTime()) throw new HomeworkProblem("Attendance can be marked once the class has started.");
  const students = await sectionStudents(tx, x.academicYearId, x.sectionId);
  const set = new Set(joined);
  for (const st of students) {
    await tx.onlineClassAttendance.upsert({
      where: { sessionId_studentId: { sessionId: id, studentId: st.id } },
      create: { schoolId: s.ctx.schoolId, sessionId: id, studentId: st.id, joined: set.has(st.id), markedById: s.ctx.userId },
      update: { joined: set.has(st.id), markedById: s.ctx.userId, markedAt: now },
    });
  }
  const n = students.filter((st) => set.has(st.id)).length;
  await writeAudit(tx, s.ctx, { action: "attendance", recordType: "Online Class Session", recordId: id, after: { joined: n, of: students.length } });
  return { joined: n, of: students.length };
}

export async function addRecording(tx: Tx, s: HomeworkScope, id: string, url: string) {
  const x = await sessionFor(tx, s, id);
  const link = checkLink(url);
  if (!link) throw new HomeworkProblem("Paste the recording's full link, like https://drive.google.com/…", "url");
  if (x.recordingLinks.includes(link)) throw new HomeworkProblem("This recording is already added.", "url");
  await tx.onlineClassSession.update({ where: { id }, data: { recordingLinks: [...x.recordingLinks, link] } });
  await writeAudit(tx, s.ctx, { action: "recording-added", recordType: "Online Class Session", recordId: id, after: { url: link } });
}

export type Material = { name: string; url?: string; fileId?: string };

export async function addMaterial(tx: Tx, s: HomeworkScope, id: string, input: { file: File | null; url: string; name: string }) {
  const x = await sessionFor(tx, s, id);
  const list = (Array.isArray(x.materials) ? x.materials : []) as Material[];
  if (list.length >= 20) throw new HomeworkProblem("A class can share at most 20 materials.");
  let m: Material;
  if (input.file) {
    try {
      const f = await saveFile(tx, s.ctx, { file: input.file, purpose: "online-class", allowed: DOCUMENT_TYPES, maxImageWidth: 2000 });
      m = { name: input.name.trim() || f.fileName, fileId: f.id };
    } catch (e) {
      if (e instanceof FileProblem) throw new HomeworkProblem(e.message, "file");
      throw e;
    }
  } else {
    const link = checkLink(input.url);
    if (!link) throw new HomeworkProblem("Choose a file or paste a link.", "url");
    m = { name: input.name.trim() || new URL(link).hostname.replace(/^www\./, ""), url: link };
  }
  await tx.onlineClassSession.update({ where: { id }, data: { materials: [...list, m] as unknown as Prisma.InputJsonValue } });
  await writeAudit(tx, s.ctx, { action: "material-added", recordType: "Online Class Session", recordId: id, after: { name: m.name } });
  return m;
}

/** A student asks for a reminder before the class. */
export async function remindMe(tx: Tx, s: HomeworkScope, id: string) {
  if (s.level !== "student" || !s.student || !s.ctx.userId) throw new HomeworkProblem("Only students set reminders here.");
  const x = await tx.onlineClassSession.findFirst({ where: { id, archivedAt: null, sectionId: s.student.sectionId } });
  if (!x) throw new HomeworkProblem("This online class was not found.");
  if (x.reminderUserIds.includes(s.ctx.userId)) return x;
  return tx.onlineClassSession.update({ where: { id }, data: { reminderUserIds: [...x.reminderUserIds, s.ctx.userId] } });
}

/**
 * Reminders 15 minutes before each class, to the students with logins in the
 * section and the teacher. Runs every 5 minutes; each class is reminded once.
 */
export async function sendReminders(tx: Tx, ctx: SchoolContext, now: Date) {
  const soon = await tx.onlineClassSession.findMany({ where: { archivedAt: null, status: "SCHEDULED", remindedAt: null, startsAt: { gt: now, lte: new Date(now.getTime() + REMIND_BEFORE_MIN * 60_000) } }, take: 200 });
  const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  const tz = school?.timeZone ?? "Asia/Kolkata";
  for (const x of soon) {
    const students = await sectionStudents(tx, x.academicYearId, x.sectionId);
    const to = new Set([...students.map((st) => st.userLoginId).filter((v): v is string => !!v), ...x.reminderUserIds]);
    if (x.teacherId) {
      const t = await tx.staff.findUnique({ where: { id: x.teacherId }, select: { userLoginId: true } });
      if (t?.userLoginId) to.add(t.userLoginId);
    }
    for (const u of to) await notify(tx, ctx, { to: u, type: "online-class-soon", text: `${x.title} starts at ${momentWords(x.startsAt, tz).split(", ")[1]}. Join opens ${JOIN_OPENS_MIN} minutes before.`, link: "/homework-learning/online-classes", groupKey: `online-class-soon:${x.id}` }, now);
    await tx.onlineClassSession.update({ where: { id: x.id }, data: { remindedAt: now } });
  }
  return soon.length;
}

export type SessionRow = {
  id: string; title: string; sectionId: string; subjectId: string; sectionLabel: string; subject: string; teacher: string; startsAt: Date; lengthMin: number;
  word: ReturnType<typeof sessionWord>; meetingLink: string; seriesId: string | null; joined: number | null; of: number; recordings: number; cancelNote: string | null; reminded: boolean;
};

export async function listSessions(tx: Tx, s: HomeworkScope, now: Date, f: { from?: Date | null; to?: Date | null; q?: string }) {
  const where: Prisma.OnlineClassSessionWhereInput = {
    archivedAt: null, academicYearId: s.yearId ?? undefined,
    ...(s.level === "student" ? { sectionId: s.student?.sectionId ?? "00000000-0000-0000-0000-000000000000" } : {}),
    ...(s.level === "own" ? { OR: [...s.pairs.map((p) => ({ sectionId: p.sectionId, subjectId: p.subjectId })), ...(s.staffId ? [{ teacherId: s.staffId }] : []), ...(s.ctSections.length ? [{ sectionId: { in: s.ctSections } }] : [])] } : {}),
    ...(f.from && f.to ? { startsAt: { gte: new Date(f.from.getTime() - 6 * 3_600_000), lt: new Date(f.to.getTime() + 30 * 3_600_000) } } : {}),
    ...(f.q ? { title: { contains: f.q, mode: "insensitive" as const } } : {}),
  };
  if (s.level === "own" && !(where.OR as unknown[]).length) where.OR = [{ id: "00000000-0000-0000-0000-000000000000" }];
  const rows = await tx.onlineClassSession.findMany({ where, orderBy: { startsAt: "asc" }, include: { attendance: { select: { joined: true, studentId: true } } } });
  const [sections, subjects, staff, counts] = await Promise.all([
    tx.section.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.sectionId))] } }, include: { schoolClass: { select: { name: true } } } }),
    tx.subject.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.subjectId))] } }, select: { id: true, name: true } }),
    tx.staff.findMany({ where: { id: { in: rows.map((r) => r.teacherId).filter((x): x is string => !!x) } }, select: { id: true, fullName: true } }),
    tx.enrolment.groupBy({ by: ["sectionId"], where: { academicYearId: s.yearId ?? undefined, archivedAt: null, status: "STUDYING", sectionId: { in: [...new Set(rows.map((r) => r.sectionId))] } }, _count: true }),
  ]);
  const sec = new Map(sections.map((x) => [x.id, shortSection(x.schoolClass.name, x.name)]));
  const sub = new Map(subjects.map((x) => [x.id, x.name]));
  const who = new Map(staff.map((x) => [x.id, x.fullName]));
  const n = new Map(counts.map((c) => [c.sectionId, c._count]));
  return rows.map((x): SessionRow => ({
    id: x.id, title: x.title, sectionId: x.sectionId, subjectId: x.subjectId, sectionLabel: sec.get(x.sectionId) ?? "", subject: sub.get(x.subjectId) ?? "", teacher: x.teacherId ? who.get(x.teacherId) ?? "" : "",
    startsAt: x.startsAt, lengthMin: x.lengthMin, word: sessionWord(x, now), meetingLink: x.meetingLink, seriesId: x.seriesId,
    joined: x.attendance.length ? x.attendance.filter((a) => a.joined).length : null, of: n.get(x.sectionId) ?? 0, recordings: x.recordingLinks.length, cancelNote: x.cancelNote,
    reminded: s.level === "student" && !!s.ctx.userId && x.reminderUserIds.includes(s.ctx.userId),
  }));
}
