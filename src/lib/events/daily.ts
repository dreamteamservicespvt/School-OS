// Daily Activities (18 §2, optional page): the pre-primary daily diary.
// The class teacher of each pre-primary section assigns the day's
// activities (meals, nap, water, play and learning activities), logs each
// child quickly (tap the activity, tick the children, save once), and sends
// the day's diary to the parents, each parent getting only their own
// child's day. The Principal, School Admin and Vice Principal read every
// class's diary and remind a class teacher who is behind; they never write
// it (design change of 14 Oct 2026). Only the section's class teacher may
// write its diary, checked here on the server.
import "server-only";

import type { DailyActivity } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { sendMessage, MessagingProblem, notSentWords } from "../messaging";
import { staffForUser } from "../people";
import { EventsProblem } from "./problem";
import { eventsSettings } from "./settings";
import { notWorkingDay } from "./calendar";
import { yearOf } from "./cocurricular";
import { clock, dayOf, dmy, isoOf, niceDay } from "./words";

/** What the teacher taps for each activity type. */
export function optionsFor(type: string): string[] {
  switch (type) {
    case "Meal": return ["Ate all", "Ate half", "Ate a little", "Did not eat"];
    case "Nap": return ["Slept 1 hour", "Slept 30 minutes", "Rested, no sleep"];
    case "Water": return ["2 glasses", "1 glass", "Few sips"];
    case "Play": return ["Played", "Stayed in"];
    case "Learning activity": return ["Finished", "Half done", "Did not join"];
    default: return ["Took part", "Watched", "Did not join"];
  }
}

/** An icon name for an activity (lucide), so the diary reads at a glance. */
export function activityIcon(type: string, label: string) {
  const t = `${type} ${label}`.toLowerCase();
  if (/rhyme|song|music/.test(t)) return "Music";
  if (/water/.test(t)) return "GlassWater";
  if (/nap|sleep|rest/.test(t)) return "BedDouble";
  if (/lunch|meal/.test(t)) return "Utensils";
  if (/snack|fruit|meal/.test(t)) return "Apple";
  if (/play|outdoor/.test(t)) return "Footprints";
  if (/colour|draw|paint|art|clay/.test(t)) return "Palette";
  if (/story|book|read/.test(t)) return "BookOpen";
  return "Sparkles";
}

/** An answer that needs the parent's attention (shown amber). */
export const needsCare = (v: string) => /not|few|little|stayed|rested|watched|half/i.test(v);

export type PreSection = { id: string; label: string; classId: string; className: string; sort: number; teacherId: string | null; teacher: string | null; teacherLogin: string | null; students: number };

/** The pre-primary sections of a year, in class order, with their class teacher and number of children. */
export async function preSections(tx: Tx, yearId: string): Promise<PreSection[]> {
  const sections = await tx.section.findMany({
    where: { academicYearId: yearId, archivedAt: null, schoolClass: { archivedAt: null, level: { equals: "Pre-primary", mode: "insensitive" } } },
    select: { id: true, name: true, classId: true, classTeacherId: true, schoolClass: { select: { name: true, sortOrder: true } } },
  });
  if (!sections.length) return [];
  const [teachers, counts] = await Promise.all([
    tx.staff.findMany({ where: { id: { in: sections.map((s) => s.classTeacherId).filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true, userLoginId: true } }),
    tx.enrolment.groupBy({ by: ["sectionId"], where: { sectionId: { in: sections.map((s) => s.id) }, academicYearId: yearId, archivedAt: null, status: "STUDYING" }, _count: { _all: true } }),
  ]);
  return sections.map((s) => {
    const t = teachers.find((x) => x.id === s.classTeacherId);
    return { id: s.id, label: `${s.schoolClass.name} ${s.name}`, classId: s.classId, className: s.schoolClass.name, sort: s.schoolClass.sortOrder, teacherId: s.classTeacherId, teacher: t?.fullName ?? null, teacherLogin: t?.userLoginId ?? null, students: counts.find((c) => c.sectionId === s.id)?._count._all ?? 0 };
  }).sort((a, b) => b.sort - a.sort || a.label.localeCompare(b.label));
}

/** The pre-primary sections this person is the class teacher of (they write those diaries). */
export async function myPreSections(tx: Tx, ctx: SchoolContext, yearId: string) {
  const me = await staffForUser(tx, ctx);
  if (!me) return [];
  return (await preSections(tx, yearId)).filter((s) => s.teacherId === me.id);
}

/** Only the class teacher of a pre-primary section writes its diary. Everyone else, the Principal and VP included, is refused. */
export async function assertDiaryTeacher(tx: Tx, ctx: SchoolContext, sectionId: string, yearId: string) {
  const all = await preSections(tx, yearId);
  const s = all.find((x) => x.id === sectionId);
  if (!s) throw new EventsProblem("This is not a pre-primary class this year. The daily diary is kept for Nursery to UKG.");
  const me = await staffForUser(tx, ctx);
  if (!me || me.id !== s.teacherId) throw new EventsProblem(`Only the class teacher of ${s.label}${s.teacher ? `, ${s.teacher},` : ""} writes its diary. You can read it and send a reminder.`);
  const settings = await eventsSettings(tx, ctx);
  if (!settings.dailyOn) throw new EventsProblem("Daily Activities is switched off in Events Settings.");
  return s;
}

/** The children of a section this year, in roll order. */
export async function childrenOf(tx: Tx, sectionId: string, yearId: string) {
  const enrol = await tx.enrolment.findMany({ where: { sectionId, academicYearId: yearId, archivedAt: null, status: "STUDYING" }, select: { studentId: true, rollNo: true }, orderBy: { rollNo: "asc" } });
  const st = await tx.student.findMany({ where: { id: { in: enrol.map((e) => e.studentId) } }, select: { id: true, fullName: true, firstName: true } });
  return enrol.map((e) => st.find((s) => s.id === e.studentId)).filter((x): x is { id: string; fullName: string; firstName: string } => Boolean(x));
}

/** Children marked absent (or on leave) in the section's register that day. */
export async function absentOn(tx: Tx, sectionIds: string[], iso: string) {
  if (!sectionIds.length) return new Map<string, Set<string>>();
  const statuses = await tx.attendanceStatus.findMany({ where: { OR: [{ counts: "absent" }, { key: { in: ["leave", "medical"] } }] }, select: { key: true } });
  const keys = [...new Set(["absent", "leave", "medical", ...statuses.map((s) => s.key)])];
  const marks = await tx.attendanceMark.findMany({ where: { sectionId: { in: sectionIds }, date: dayOf(iso), periodNo: 0, studentId: { not: null }, statusKey: { in: keys } }, select: { sectionId: true, studentId: true } });
  const out = new Map<string, Set<string>>();
  for (const m of marks) {
    const s = out.get(m.sectionId!) ?? new Set<string>();
    s.add(m.studentId!);
    out.set(m.sectionId!, s);
  }
  return out;
}

/** The day's activities of a section, by time, with their logs. */
export async function dayActivities(tx: Tx, sectionIds: string[], iso: string) {
  if (!sectionIds.length) return [];
  return tx.dailyActivity.findMany({ where: { sectionId: { in: sectionIds }, date: dayOf(iso), archivedAt: null }, include: { logs: true }, orderBy: [{ startMin: "asc" }, { createdAt: "asc" }] });
}

export type AssignInput = { sectionId: string; type: string; label: string; startMin: number; dates: string[] };

/** Assigns an activity to a class for a day or several days (working days only). */
export async function assignActivity(tx: Tx, ctx: SchoolContext, input: AssignInput, today: string) {
  const s = await eventsSettings(tx, ctx);
  if (!s.dailyTypes.includes(input.type)) throw new EventsProblem("Choose the activity type.", "type");
  const label = input.label.trim().replace(/\s+/g, " ");
  if (label.length < 2 || label.length > 60) throw new EventsProblem("Name the activity, like “Clay modelling”.", "label");
  if (!Number.isInteger(input.startMin) || input.startMin < 6 * 60 || input.startMin > 19 * 60) throw new EventsProblem("Pick a time in the school day, like 11:15.", "time");
  const dates = [...new Set(input.dates)].sort();
  if (!dates.length) throw new EventsProblem("Choose the days.", "days");
  if (dates[0] < today) throw new EventsProblem("Pick today or a later day.", "days");
  const year = await yearOf(tx, dates[0], "days");
  const sec = await assertDiaryTeacher(tx, ctx, input.sectionId, year.id);
  const campusId = (await tx.schoolClass.findUnique({ where: { id: sec.classId }, select: { campusId: true } }))?.campusId ?? null;
  const made: DailyActivity[] = [];
  const skipped: string[] = [];
  for (const iso of dates) {
    if (await notWorkingDay(tx, ctx, iso, campusId, { classId: sec.classId })) { skipped.push(iso); continue; }
    const same = await tx.dailyActivity.findFirst({ where: { sectionId: sec.id, date: dayOf(iso), archivedAt: null, label: { equals: label, mode: "insensitive" } } });
    if (same) { skipped.push(iso); continue; }
    made.push(await tx.dailyActivity.create({ data: { schoolId: ctx.schoolId, academicYearId: year.id, sectionId: sec.id, date: dayOf(iso), type: input.type, label, startMin: input.startMin, options: optionsFor(input.type), createdById: ctx.userId } }));
  }
  if (!made.length) throw new EventsProblem(skipped.length ? `${label} is already on these days, or they are holidays.` : "Choose the days.", "days");
  await writeAudit(tx, ctx, { action: "assigned", recordType: "Daily Activity", recordId: made[0].id, after: { section: sec.label, activity: label, time: clock(input.startMin), days: made.map((m) => dmy(isoOf(m.date))) } });
  return { made: made.length, skipped: skipped.length, section: sec, label };
}

/** Takes an assigned activity off the day (kept, archived). */
export async function removeActivity(tx: Tx, ctx: SchoolContext, activityId: string, today: string) {
  const a = await tx.dailyActivity.findFirst({ where: { id: activityId, archivedAt: null } });
  if (!a) throw new EventsProblem("This activity was not found.");
  const sec = await assertDiaryTeacher(tx, ctx, a.sectionId, a.academicYearId);
  if (isoOf(a.date) < today) throw new EventsProblem("Past diaries stay as they were.");
  await tx.dailyActivity.update({ where: { id: a.id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "removed", recordType: "Daily Activity", recordId: a.id, before: { section: sec.label, activity: a.label, date: dmy(isoOf(a.date)) } });
  return a;
}

/** Logs one activity for the ticked children in one go (bulk), with an optional note. */
export async function logActivity(tx: Tx, ctx: SchoolContext, input: { activityId: string; studentIds: string[]; value: string; note: string | null }, today: string) {
  const a = await tx.dailyActivity.findFirst({ where: { id: input.activityId, archivedAt: null } });
  if (!a) throw new EventsProblem("This activity was not found. It may have been taken off the day.");
  const sec = await assertDiaryTeacher(tx, ctx, a.sectionId, a.academicYearId);
  if (isoOf(a.date) !== today) throw new EventsProblem(isoOf(a.date) > today ? `${a.label} is for ${niceDay(isoOf(a.date))}. Log it on the day.` : "Past diaries stay as they were.");
  if (!a.options.includes(input.value)) throw new EventsProblem("Tap how it went.", "value");
  const note = input.note ? input.note.trim().replace(/\s+/g, " ") : null;
  if (note && note.length > 120) throw new EventsProblem("The note can be at most 120 characters.", "note");
  const kids = new Set((await childrenOf(tx, a.sectionId, a.academicYearId)).map((k) => k.id));
  const away = (await absentOn(tx, [a.sectionId], today)).get(a.sectionId) ?? new Set<string>();
  const ticked = [...new Set(input.studentIds)].filter((s) => kids.has(s));
  if (!ticked.length) throw new EventsProblem("Tick the children.", "studentIds");
  const todo = ticked.filter((s) => !away.has(s));
  if (!todo.length) throw new EventsProblem("The ticked children are absent today.", "studentIds");
  const now = new Date();
  for (const studentId of todo) {
    await tx.dailyActivityLog.upsert({
      where: { activityId_studentId: { activityId: a.id, studentId } },
      create: { schoolId: ctx.schoolId, activityId: a.id, studentId, value: input.value, note, loggedById: ctx.userId, loggedAt: now },
      update: { value: input.value, note, loggedById: ctx.userId, loggedAt: now },
    });
  }
  await writeAudit(tx, ctx, { action: "logged", recordType: "Daily Activity", recordId: a.id, after: { section: sec.label, activity: a.label, value: input.value, children: todo.length, note } });
  return { logged: todo.length, absent: ticked.length - todo.length, activity: a };
}

/** One child's day in words, from the logged activities ("Rhymes, took part. Snack, ate all."). */
export function childDay(acts: { label: string; logs: { studentId: string; value: string; note: string | null }[] }[], studentId: string) {
  return acts.map((a) => {
    const l = a.logs.find((x) => x.studentId === studentId);
    return l ? `${a.label}, ${l.value.charAt(0).toLowerCase()}${l.value.slice(1)}${l.note ? ` (${l.note})` : ""}.` : null;
  }).filter(Boolean).join(" ");
}

/** The diary message: {diary} is each child's own day (one blank, filled per child). */
export const diaryText = (teacher: string, section: string) => `{diary} – ${teacher}, ${section}`;

/** Sends the day's diary to the parents: each parent gets only their own child's day. */
export async function sendDiary(tx: Tx, ctx: SchoolContext, sectionId: string, today: string) {
  const year = await yearOf(tx, today);
  const sec = await assertDiaryTeacher(tx, ctx, sectionId, year.id);
  const acts = await dayActivities(tx, [sectionId], today);
  if (!acts.length) throw new EventsProblem("Nothing is assigned for today. Assign activities first.");
  const kids = await childrenOf(tx, sectionId, year.id);
  const away = (await absentOn(tx, [sectionId], today)).get(sectionId) ?? new Set<string>();
  const present = kids.filter((k) => !away.has(k.id));
  const perStudent: Record<string, Record<string, string>> = {};
  for (const k of present) {
    const day = childDay(acts, k.id);
    if (day) perStudent[k.id] = { diary: `${k.firstName}’s day, ${niceDay(today)}: ${day}` };
  }
  const ids = Object.keys(perStudent);
  if (!ids.length) throw new EventsProblem("Nothing is logged yet today. Log the activities first.");
  const cells = acts.length * present.length;
  const logged = cells ? Math.round((acts.reduce((n, a) => n + a.logs.filter((l) => !away.has(l.studentId)).length, 0) / cells) * 100) : 0;
  let r;
  try {
    r = await sendMessage(tx, ctx, {
      to: { guardiansOf: ids }, channels: "preferred", text: diaryText(sec.teacher ?? "Class teacher", sec.label),
      perStudent, trigger: `Daily diary: ${sec.label}`, source: { type: "Diary Send", id: sectionId }, audienceLabel: `Parents of ${sec.label}`,
    });
  } catch (e) {
    if (e instanceof MessagingProblem) throw new EventsProblem(e.message);
    throw e;
  }
  const send = await tx.diarySend.create({ data: { schoolId: ctx.schoolId, sectionId, date: dayOf(today), people: r.people, logged: Math.min(100, logged), messageId: r.messageId, sentById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "diary-sent", recordType: "Diary Send", recordId: send.id, after: { section: sec.label, parents: r.people, logged } });
  return { people: r.people, children: ids.length, section: sec, missed: notSentWords(r) };
}

export type ClassProgress = PreSection & { present: number; absent: number; due: number; logged: number; missing: string[]; sentAt: Date | null; reminded: boolean };

/**
 * Each pre-primary class today: activities due by now and how many the class
 * teacher has logged for every child present; what is missing; whether the
 * diary went out and whether a reminder was already sent.
 */
export async function todayProgress(tx: Tx, ctx: SchoolContext, yearId: string, today: string, nowMin: number): Promise<ClassProgress[]> {
  const secs = await preSections(tx, yearId);
  const ids = secs.map((s) => s.id);
  const [acts, away, sends, kids, reminders] = await Promise.all([
    dayActivities(tx, ids, today),
    absentOn(tx, ids, today),
    tx.diarySend.findMany({ where: { sectionId: { in: ids }, date: dayOf(today) }, orderBy: { sentAt: "desc" } }),
    tx.enrolment.findMany({ where: { sectionId: { in: ids }, academicYearId: yearId, archivedAt: null, status: "STUDYING" }, select: { sectionId: true, studentId: true } }),
    tx.notification.findMany({ where: { groupKey: { in: ids.map((id) => `daily-remind:${id}:${today}`) } }, select: { groupKey: true } }),
  ]);
  return secs.map((s) => {
    const off = away.get(s.id) ?? new Set<string>();
    const mine = kids.filter((k) => k.sectionId === s.id && !off.has(k.studentId)).map((k) => k.studentId);
    const due = acts.filter((a) => a.sectionId === s.id && a.startMin <= nowMin);
    const done = due.filter((a) => mine.every((k) => a.logs.some((l) => l.studentId === k)));
    return {
      ...s, present: mine.length, absent: off.size, due: due.length, logged: done.length,
      missing: due.filter((a) => !done.includes(a)).map((a) => a.label),
      sentAt: sends.find((x) => x.sectionId === s.id)?.sentAt ?? null,
      reminded: reminders.some((r) => r.groupKey === `daily-remind:${s.id}:${today}`),
    };
  });
}

/** Reminds a pre-primary class teacher whose diary is behind (the Principal, School Admin and VP do this). */
export async function remindTeacher(tx: Tx, ctx: SchoolContext, sectionId: string, today: string, nowMin: number) {
  const year = await yearOf(tx, today);
  const all = await todayProgress(tx, ctx, year.id, today, nowMin);
  const p = all.find((x) => x.id === sectionId);
  if (!p) throw new EventsProblem("This is not a pre-primary class this year.");
  if (!p.teacherId || !p.teacher) throw new EventsProblem(`${p.label} has no class teacher. Set one in Academic Management, Classes.`);
  if (!p.teacherLogin) throw new EventsProblem(`${p.teacher} has no School OS login, so the reminder cannot reach them. Call them instead.`);
  if (p.reminded) throw new EventsProblem(`${p.teacher} was already reminded today.`);
  const what = p.missing.length ? `${p.missing.length > 1 ? `${p.missing.slice(0, -1).join(", ")} and ${p.missing.at(-1)}` : p.missing[0]} ${p.missing.length === 1 ? "is" : "are"} not logged yet` : "please keep today’s diary up to date";
  await notify(tx, ctx, { to: p.teacherLogin, type: "daily-remind", text: `${p.label} daily diary: ${what}.`, link: `/events-calendar/daily?section=${p.id}`, groupKey: `daily-remind:${p.id}:${today}` });
  await writeAudit(tx, ctx, { action: "reminded", recordType: "Daily Activity", recordId: sectionId, after: { section: p.label, teacher: p.teacher, missing: p.missing } });
  return { teacher: p.teacher, section: p.label, missing: p.missing };
}

/** The diaries sent for a section in a date range, newest first. */
export async function diariesSent(tx: Tx, sectionIds: string[], from: string, to: string) {
  if (!sectionIds.length) return [];
  return tx.diarySend.findMany({ where: { sectionId: { in: sectionIds }, date: { gte: dayOf(from), lte: dayOf(to) } }, orderBy: [{ date: "desc" }, { sentAt: "desc" }], take: 400 });
}

/** Share of the day's activities logged when the diary went out, averaged per section over the range. */
export async function filledIn(tx: Tx, sectionIds: string[], from: string, to: string) {
  if (!sectionIds.length) return new Map<string, number>();
  const rows = await tx.diarySend.groupBy({ by: ["sectionId"], where: { sectionId: { in: sectionIds }, date: { gte: dayOf(from), lte: dayOf(to) } }, _avg: { logged: true } });
  return new Map(rows.map((r) => [r.sectionId, Math.round(r._avg.logged ?? 0)]));
}
