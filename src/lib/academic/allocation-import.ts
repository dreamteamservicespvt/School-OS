// Teacher Allocation from Excel (04 §2, gap list G44): one row per class and
// section, subject and teacher, as typed on Assign teacher: the teacher found
// by staff ID or name (a choice when a name fits more than one person), primary
// or secondary, periods per week, the from date, and whether the teacher is the
// section's class teacher. A row may name only the class teacher (no subject).
//
// Nothing already on record is replaced on a guess: a subject that has another
// primary teacher, or a section with another class teacher, asks the person to
// choose "hand over" on that row; the earlier assignment then ends the day
// before (history kept), as on the Teacher Allocation page.
//
// Brought in from Academic Management, Import, or Switching to School OS, by
// people with full Academic Management (as for Assign teacher). Undo archives
// the assignments it added and puts back what it ended and the class teachers
// it changed. Imported by src/lib/import-registry.ts.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { defineImport, RowProblem, type ImportKind, type RowChoice, type UpdatedRow } from "../importer";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { movingIn } from "../move-in/live";
import { readDate } from "../move-in/tidy";
import { addDays, todayIn } from "./common";
import { allocationActiveOn } from "./allocation";
import { mapActiveOn } from "./subjects";
import { handoverTo, importRun, sectionIn, sectionWords, subjectIn, teacherIn, yesNoIn } from "./import-common";

export const ALLOCATION_IMPORT = "academic-allocations";

type Row = {
  sectionId: string; section: string; yearId: string;
  subjectId: string | null; subject: string | null;
  staffId: string; staffName: string;
  primary: boolean; periodsPerWeek: number | null; from: Date;
  classTeacher: boolean; handover: boolean;
};

/** What a row ended or changed, kept for Undo. */
type Before = { ended: { id: string; toDate: string | null; archived: boolean }[]; classTeacher: { sectionId: string; was: string | null } | null };

const roleIn = (raw: string): boolean | null => {
  const v = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!v || ["primary", "main", "p", "1", "subjectteacher", "first"].includes(v)) return true;
  if (["secondary", "second", "s", "2", "assistant", "additional", "support"].includes(v)) return false;
  return null;
};

function makeKind(): ImportKind<Row> {
  // The from date when the row has none: the year's start while the school is moving in, else today.
  const starts = new WeakMap<Set<string>, Promise<{ moving: boolean; today: Date }>>();
  const startOf = (tx: Tx, ctx: SchoolContext, seen: Set<string>) => {
    let s = starts.get(seen);
    if (!s) {
      s = Promise.all([movingIn(tx, ctx), tx.school.findUnique({ where: { id: ctx.schoolId }, select: { timeZone: true } })]).then(([moving, sc]) => ({ moving, today: todayIn(sc?.timeZone ?? undefined) }));
      starts.set(seen, s);
    }
    return s;
  };
  return {
    key: ALLOCATION_IMPORT,
    label: "Teacher allocation",
    columns: [
      { key: "className", label: "Class", required: true, example: "Class 7", help: "The class, as in Classes & Sections. A column with class and section together, like 7-A, fills both.", aliases: ["class", "standard", "std", "grade"] },
      { key: "sectionName", label: "Section", example: "A", aliases: ["section", "sec", "division", "div"] },
      { key: "subject", label: "Subject", example: "Mathematics", help: "The subject's name or code in Subjects. Leave it empty on a row that only names the class teacher.", aliases: ["subject name", "subject code", "sub", "subjects"] },
      { key: "teacher", label: "Teacher", required: true, example: "Asha Rao (T-001)", help: "The teacher's staff ID or name, as in Staff & HR.", aliases: ["teacher name", "staff", "staff name", "staff id", "staff code", "employee", "employee name", "faculty", "subject teacher", "teacher id"] },
      { key: "role", label: "Role", example: "Primary", help: "Primary (the main subject teacher) or Secondary. Empty means Primary.", aliases: ["teacher role", "primary or secondary", "main or secondary"] },
      { key: "classTeacher", label: "Class teacher", example: "Yes", help: "Yes when this teacher is the section's class teacher.", aliases: ["is class teacher", "ct", "class incharge", "class in charge", "class teacher yes no"] },
      { key: "periodsPerWeek", label: "Periods per week", example: "6", help: "Leave empty to use the subject's periods in Subjects.", aliases: ["periods", "periods a week", "weekly periods", "ppw", "no of periods"] },
      { key: "fromDate", label: "From date", example: "01-04-2026", help: "Empty: the start of the year while you are moving in, else today.", aliases: ["from", "start date", "with effect from", "wef", "w e f"] },
    ],
    withOptions: () => makeKind(),
    async check(tx, ctx, row, seen, place) {
      const run = await importRun(tx, ctx, seen);
      const problems: string[] = [];
      let choices: RowChoice[] | undefined;
      const sec = sectionIn(run, row.className ?? "", row.sectionName ?? "");
      if ("problem" in sec) problems.push(sec.problem);
      const ct = yesNoIn(row.classTeacher ?? "");
      if (ct === null) problems.push("Class teacher must be Yes or No.");
      const subjectRaw = (row.subject ?? "").trim();
      const subj = subjectRaw ? subjectIn(run, subjectRaw) : null;
      if (subj && "problem" in subj) problems.push(subj.problem);
      if (!subjectRaw && ct !== true) problems.push("Subject is empty. Give the subject, or write Yes in Class teacher on a row that only names the class teacher.");
      const teacher = (row.teacher ?? "").trim() ? teacherIn(run, row.teacher ?? "", place?.decision) : null;
      if (teacher && "problem" in teacher) { problems.push(teacher.problem); choices = teacher.choices; }
      const primary = roleIn(row.role ?? "");
      if (primary === null) problems.push("Role must be Primary or Secondary.");
      const ppwRaw = (row.periodsPerWeek ?? "").trim();
      const ppw = ppwRaw ? Number(ppwRaw) : null;
      if (ppwRaw && (!/^\d{1,2}$/.test(ppwRaw) || ppw! > 40)) problems.push("Periods per week must be a whole number from 0 to 40.");
      const fromRaw = (row.fromDate ?? "").trim();
      const fromGiven = fromRaw ? readDate(fromRaw) : null;
      if (fromRaw && !fromGiven) problems.push("From date must be a date, like 01-04-2026.");
      if (problems.length || !("section" in sec) || !teacher || !("staff" in teacher) || (subj && !("subject" in subj))) return { ok: false, problems, ...(choices ? { choices } : {}) };

      const section = sec.section;
      const staff = teacher.staff;
      const subject = subj && "subject" in subj ? subj.subject : null;
      const year = run.years.get(section.yearId)!;
      if (year.closed) return { ok: false, problems: [`${year.name} is closed. Its Teacher Allocation cannot change.`] };
      const s = await startOf(tx, ctx, seen);
      const from = fromGiven ?? (s.moving || s.today < year.startDate ? year.startDate : s.today);
      if (from < year.startDate || from > year.endDate) return { ok: false, problems: [`From date must be inside ${year.name} (${formatDate(year.startDate)} to ${formatDate(year.endDate)}).`] };
      const label = sectionWords(section);

      // The same thing twice in the file.
      if (subject) {
        const k = `alloc:${section.id}:${subject.id}:${staff.id}`;
        if (seen.has(k)) problems.push(`${staff.fullName}, ${subject.name} in ${label} is twice in the file. Keep one row.`);
        seen.add(k);
        if (primary) {
          const p = `primary:${section.id}:${subject.id}`;
          if (seen.has(p) && !problems.length) problems.push(`Two primary teachers for ${subject.name} in ${label} in the file. Keep one, or make the other Secondary.`);
          seen.add(p);
        }
      }
      if (ct) {
        const c = `ct:${section.id}`;
        if (seen.has(c) && !seen.has(`${c}:${staff.id}`)) problems.push(`Two class teachers for ${label} in the file. Keep one.`);
        seen.add(c);
        seen.add(`${c}:${staff.id}`);
      }
      if (problems.length) return { ok: false, problems };

      // What is on record already.
      const handover = handoverTo(place?.decision, staff.id);
      const takeOver: string[] = [];
      if (subject) {
        const mapped = await tx.subjectClass.findFirst({ where: { subjectId: subject.id, classId: section.classId, ...mapActiveOn(from) } });
        if (!mapped) return { ok: false, problems: [`${subject.name} is not taught in ${section.className}. Map it to the class in Academic Management, Subjects first.`] };
        const same = await tx.teacherAllocation.findFirst({ where: { sectionId: section.id, subjectId: subject.id, staffId: staff.id, archivedAt: null, OR: [{ toDate: null }, { toDate: { gte: from } }] } });
        if (same) {
          const role = same.isMain ? "primary" : "secondary";
          return { ok: false, problems: [same.isMain === primary
            ? `${staff.fullName} already teaches ${subject.name} in ${label}. Leave this row out.`
            : `${staff.fullName} already teaches ${subject.name} in ${label} as the ${role} teacher. Change it on Teacher Allocation.`] };
        }
        if (primary) {
          const others = await tx.teacherAllocation.findMany({ where: { sectionId: section.id, subjectId: subject.id, isMain: true, archivedAt: null, staffId: { not: staff.id }, OR: [{ toDate: null }, { toDate: { gte: from } }] }, select: { staffId: true } });
          if (others.length) {
            const names = await tx.staff.findMany({ where: { id: { in: others.map((o) => o.staffId) } }, select: { fullName: true } });
            takeOver.push(`${names.map((n) => n.fullName).join(" and ")} ${names.length === 1 ? "teaches" : "teach"} ${subject.name} in ${label} now`);
          }
        }
      }
      if (ct && section.classTeacherId && section.classTeacherId !== staff.id) {
        const was = await tx.staff.findUnique({ where: { id: section.classTeacherId }, select: { fullName: true } });
        takeOver.push(`${was?.fullName ?? "Another teacher"} is the class teacher of ${label} now`);
      }
      if (takeOver.length && !handover) {
        return {
          ok: false,
          problems: [`${takeOver.join(", and ")}. Choose to hand over to ${staff.fullName}, or leave this row out.`],
          choices: [{ value: `handover:${staff.id}`, label: `Hand over to ${staff.fullName} from ${formatDate(from)}: the earlier assignment ends the day before` }],
        };
      }
      return { ok: true, value: { sectionId: section.id, section: label, yearId: section.yearId, subjectId: subject?.id ?? null, subject: subject?.name ?? null, staffId: staff.id, staffName: staff.fullName, primary: Boolean(primary), periodsPerWeek: ppw, from, classTeacher: Boolean(ct), handover } };
    },
    async save(tx, ctx, v) {
      const year = await tx.academicYear.findUnique({ where: { id: v.yearId }, select: { status: true, name: true } });
      if (!year || year.status === "CLOSED") throw new RowProblem(`${year?.name ?? "This year"} is closed. Its Teacher Allocation cannot change.`);
      const before: Before = { ended: [], classTeacher: null };
      let allocationId: string | null = null;
      if (v.subjectId) {
        if (await tx.teacherAllocation.findFirst({ where: { sectionId: v.sectionId, subjectId: v.subjectId, staffId: v.staffId, ...allocationActiveOn(v.from) } })) {
          throw new RowProblem(`${v.staffName} already teaches ${v.subject} in ${v.section}.`);
        }
        if (v.primary) {
          const previous = await tx.teacherAllocation.findMany({ where: { sectionId: v.sectionId, subjectId: v.subjectId, isMain: true, archivedAt: null, OR: [{ toDate: null }, { toDate: { gte: v.from } }] } });
          if (previous.length && !v.handover) throw new RowProblem(`Another teacher has ${v.subject} in ${v.section} now. Choose to hand over on this row.`);
          for (const p of previous) {
            before.ended.push({ id: p.id, toDate: p.toDate?.toISOString().slice(0, 10) ?? null, archived: false });
            // An assignment that would only have started on or after the from date never runs: archived, as on the page.
            if (p.fromDate && p.fromDate >= v.from) { await tx.teacherAllocation.update({ where: { id: p.id }, data: { archivedAt: new Date() } }); before.ended.at(-1)!.archived = true; }
            else await tx.teacherAllocation.update({ where: { id: p.id }, data: { toDate: addDays(v.from, -1) } });
          }
        }
        const row = await tx.teacherAllocation.create({
          data: { schoolId: ctx.schoolId, academicYearId: v.yearId, staffId: v.staffId, sectionId: v.sectionId, subjectId: v.subjectId, isMain: v.primary, periodsPerWeek: v.periodsPerWeek, fromDate: v.from, createdById: ctx.userId },
        });
        allocationId = row.id;
      }
      if (v.classTeacher) {
        const section = await tx.section.findUniqueOrThrow({ where: { id: v.sectionId }, select: { classTeacherId: true } });
        if (section.classTeacherId !== v.staffId) {
          if (section.classTeacherId && !v.handover) throw new RowProblem(`${v.section} has another class teacher now. Choose to hand over on this row.`);
          before.classTeacher = { sectionId: v.sectionId, was: section.classTeacherId };
          await tx.section.update({ where: { id: v.sectionId }, data: { classTeacherId: v.staffId, updatedById: ctx.userId } });
        }
      }
      await writeAudit(tx, ctx, {
        action: before.ended.length || before.classTeacher?.was ? "handed-over" : "assigned",
        recordType: "Teacher Allocation",
        recordId: allocationId,
        after: { teacher: v.staffName, subject: v.subject, sections: [v.section], role: v.primary ? "primary" : "secondary", from: v.from.toISOString().slice(0, 10), classTeacher: v.classTeacher, ended: before.ended.length, source: "Import" },
      });
      // A row that only added an assignment is "added"; one that ended or changed something keeps what it was, for Undo.
      if (allocationId && !before.ended.length && !before.classTeacher) return { id: allocationId, created: true };
      return { id: allocationId ?? v.sectionId, created: false, before: before as unknown as Record<string, unknown>, after: { allocationId, classTeacherId: v.classTeacher ? v.staffId : null, sectionId: v.sectionId } };
    },
    async undo(tx, ctx, ids) {
      const live = await tx.teacherAllocation.findMany({ where: { id: { in: ids }, archivedAt: null }, select: { id: true } });
      if (live.length) await tx.teacherAllocation.updateMany({ where: { id: { in: live.map((a) => a.id) } }, data: { archivedAt: new Date() } });
      await writeAudit(tx, ctx, { action: "undone", recordType: "Teacher Allocation", recordId: null, after: { reason: "Import of teacher allocation undone", archived: live.length } });
    },
    async revert(tx, ctx, rows: UpdatedRow[]) {
      let back = 0;
      // Last row first, so a section handed over twice in one file ends as it was.
      for (const r of [...rows].reverse()) {
        const b = r.before as unknown as Before;
        const allocationId = typeof r.after.allocationId === "string" ? r.after.allocationId : null;
        if (allocationId) await tx.teacherAllocation.updateMany({ where: { id: allocationId, archivedAt: null }, data: { archivedAt: new Date() } });
        for (const e of b.ended ?? []) {
          await tx.teacherAllocation.update({ where: { id: e.id }, data: e.archived ? { archivedAt: null } : { toDate: e.toDate ? new Date(`${e.toDate}T00:00:00Z`) : null } });
        }
        if (b.classTeacher) {
          // Put back only while the class teacher is still the one this import set.
          await tx.section.updateMany({ where: { id: b.classTeacher.sectionId, classTeacherId: String(r.after.classTeacherId ?? "") }, data: { classTeacherId: b.classTeacher.was, updatedById: ctx.userId } });
        }
        back++;
      }
      await writeAudit(tx, ctx, { action: "undone", recordType: "Teacher Allocation", recordId: null, after: { reason: "Import of teacher allocation undone", putBack: back } });
      return back;
    },
  };
}

defineImport(makeKind());
