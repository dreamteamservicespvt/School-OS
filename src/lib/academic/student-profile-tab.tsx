// Academic Management's tab on the Student Profile (03 §2, Student Profile
// tabs): the weekly Time Table of the student's section, and how far each
// subject's syllabus has gone. Registered through
// src/lib/students/profile-tab-modules.ts.
import "server-only";

import Link from "next/link";
import { withSchool } from "../db";
import { registerProfileTab, type ProfileTabArgs } from "../students/profile-tabs";
import { effectiveVersion, gridRows, sectionGrid } from "./timetable";
import { progressBoard, lateWords } from "./syllabus";
import { subjectsForClass } from "./subjects";
import { todayIn, weekday } from "./common";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TimetableGrid } from "@/app/(school)/academic-management/time-table/grid";

async function load({ current, studentId, academicYearId }: ProfileTabArgs) {
  return withSchool(current.ctx, async (tx) => {
    if (!academicYearId) return null;
    const enrolment = await tx.enrolment.findFirst({
      where: { schoolId: current.ctx.schoolId, studentId, academicYearId, archivedAt: null },
      orderBy: { createdAt: "desc" },
      select: { sectionId: true, classId: true, optionalSubjects: true },
    });
    if (!enrolment) return null;
    const section = await tx.section.findUniqueOrThrow({ where: { id: enrolment.sectionId }, select: { name: true, schoolClass: { select: { name: true, campusId: true } } } });
    const today = todayIn(current.school.timeZone);
    const campusId = section.schoolClass.campusId;
    const version = await effectiveVersion(tx, current.ctx, campusId, today);
    const [rows, cells, subjects] = await Promise.all([
      gridRows(tx, current.ctx, campusId),
      version ? sectionGrid(tx, version.id, enrolment.sectionId) : Promise.resolve([]),
      subjectsForClass(tx, enrolment.classId, today),
    ]);
    const optional = new Set(enrolment.optionalSubjects);
    const mine = subjects.filter((s) => s.type === "CORE" || optional.has(s.id));
    const teacherOf = new Map<string, string>();
    for (const c of cells) if (c.subjectId && c.staffName && !teacherOf.has(c.subjectId)) teacherOf.set(c.subjectId, c.staffName);
    const label = `${section.schoolClass.name} ${section.name}`;
    const board = await progressBoard(
      tx,
      academicYearId,
      mine.map((s) => ({ sectionId: enrolment.sectionId, classId: enrolment.classId, subjectId: s.id, label, subject: s.name, teacher: teacherOf.get(s.id) ?? null })),
      today,
    );
    return { sectionId: enrolment.sectionId, classId: enrolment.classId, label, version, slots: rows.slots, days: rows.days, cells, board, todayDay: weekday(today) };
  });
}

async function TimeTableTab(args: ProfileTabArgs) {
  const d = await load(args);
  if (!d) {
    return (
      <Card>
        <CardBody><p className="text-ink-2">This student has no class this year, so there is no Time Table to show.</p></CardBody>
      </Card>
    );
  }
  const slots = d.slots.map((s) => ({ number: s.number, label: s.label, startTime: s.startTime, endTime: s.endTime, isBreak: s.isBreak, days: s.days }));
  const withSyllabus = d.board.filter((b) => b.total > 0);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={`Time Table of ${d.label}`} description={d.version ? "The Time Table in force today." : undefined}
          action={<Link className="text-sm font-medium text-brand-text hover:underline" href={`/academic-management/time-table?section=${d.sectionId}`}>Open in Time Table</Link>} />
        <CardBody>
          {!d.version || slots.length === 0 ? (
            <p className="text-ink-2">No Time Table is published for this class yet (Academic Management, Time Table).</p>
          ) : (
            <TimetableGrid slots={slots} days={d.days} cells={d.cells} mode="class" today={d.todayDay} />
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Syllabus progress" description="Topics completed in this section, against the plan up to today."
          action={<Link className="text-sm font-medium text-brand-text hover:underline" href={`/academic-management/syllabus?view=progress&class=${d.classId}`}>Open Syllabus</Link>} />
        <CardBody>
          {withSyllabus.length === 0 ? (
            <p className="text-ink-2">No syllabus is added for this class&apos;s subjects yet (Academic Management, Syllabus &amp; Lesson Plans).</p>
          ) : (
            <ul className="divide-y divide-line">
              {withSyllabus.map((b) => (
                <li key={b.subjectId} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 sm:w-48">
                    <p className="font-medium">{b.subject}</p>
                    {b.teacher && <p className="text-sm text-ink-2">{b.teacher}</p>}
                  </div>
                  <div className="flex-1">
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={`${b.subject} completed`} aria-valuenow={b.completedPct} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-full bg-brand" style={{ width: `${b.completedPct}%` }} />
                    </div>
                    <p className="mt-1 text-sm text-ink-2">{b.completedPct}% completed · {b.plannedPct}% planned by today · {b.done} of {b.total} topics</p>
                  </div>
                  <Badge tone={b.late.length ? "warning" : "success"}>{b.late.length ? lateWords(b.late) : "On plan"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

registerProfileTab({
  key: "timetable",
  label: "Time Table",
  module: "academic-management",
  order: 25,
  load: (args) => TimeTableTab(args),
});
