"use server";

import { redirect } from "next/navigation";
import type { ExamPattern } from "@prisma/client";
import type { FormState } from "@/lib/forms";
import { TIME_RE, plural } from "@/lib/academic/common";
import { ExamRuleError } from "@/lib/exams/common";
import { archiveExam, createDatesheet, publishDatesheet, restoreExam, setCategories, updateDatesheet, type ExamDetails, type ScheduleRow } from "@/lib/exams/datesheet";
import { generateSeating } from "@/lib/exams/seating";
import { assertInScope } from "@/lib/exams/scope";
import { inCampus } from "@/lib/campus";
import type { Tx } from "@/lib/db";
import type { Current } from "@/lib/current";
import { act, actSimple, str, BASE } from "../_lib/server";

const PATTERNS: ExamPattern[] = ["PERCENTAGE", "GRADING", "CGPA"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (v: string) => (DAY.test(v) ? new Date(`${v}T00:00:00Z`) : null);

function readDetails(fd: FormData): ExamDetails {
  const startDate = day(str(fd, "startDate"));
  const endDate = day(str(fd, "endDate"));
  if (!startDate) throw new ExamRuleError("Choose the start date.", "startDate");
  if (!endDate) throw new ExamRuleError("Choose the end date.", "endDate");
  const pattern = str(fd, "pattern") as ExamPattern;
  if (!PATTERNS.includes(pattern)) throw new ExamRuleError("Choose the exam pattern.", "pattern");
  if (!str(fd, "examTypeId")) throw new ExamRuleError("Choose the exam type.", "examTypeId");
  if (!str(fd, "termId")) throw new ExamRuleError("Choose the term.", "termId");
  return {
    title: str(fd, "title"), examTypeId: str(fd, "examTypeId"), pattern, termId: str(fd, "termId"), startDate, endDate,
    classIds: fd.getAll("classIds").map(String).filter(Boolean), gradeScaleId: str(fd, "gradeScaleId") || null,
  };
}

type RawRow = { classId: string; subjectId: string; date: string; startTime: string; durationMin: number | string; room: string; invigilatorId: string; maxMarks: number | string; pattern: string };

function readRows(fd: FormData): ScheduleRow[] {
  let raw: RawRow[];
  try {
    raw = JSON.parse(str(fd, "rows") || "[]") as RawRow[];
  } catch {
    throw new ExamRuleError("The schedule could not be read. Reload the page and try again.", "schedule");
  }
  if (!Array.isArray(raw) || raw.length > 400) throw new ExamRuleError("The schedule could not be read. Reload the page and try again.", "schedule");
  return raw.map((r) => ({
    classId: String(r.classId), subjectId: String(r.subjectId), date: day(String(r.date ?? "")),
    startTime: TIME_RE.test(String(r.startTime)) ? String(r.startTime) : "", durationMin: Number(r.durationMin), room: String(r.room ?? "").trim() || null,
    invigilatorId: String(r.invigilatorId ?? "") || null, maxMarks: Number(r.maxMarks), pattern: PATTERNS.includes(r.pattern as ExamPattern) ? (r.pattern as ExamPattern) : null,
  }));
}

/** A person limited to one campus chooses invigilators from that campus's staff only (those already on the datesheet stay). */
async function checkInvigilators(tx: Tx, current: Current, rows: ScheduleRow[], examId: string) {
  if (!current.campusId) return;
  const kept = /^[0-9a-f-]{36}$/i.test(examId) ? new Set((await tx.datesheetEntry.findMany({ where: { examId, archivedAt: null }, select: { invigilatorId: true } })).map((e) => e.invigilatorId)) : new Set<string | null>();
  const ids = [...new Set(rows.filter((r) => r.date).map((r) => r.invigilatorId).filter((x): x is string => Boolean(x) && !kept.has(x)))];
  if (ids.length === 0) return;
  const mine = await tx.staff.count({ where: { id: { in: ids }, ...inCampus(current) } });
  if (mine !== ids.length) throw new ExamRuleError("A chosen invigilator is no longer on the staff list. Choose again.", "schedule");
}

export async function saveDatesheet(_prev: FormState, fd: FormData): Promise<FormState> {
  const examId = str(fd, "examId");
  let target = "";
  const state = await act("edit", async ({ tx, current, scope, yearId }) => {
    const d = readDetails(fd);
    const rows = readRows(fd);
    if (examId) await assertInScope(tx, scope, "exam", examId);
    await checkInvigilators(tx, current, rows, examId);
    if (examId) {
      const r = await updateDatesheet(tx, current.ctx, examId, d, rows);
      target = `${BASE}/datesheet/${examId}`;
      return { flash: { message: r.titleOnly ? "Title changed. Results exist, so the schedule stays as it is." : "Datesheet saved." } };
    }
    if (!yearId) throw new ExamRuleError("There is no academic year to add the exam to.");
    const r = await createDatesheet(tx, current.ctx, yearId, d, rows);
    target = `${BASE}/datesheet/${r.exam.id}`;
    return { flash: { message: `Datesheet saved as a draft with ${plural(r.papers, "paper")}${r.leftOut ? `. ${plural(r.leftOut, "subject")} with no date ${r.leftOut === 1 ? "was" : "were"} left out` : ""}. Set mark categories if needed, then publish.` } };
  }, { formData: fd, needs: "datesheets", yearId: str(fd, "yearId") || null });
  if (state?.ok && target) redirect(target);
  return state;
}

export async function publishDatesheetAction(examId: string, tellParents: boolean) {
  return actSimple("edit", async ({ tx, current, scope }) => {
    await assertInScope(tx, scope, "exam", examId);
    const r = await publishDatesheet(tx, current.ctx, examId, { tellParents });
    const bits = [`${plural(r.days, "exam day")} added to the School Calendar and Time Table`, "admit cards can be printed"];
    if (r.invigilators) bits.push(`${plural(r.invigilators, "invigilator")} told`);
    if (tellParents && r.upcoming === 0) bits.push("no message to parents, because every paper is already over");
    else if (tellParents) bits.push(`${plural(r.parents, "parent")} messaged${r.past ? ` about the papers still to come (${plural(r.past, "paper")} already held left out)` : ""}`);
    return { flash: { message: `Datesheet published: ${bits.join(", ")}.` } };
  }, { needs: "datesheets" });
}

export async function archiveExamAction(examId: string) {
  return actSimple("archive", async ({ tx, current, scope }) => {
    await assertInScope(tx, scope, "exam", examId);
    await archiveExam(tx, current.ctx, examId);
    return { flash: { message: "Datesheet archived. Its exam days were taken off the School Calendar. You can restore it from the archived list." } };
  }, { needs: "datesheets" });
}

export async function restoreExamAction(examId: string) {
  return actSimple("archive", async ({ tx, current, scope }) => {
    await assertInScope(tx, scope, "exam", examId);
    await restoreExam(tx, current.ctx, examId);
    return { flash: { message: "Datesheet restored." } };
  }, { needs: "datesheets" });
}

export async function saveCategoriesAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return act("edit", async ({ tx, current, scope }) => {
    await assertInScope(tx, scope, "paper", str(fd, "entryId"));
    const names = fd.getAll("catName").map(String);
    const maxes = fd.getAll("catMax").map((x) => Number(String(x).trim() || NaN));
    const cats = names.map((name, i) => ({ name, max: maxes[i] })).filter((c) => c.name.trim() || Number.isFinite(c.max));
    for (const c of cats) if (!c.name.trim()) throw new ExamRuleError("Give each category a name, such as Theory.", "categories");
    const r = await setCategories(tx, current.ctx, str(fd, "entryId"), cats, fd.get("allClasses") === "on");
    return { flash: { message: cats.length ? `Mark categories saved for ${r.subject}${r.count > 1 ? ` in ${r.count} classes` : ""}.` : `${r.subject} now takes one mark out of the maximum.` } };
  }, { formData: fd, needs: "datesheets" });
}

/** For the categories sheet: returns a message when it failed. */
export async function saveCategoriesForm(fd: FormData) {
  const state = await saveCategoriesAction(null, fd);
  return state?.ok ? undefined : state?.message ?? "That did not work. Please try again.";
}

/** For the seat plan sheet: returns a message when it failed. */
export async function makeSeatingForm(fd: FormData) {
  const state = await makeSeatingAction(null, fd);
  return state?.ok ? undefined : state?.message ?? "That did not work. Please try again.";
}

export async function makeSeatingAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return act("edit", async ({ tx, current, scope }) => {
    await assertInScope(tx, scope, "exam", str(fd, "examId"));
    const names = fd.getAll("roomName").map(String);
    const seats = fd.getAll("roomSeats").map((x) => Number(String(x).trim() || NaN));
    const rooms = names.map((name, i) => ({ name, capacity: seats[i] })).filter((r) => r.name.trim() || Number.isFinite(r.capacity));
    for (const r of rooms) if (!r.name.trim()) throw new ExamRuleError("Give each room a name, such as Room 12.", "rooms");
    const r = await generateSeating(tx, current.ctx, str(fd, "examId"), { sitting: str(fd, "sitting"), rooms, mix: fd.get("mix") === "on" });
    return { flash: { message: `Seats given to ${plural(r.students, "student")} in ${plural(r.rooms.length, "room")}.` } };
  }, { formData: fd, needs: "datesheets" });
}
