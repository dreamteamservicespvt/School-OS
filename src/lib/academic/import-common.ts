// What the three Academic Management imports share (gap list G44): Teacher
// Allocation, the Time Table and the syllabus, each brought in from Excel on
// the one import engine (src/lib/move-in, src/lib/imports/places.ts). Here:
// what one check of a file looks up once (this year's sections, subjects and
// staff, the person's campus), and reading a section, a subject, a teacher, a
// day and a yes or no as a school writes them. Problems are in plain words.
//
// A teacher is found by staff ID, or by name. A name that fits more than one
// staff member, or fits one only nearly ("Mrs Rao" for "Lakshmi Rao"), is never
// taken on a guess: the row offers the staff it may mean (00-global.md P10), and
// the rows below with the same name follow the choice.
import "server-only";

import { randomUUID } from "node:crypto";
import type { SchoolContext, Tx } from "../db";
import type { RowChoice } from "../importer";
import { campusLimitOf } from "../staff/campus-logins";
import { findSection, suggestOptions } from "../move-in/lookups";
import { classKey, plain } from "../move-in/tidy";
import { namesAlike } from "../students/name-match";
import { currentYears } from "./years";
import { DAY_NAMES } from "./common";

export type ImportSection = { id: string; classId: string; className: string; sectionName: string; key: string | null; yearId: string; campusId: string; classTeacherId: string | null };
export type ImportStaff = { id: string; fullName: string; staffCode: string | null; designation: string | null; working: boolean };
export type ImportSubject = { id: string; name: string; code: string };

/** What one check of a file reads once, shared by its rows. */
export type ImportRun = {
  /** One id per check of a file (and per import job), so a save knows the rows of its own run. */
  token: string;
  sections: ImportSection[];
  subjects: ImportSubject[];
  staff: ImportStaff[];
  /** The years the sections belong to: closed or not, start and end. */
  years: Map<string, { name: string; closed: boolean; startDate: Date; endDate: Date; campusId: string }>;
  /** Teacher names the person chose a staff member for, by the name as written. */
  chosen: Map<string, string>;
};

const runs = new WeakMap<Set<string>, Promise<ImportRun>>();

/** The lists for one check of a file, read once (keyed by the check's own `seen`). One campus: only that campus's sections and staff. */
export function importRun(tx: Tx, ctx: SchoolContext, seen: Set<string>): Promise<ImportRun> {
  let r = runs.get(seen);
  if (!r) {
    r = (async () => {
      const limit = await campusLimitOf(tx, ctx);
      const years = await currentYears(tx, ctx, limit ? [limit] : null);
      const [sections, subjects, staff] = await Promise.all([
        tx.section.findMany({
          where: { academicYearId: { in: years.map((y) => y.id) }, archivedAt: null, schoolClass: { archivedAt: null } },
          include: { schoolClass: { select: { name: true, sortOrder: true, campusId: true } } },
          orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }],
        }),
        tx.subject.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
        tx.staff.findMany({ where: { archivedAt: null, ...(limit ? { campusId: limit } : {}) }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true, designation: true, status: true } }),
      ]);
      return {
        token: randomUUID(),
        sections: sections.map((s) => ({ id: s.id, classId: s.classId, className: s.schoolClass.name, sectionName: s.name, key: classKey(s.schoolClass.name), yearId: s.academicYearId, campusId: s.schoolClass.campusId, classTeacherId: s.classTeacherId })),
        subjects,
        staff: staff.map((s) => ({ id: s.id, fullName: s.fullName, staffCode: s.staffCode, designation: s.designation, working: s.status === "ACTIVE" || s.status === "ON_LEAVE" })),
        years: new Map(years.map((y) => [y.id, { name: y.name, closed: y.status === "CLOSED", startDate: y.startDate, endDate: y.endDate, campusId: y.campusId }])),
        chosen: new Map(),
      };
    })();
    runs.set(seen, r);
  }
  return r;
}

/** "Class 7 A" as the school writes it. */
export const sectionWords = (s: { className: string; sectionName: string }) => `${s.className} ${s.sectionName}`;

/** This year's section a class and section in the file point to, or the problem in plain words. */
export function sectionIn(run: ImportRun, rawClass: string, rawSection: string): { section: ImportSection } | { problem: string } {
  const found = findSection(run.sections, rawClass, rawSection);
  if (found) return { section: run.sections.find((s) => s.id === found.id)! };
  const shown = [rawClass.trim(), rawSection.trim()].filter(Boolean).join(" ");
  const sameClass = run.sections.filter((s) => plain(s.className) === plain(rawClass) || (s.key !== null && s.key === classKey(rawClass)));
  if (sameClass.length > 1 && !rawSection.trim()) return { problem: `Give the section of ${sameClass[0].className}: ${sameClass.map((s) => s.sectionName).join(", ")}.` };
  return { problem: `${/^class\b/i.test(shown) ? shown : `Class ${shown}`} is not set up this year. Match it to a class, or add it in Academic Management, Classes & Sections.` };
}

/** This year's class a class name in the file points to (any section), or the problem. */
export function classIn(run: ImportRun, raw: string): { classId: string; className: string; yearId: string } | { problem: string } {
  const v = raw.trim();
  const key = classKey(v);
  const hit = run.sections.find((s) => plain(s.className) === plain(v)) ?? (key ? run.sections.find((s) => s.key === key) : undefined);
  if (hit) return { classId: hit.classId, className: hit.className, yearId: hit.yearId };
  return { problem: `${/^class\b/i.test(v) ? v : `Class ${v}`} is not set up this year. Use a class from Academic Management, Classes & Sections.` };
}

/** A subject by name or code, or the problem with the names it may mean. */
export function subjectIn(run: ImportRun, raw: string): { subject: ImportSubject } | { problem: string } {
  const v = plain(raw);
  const hit = run.subjects.find((s) => plain(s.name) === v) ?? run.subjects.find((s) => plain(s.code) === v);
  if (hit) return { subject: hit };
  // A short form only one subject starts with: Maths or Math for Mathematics, Eng for English, Computers for Computer Science.
  const stem = v.length > 4 ? v.replace(/s$/, "") : v;
  const starts = stem.length >= 3 ? run.subjects.filter((s) => plain(s.name).startsWith(stem)) : [];
  if (starts.length === 1) return { subject: starts[0] };
  const near = suggestOptions(run.subjects.map((s) => s.name), raw);
  return { problem: `Subject "${raw.trim()}" is not in Subjects.${near.length ? ` Did you mean ${near.join(" or ")}?` : " Use a subject's name or code from Academic Management, Subjects."}` };
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const STAFF_CHOICE = new RegExp(`^(?:staff|handover):(${UUID})$`, "i");

/**
 * The staff member a row's choice names, if it is one: "staff:<id>" (this
 * teacher) or "handover:<id>" (this teacher, taking over from the one there now).
 */
export const staffChoice = (decision: string | undefined) => STAFF_CHOICE.exec(decision ?? "")?.[1]?.toLowerCase() ?? null;

/** Did the person choose to hand the class or subject over to this staff member? */
export const handoverTo = (decision: string | undefined, staffId: string) => /^handover:/i.test(decision ?? "") && staffChoice(decision) === staffId.toLowerCase();

const staffLabel = (s: ImportStaff) => `${s.fullName}${s.staffCode ? ` (${s.staffCode})` : ""}${s.designation ? `, ${s.designation}` : ""}`;

/**
 * The staff member a teacher in the file means: by staff ID, by the name as
 * written when only one person has it, or by the person's choice on the row.
 * A name that fits several people, or fits only nearly, asks for the choice.
 */
export function teacherIn(run: ImportRun, raw: string, decision: string | undefined): { staff: ImportStaff } | { problem: string; choices?: RowChoice[] } {
  const text = raw.trim();
  // "Asha Rao (T-001)": the ready sheet's way, with the staff ID in brackets.
  const bracket = /\(([^()]+)\)\s*$/.exec(text);
  const codes = [text, bracket?.[1] ?? ""].map(plain).filter(Boolean);
  const byCode = run.staff.find((s) => s.staffCode && codes.includes(plain(s.staffCode)));
  const name = bracket ? text.slice(0, bracket.index).trim() : text;
  const word = plain(name);
  let found = byCode ?? null;
  let candidates: ImportStaff[] = [];
  if (!found) {
    const same = run.staff.filter((s) => plain(s.fullName) === word);
    if (same.length === 1) found = same[0];
    else candidates = same.length ? same : run.staff.filter((s) => namesAlike(s.fullName, name)).slice(0, 6);
  }
  if (!found && candidates.length) {
    const picked = staffChoice(decision) ?? run.chosen.get(word) ?? null;
    const hit = picked ? candidates.find((c) => c.id === picked) : undefined;
    if (hit) {
      // The rows below with the same name follow this choice.
      run.chosen.set(word, hit.id);
      found = hit;
    } else {
      const several = candidates.filter((c) => plain(c.fullName) === word).length > 1;
      return {
        problem: several ? `${candidates.length} staff members are called ${name}. Choose which one teaches here.` : `No staff member is called "${name}" exactly. Choose the one it means, or fix the name.`,
        choices: candidates.map((c) => ({ value: `staff:${c.id}`, label: `${c.working ? "" : "No longer working: "}${staffLabel(c)}` })),
      };
    }
  }
  if (!found) return { problem: `No staff member has the staff ID or name "${text}". Use a staff ID or name from Staff & HR.` };
  if (!found.working) return { problem: `${found.fullName} is no longer working here.` };
  return { staff: found };
}

const DAY_WORDS: Record<string, number> = {};
for (let d = 1; d <= 7; d++) {
  const full = DAY_NAMES[d].toLowerCase();
  for (const w of [full, full.slice(0, 3), full.slice(0, 2)]) DAY_WORDS[w] = d;
}
Object.assign(DAY_WORDS, { tues: 2, weds: 3, thur: 4, thurs: 4, sat: 6 });

/** 1 = Monday ... 7 = Sunday, for a day written in a file ("Monday", "Mon", "MON."), or null. */
export function dayIn(raw: string): number | null {
  const v = raw.trim().toLowerCase().replace(/[^a-z]/g, "");
  return DAY_WORDS[v] ?? null;
}

/** "Yes" or "No" as a file writes it; null for anything else. Empty is No. */
export function yesNoIn(raw: string): boolean | null {
  const v = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!v || ["n", "no", "false", "0", "nahi", "na"].includes(v)) return false;
  if (["y", "yes", "true", "1", "haan", "ha", "ct", "classteacher"].includes(v)) return true;
  return null;
}
