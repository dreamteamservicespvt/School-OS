// Academic Management exports (P8, 04 §7 reports): Excel, CSV or PDF with the
// filters on screen. Each export checks the Export permission, keeps a
// teacher to their own classes, and is written to the export log.
import { requireAction } from "@/lib/current";
import { withSchool, type Tx } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { formatDate } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import { chosenYear } from "@/lib/academic/years";
import { academicScope, type AcademicScope } from "@/lib/academic/scope";
import { mainCampusId, periodSlots } from "@/lib/academic/settings";
import { classesForYear } from "@/lib/academic/structure";
import { SUBJECT_TYPES, subjectTypeLabel } from "@/lib/academic/subjects";
import type { SubjectType } from "@prisma/client";
import { allocationGrid, teacherWorkloads } from "@/lib/academic/allocation";
import { publishedVersionForYear, sectionGrid, staffGrid, versionCells } from "@/lib/academic/timetable";
import { needsOn, reasonWords, substitutionLoads } from "@/lib/academic/substitutions";
import { allocationActiveOn } from "@/lib/academic/allocation";
import { progressBoard } from "@/lib/academic/syllabus";
import { DAY_NAMES, isoDay, parseDay, todayIn, weekday } from "@/lib/academic/common";
import type { Current } from "@/lib/current";
import type { SchoolContext } from "@/lib/db";

type Row = Record<string, string | number | null>;
type Built = { title: string; filters: string; labels: string[]; rows: Row[] };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const p = url.searchParams;
  const format: ExportFormat = p.get("format") === "csv" ? "csv" : p.get("format") === "pdf" ? "pdf" : "xlsx";
  let current: Current;
  try {
    ({ current } = await requireAction("academic-management", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("Your role cannot export from Academic Management.", { status: 403 });
    throw e;
  }
  const ctx = current.ctx;
  const today = todayIn(current.school.timeZone);

  const built = await withSchool(ctx, async (tx) => {
    const campusId = await mainCampusId(tx, ctx);
    const year = await chosenYear(tx, ctx, p.get("year"));
    const scope = await academicScope(tx, current, year?.id ?? null);
    const out = await build(tx, ctx, scope, { kind: p.get("kind") ?? "", p, campusId, yearId: year?.id ?? null, yearName: year?.name ?? "", today });
    if (out) await logExport(tx, ctx, { title: out.title, format, filters: out.filters, rows: out.rows.length });
    return out;
  }, { timeout: 60_000 });

  if (!built) return new Response("That export was not found, or there is nothing to export for your role.", { status: 404 });
  const columns: ExportColumn<Row>[] = built.labels.map((label) => ({ label, value: (r) => r[label] }));
  const file = await buildExport(format, columns, built.rows, { title: built.title, schoolName: current.school.name, filters: built.filters, exportedBy: current.user.displayName, timeZone: current.school.timeZone });
  return exportResponse(file);
}

async function build(tx: Tx, ctx: SchoolContext, scope: AcademicScope, a: { kind: string; p: URLSearchParams; campusId: string; yearId: string | null; yearName: string; today: Date }): Promise<Built | null> {
  const { p, yearId, today } = a;
  const own = scope.see === "own" && !scope.arrange;
  const inScope = (sectionId: string) => !scope.sectionIds || scope.sectionIds.includes(sectionId);

  switch (a.kind) {
    case "class-strength": {
      if (!yearId) return null;
      const classes = await classesForYear(tx, ctx, a.campusId, yearId, scope.sectionIds);
      const rows = classes.flatMap((c) => c.sections.map((s) => ({ Class: c.name, Section: s.name, "Class teacher": s.classTeacherName ?? "", Students: s.students, Seats: s.seats, "Seats left": Math.max(0, s.seats - s.students), Room: s.room ?? "" })));
      return { title: "Class strength and seats", filters: a.yearName, labels: ["Class", "Section", "Class teacher", "Students", "Seats", "Seats left", "Room"], rows };
    }
    case "subjects": {
      const q = (p.get("q") ?? "").trim();
      const type = p.get("type") ?? "";
      const subjects = await tx.subject.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, ...(type && SUBJECT_TYPES.some((t) => t.value === type) ? { type: type as SubjectType } : {}), ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {}) }, orderBy: { name: "asc" } });
      const maps = await tx.subjectClass.findMany({ where: { subjectId: { in: subjects.map((s) => s.id) }, archivedAt: null, toDate: null }, include: { schoolClass: { select: { name: true, sortOrder: true } } } });
      const rows = subjects.map((s) => ({ Subject: s.name, Code: s.code, Type: subjectTypeLabel(s.type), "Grade only": s.gradeOnly ? "Yes" : "No", Classes: maps.filter((m) => m.subjectId === s.id).sort((x, y) => x.schoolClass.sortOrder - y.schoolClass.sortOrder).map((m) => m.schoolClass.name).join(", ") }));
      return { title: "Subjects", filters: [q && `search "${q}"`, type && `type ${subjectTypeLabel(type)}`].filter(Boolean).join(", "), labels: ["Subject", "Code", "Type", "Grade only", "Classes"], rows };
    }
    case "allocation": {
      if (!yearId) return null;
      const classId = p.get("class");
      let sectionIds = scope.sectionIds;
      if (classId) sectionIds = (await tx.section.findMany({ where: { classId, academicYearId: yearId, archivedAt: null }, select: { id: true } })).map((s) => s.id).filter(inScope);
      const grid = await allocationGrid(tx, ctx, yearId, a.campusId, today, sectionIds);
      const rows: Row[] = [];
      for (const r of grid.rows) for (const s of grid.subjects) {
        const cells = r.cells[s.id];
        if (cells === null || cells === undefined) continue;
        const main = cells.find((c) => c.isMain && !c.upcoming);
        rows.push({ Section: r.label, Subject: s.name, "Primary teacher": main?.staffName ?? "No teacher", "Secondary teacher": cells.filter((c) => !c.isMain).map((c) => c.staffName).join(", "), From: main?.fromDate ? formatDate(main.fromDate) : "", Until: main?.toDate ? formatDate(main.toDate) : "" });
      }
      return { title: "Teacher allocation", filters: `${a.yearName}${classId ? ", one class" : ""}`, labels: ["Section", "Subject", "Primary teacher", "Secondary teacher", "From", "Until"], rows };
    }
    case "workload": {
      if (!yearId) return null;
      const list = await teacherWorkloads(tx, ctx, yearId, a.campusId, today, own ? scope.staffId ?? "none" : null);
      const rows = list.map((w) => ({ Teacher: w.name, Designation: w.designation, "Periods a week": w.periods, Limit: w.limit, "Over limit": w.periods > w.limit ? "Yes" : "", Classes: w.teaches.map((t) => `${t.label} ${t.subject}`).join(", ") }));
      return { title: "Teacher workload", filters: a.yearName, labels: ["Teacher", "Designation", "Periods a week", "Limit", "Over limit", "Classes"], rows };
    }
    case "timetable":
    case "free-periods": {
      if (!yearId) return null;
      const vId = p.get("version");
      let version = vId ? await tx.timetableVersion.findFirst({ where: { id: vId, archivedAt: null } }) : null;
      if (version && version.status !== "PUBLISHED" && !scope.arrange) version = null;
      version ??= await publishedVersionForYear(tx, yearId, today);
      if (!version) return null;
      if (a.kind === "free-periods") {
        if (own) return null;
        const dayNo = Number(p.get("day")) || weekday(today);
        const cells = await versionCells(tx, version.id);
        const teachers = await tx.staff.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, status: "ACTIVE", staffType: "Teaching" }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } });
        const slots = (await periodSlots(tx, ctx, version.campusId)).filter((s) => !s.isBreak && s.days.includes(dayNo));
        const rows = slots.map((s) => {
          const busy = new Set(cells.filter((c) => c.dayOfWeek === dayNo && c.periodNo === s.number && c.staffId).map((c) => c.staffId));
          const free = teachers.filter((t) => !busy.has(t.id));
          return { Period: s.label, Time: `${s.startTime} to ${s.endTime}`, "Free teachers": free.length, Names: free.map((t) => t.fullName).join(", ") };
        });
        return { title: `Free periods on ${DAY_NAMES[dayNo]}`, filters: version.name, labels: ["Period", "Time", "Free teachers", "Names"], rows };
      }
      const sectionId = p.get("section");
      const staffId = p.get("staff");
      let cells;
      let who = "";
      if (sectionId) {
        if (!inScope(sectionId)) return null;
        cells = await sectionGrid(tx, version.id, sectionId);
        who = cells[0]?.sectionLabel ?? "Class";
      } else if (staffId) {
        if (own && staffId !== scope.staffId) return null;
        cells = await staffGrid(tx, version.id, staffId);
        who = cells[0]?.staffName ?? "Teacher";
      } else return null;
      const rows = cells.map((c) => ({ Day: DAY_NAMES[c.dayOfWeek], Period: c.isBreak ? c.label ?? "Break" : c.periodNo, Time: `${c.startTime} to ${c.endTime}`, Class: c.sectionLabel, Subject: c.subjectName ?? c.label ?? "", Teacher: c.staffName ?? "", Room: c.room ?? "" }));
      return { title: `Time Table: ${who}`, filters: version.name, labels: ["Day", "Period", "Time", "Class", "Subject", "Teacher", "Room"], rows };
    }
    case "substitutions": {
      if (!scope.arrange) return null;
      const date = parseDay(p.get("date")) ?? today;
      const { rows: needs } = await needsOn(tx, ctx, a.campusId, date);
      const rows = needs.map((r) => ({ Date: formatDate(date), Period: r.periodNo, Class: r.sectionLabel, Subject: r.subjectName ?? "", "Absent teacher": r.absentName, Reason: reasonWords(r.reason), Substitute: r.substitution?.status === "ARRANGED" ? r.substitution.substituteName ?? "" : "Needed", Note: r.substitution?.note ?? "" }));
      return { title: "Substitutions", filters: formatDate(date), labels: ["Date", "Period", "Class", "Subject", "Absent teacher", "Reason", "Substitute", "Note"], rows };
    }
    case "substitution-load": {
      if (!scope.arrange) return null;
      const date = parseDay(p.get("date")) ?? today;
      const l = await substitutionLoads(tx, ctx, date);
      const teachers = await tx.staff.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, staffType: "Teaching" }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } });
      const rows = teachers.map((t) => ({ Teacher: t.fullName, "This week": l.week.get(t.id) ?? 0, "This month": l.month.get(t.id) ?? 0 }));
      return { title: "Substitution load", filters: `week and month of ${formatDate(date)}`, labels: ["Teacher", "This week", "This month"], rows };
    }
    case "syllabus-progress": {
      if (!yearId) return null;
      const classId = p.get("class");
      const allocations = await tx.teacherAllocation.findMany({
        where: { academicYearId: yearId, isMain: true, ...allocationActiveOn(today), ...(own ? { staffId: scope.staffId ?? "none" } : {}), ...(classId ? { section: { classId } } : {}) },
        include: { section: { include: { schoolClass: true } }, subject: true },
        orderBy: [{ section: { schoolClass: { sortOrder: "asc" } } }, { section: { name: "asc" } }],
      });
      const names = new Map((await tx.staff.findMany({ where: { id: { in: allocations.map((x) => x.staffId) } }, select: { id: true, fullName: true } })).map((s) => [s.id, s.fullName]));
      const pairs = allocations.filter((x) => x.section.archivedAt === null && inScope(x.sectionId)).map((x) => ({ sectionId: x.sectionId, classId: x.section.classId, subjectId: x.subjectId, label: `${x.section.schoolClass.name} ${x.section.name}`, subject: x.subject.name, teacher: names.get(x.staffId) ?? null }));
      const board = await progressBoard(tx, yearId, pairs.slice(0, 500), today);
      const rows = board.map((b) => ({ Section: b.label, Subject: b.subject, Teacher: b.teacher ?? "", "Topics done": b.done, Topics: b.total, "Completed %": b.completedPct, "Planned by today %": b.plannedPct, "Chapters late": b.late.map((l) => l.title).join(", ") }));
      return { title: "Syllabus progress", filters: `${a.yearName}${classId ? ", one class" : ""}, ${isoDay(today)}`, labels: ["Section", "Subject", "Teacher", "Topics done", "Topics", "Completed %", "Planned by today %", "Chapters late"], rows };
    }
    default:
      return null;
  }
}
