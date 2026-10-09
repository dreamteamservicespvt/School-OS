// Academic Management demo: settings and the period master by day, fixed
// periods, rooms and a lab booking, teacher preferences, a subject condition,
// syllabus trees with progress (one section behind plan), lesson plans, a
// draft Time Table, today's approved leave with one substitute arranged, a
// teacher marked absent next Monday, and an elective choice.
import { withSchool, type Tx } from "../../src/lib/db";
import type { SeedSchool } from "./types";
import { day } from "./names";

const TODAY = "2026-10-09";

const UNITS: Record<string, { unit: string; chapters: [string, string[]][] }[]> = {
  MAT: [
    { unit: "Numbers", chapters: [["Large numbers", ["Place value", "Comparing numbers", "Rounding off"]], ["Operations", ["Addition and subtraction", "Multiplication", "Division"]]] },
    { unit: "Fractions and decimals", chapters: [["Fractions", ["Like and unlike fractions", "Equivalent fractions", "Adding fractions"]], ["Decimals", ["Tenths and hundredths", "Decimals on a number line"]]] },
    { unit: "Geometry", chapters: [["Shapes and angles", ["Types of angles", "Measuring angles"]], ["Perimeter and area", ["Perimeter", "Area of a rectangle"]]] },
    { unit: "Data handling", chapters: [["Tables and graphs", ["Tally marks", "Bar graphs"]]] },
  ],
  ENG: [
    { unit: "Reading", chapters: [["The little bird", ["Reading aloud", "New words", "Questions and answers"]], ["A trip to the zoo", ["Reading aloud", "Describing animals"]]] },
    { unit: "Grammar", chapters: [["Nouns and pronouns", ["Common and proper nouns", "Pronouns"]], ["Verbs and tenses", ["Action words", "Simple past"]]] },
    { unit: "Writing", chapters: [["Letter writing", ["Informal letter", "Formal letter"]]] },
  ],
};

export async function seedAcademic(school: SeedSchool) {
  const { ctx, schoolId, campusId, yearId } = school;
  await withSchool(ctx, async (tx) => {
    // Settings: Monday to Saturday, Saturday a half day after period 5.
    await tx.academicSettings.create({ data: { schoolId, campusId, dayStart: "08:45", dayEnd: "15:00", workingDays: [1, 2, 3, 4, 5, 6], halfDays: [6], halfDayEnd: "12:20" } });
    await tx.periodSlot.updateMany({ where: { campusId, number: { in: [6, 7, 8] } }, data: { days: [1, 2, 3, 4, 5] } });
    await tx.periodSlot.updateMany({ where: { campusId, number: -1 }, data: { days: [1, 2, 3, 4, 5] } });

    // Periods with no subject in the demo Time Table are fixed Library periods.
    await tx.timetablePeriod.updateMany({ where: { schoolId, room: "Library", subjectId: null }, data: { room: null, label: "Library" } });
    // Lunch and the short break as rows of every section's week.
    const version = await tx.timetableVersion.findFirstOrThrow({ where: { schoolId, academicYearId: yearId, status: "PUBLISHED" } });
    const slots = await tx.periodSlot.findMany({ where: { campusId, isBreak: true, archivedAt: null } });
    const sections = await tx.section.findMany({ where: { academicYearId: yearId, archivedAt: null }, include: { schoolClass: true }, orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }] });
    for (const sec of sections) for (const s of slots) for (const d of s.days) {
      await tx.timetablePeriod.create({ data: { schoolId, versionId: version.id, sectionId: sec.id, dayOfWeek: d, periodNo: s.number, startTime: s.startTime, endTime: s.endTime, isBreak: true, label: s.label } });
    }

    if (!school.full) return;

    // Optional parts this school uses: rooms and labs, elective choices.
    for (const key of ["academic-rooms", "academic-electives"]) await tx.schoolFeature.create({ data: { schoolId, featureKey: key, isOn: true } });
    const lab = await tx.room.create({ data: { schoolId, campusId, name: "Science lab", kind: "lab", capacity: 40 } });
    await tx.room.create({ data: { schoolId, campusId, name: "Computer lab", kind: "lab", capacity: 30 } });
    await tx.room.create({ data: { schoolId, campusId, name: "Library", kind: "activity", capacity: 60 } });

    const staff = await tx.staff.findMany({ where: { schoolId, staffType: "Teaching", archivedAt: null }, orderBy: { fullName: "asc" } });
    const ravi = staff.find((s) => s.userLoginId && s.userLoginId === school.users.teacher)!;
    const subjects = await tx.subject.findMany({ where: { schoolId } });
    const subj = (code: string) => subjects.find((s) => s.code === code)!;
    const sectionBy = (cls: string, name: string) => sections.find((s) => s.schoolClass.name === cls && s.name === name)!;

    const nine = sectionBy("Class 9", "A");
    await tx.labBooking.create({ data: { schoolId, roomId: lab.id, date: day("2026-10-13"), periodNo: 4, sectionId: nine.id, staffId: staff.find((s) => s.designation.includes("Science"))?.id ?? ravi.id, purpose: "Acids and bases practical" } });

    // Teacher preferences and a subject condition.
    await tx.teacherPreference.create({ data: { schoolId, staffId: ravi.id, maxPerDay: 6, unavailable: ["5:8", "6:5"], note: "Maths club after school on Fridays" } });
    const other = staff.find((s) => s.id !== ravi.id && s.designation !== "Principal")!;
    await tx.teacherPreference.create({ data: { schoolId, staffId: other.id, maxPerWeek: 28 } });
    await tx.subjectCondition.create({ data: { schoolId, subjectId: subj("PE").id, periodNo: 1 } });

    // An elective: Class 9 chooses Computer Science (30 seats).
    await tx.electiveOption.create({ data: { schoolId, academicYearId: yearId, classId: nine.classId, subjectId: subj("CS").id, groupName: "Optional subject", seats: 30 } });

    // Syllabus trees with planned dates, for Mathematics and English in classes 5 and 6.
    const start = day("2026-06-10").getTime();
    const end = day("2027-02-20").getTime();
    for (const cls of ["Class 5", "Class 6"]) {
      const classId = sectionBy(cls, "A").classId;
      for (const code of ["MAT", "ENG"]) {
        const units = UNITS[code];
        const leaves = units.flatMap((u) => u.chapters.flatMap((c) => c[1]));
        const step = (end - start) / leaves.length;
        let k = 0;
        for (const [ui, u] of units.entries()) {
          const unit = await tx.syllabusItem.create({ data: { schoolId, academicYearId: yearId, classId, subjectId: subj(code).id, kind: "UNIT", title: `Unit ${ui + 1}: ${u.unit}`, sortOrder: ui + 1 } });
          for (const [ci, [chapter, topics]] of u.chapters.entries()) {
            const from = new Date(start + step * k);
            const to = new Date(start + step * (k + topics.length) - 86_400_000);
            const ch = await tx.syllabusItem.create({ data: { schoolId, academicYearId: yearId, classId, subjectId: subj(code).id, parentId: unit.id, kind: "CHAPTER", title: chapter, sortOrder: ci + 1, plannedFrom: utcDay(from), plannedTo: utcDay(to) } });
            for (const [ti, t] of topics.entries()) {
              const topic = await tx.syllabusItem.create({ data: { schoolId, academicYearId: yearId, classId, subjectId: subj(code).id, parentId: ch.id, kind: "TOPIC", title: t, sortOrder: ti + 1 } });
              const planned = new Date(start + step * (k + 1));
              // Progress: A sections on plan, B sections three topics behind.
              for (const sec of sections.filter((s) => s.classId === classId)) {
                const behind = sec.name === "B" ? 3 : 0;
                const doneBy = day(TODAY).getTime() - behind * step;
                if (planned.getTime() <= doneBy) {
                  const alloc = await tx.teacherAllocation.findFirst({ where: { sectionId: sec.id, subjectId: subj(code).id, archivedAt: null } });
                  await tx.syllabusProgressEntry.create({ data: { schoolId, academicYearId: yearId, sectionId: sec.id, itemId: topic.id, staffId: alloc?.staffId ?? null, date: utcDay(planned > new Date(day(TODAY)) ? day(TODAY) : planned), status: "taught" } });
                }
              }
              k++;
            }
          }
        }
      }
    }

    // Ravi's lesson plans for the next topics in 5 A.
    const fiveA = sectionBy("Class 5", "A");
    const taught = (await tx.syllabusProgressEntry.findMany({ where: { sectionId: fiveA.id }, select: { itemId: true } })).map((e) => e.itemId);
    const pending = await tx.syllabusItem.findMany({ where: { classId: fiveA.classId, subjectId: subj("MAT").id, kind: "TOPIC", id: { notIn: taught } }, orderBy: [{ createdAt: "asc" }], take: 2 });
    for (const [i, t] of pending.entries()) {
      await tx.lessonPlan.create({ data: { schoolId, academicYearId: yearId, sectionId: fiveA.id, subjectId: subj("MAT").id, topicId: t.id, staffId: ravi.id, date: day(i === 0 ? "2026-10-12" : "2026-10-13"), objectives: `Students can explain ${t.title.toLowerCase()} with their own examples.`, resources: "Textbook, fraction strips, worksheet 4", activities: "Pair work, then 5 questions for homework" } });
    }

    // A draft of the next Time Table, copied from the published one.
    const draft = await tx.timetableVersion.create({ data: { schoolId, academicYearId: yearId, campusId, name: "Time Table 2026-27, draft after Dasara", status: "DRAFT" } });
    const periods = await tx.timetablePeriod.findMany({ where: { versionId: version.id, archivedAt: null } });
    await tx.timetablePeriod.createMany({ data: periods.map((p) => ({ schoolId, versionId: draft.id, sectionId: p.sectionId, dayOfWeek: p.dayOfWeek, periodNo: p.periodNo, startTime: p.startTime, endTime: p.endTime, subjectId: p.subjectId, staffId: p.staffId, room: p.room, isBreak: p.isBreak, label: p.label })) });

    // Today: a teacher on approved leave, one period covered, the rest needed.
    await seedSubstitutions(tx, school, version.id, ravi.id);
  }, { timeout: 600_000 });
}

async function seedSubstitutions(tx: Tx, school: SeedSchool, versionId: string, raviId: string) {
  const { schoolId, yearId } = school;
  const friday = 5;
  const teaching = await tx.timetablePeriod.findMany({ where: { versionId, dayOfWeek: friday, archivedAt: null, staffId: { not: null }, isBreak: false } });
  const byStaff = new Map<string, typeof teaching>();
  for (const p of teaching) byStaff.set(p.staffId!, [...(byStaff.get(p.staffId!) ?? []), p]);
  const principal = await tx.staff.findFirst({ where: { schoolId, designation: "Principal" } });
  const away = [...byStaff.entries()].filter(([id, list]) => id !== raviId && id !== principal?.id && list.length >= 3).sort((a, b) => b[1].length - a[1].length)[0];
  if (!away) return;
  const [awayId, list] = away;
  const cl = await tx.leaveType.findFirst({ where: { schoolId, code: "CL" } });
  if (!cl) return;
  const leave = await tx.leaveRequest.create({ data: { schoolId, academicYearId: yearId, staffId: awayId, leaveTypeId: cl.id, fromDate: day(TODAY), toDate: day(TODAY), days: 1, reason: "Family function", status: "APPROVED", decidedAt: day("2026-10-07") } });
  // One period covered by a free teacher who teaches that class.
  const period = list.sort((a, b) => a.periodNo - b.periodNo)[0];
  const busy = new Set(teaching.filter((p) => p.periodNo === period.periodNo).map((p) => p.staffId));
  const free = [...byStaff.keys()].find((id) => !busy.has(id) && id !== awayId && id !== principal?.id);
  for (const p of list) {
    const covered = p.id === period.id && free;
    await tx.substitution.create({ data: { schoolId, date: day(TODAY), periodId: p.id, absentStaffId: awayId, substituteStaffId: covered ? free : null, status: covered ? "ARRANGED" : "NEEDED", reason: "leave", leaveRequestId: leave.id, note: covered ? "Revise the last chapter" : null } });
  }
  // A teacher marked absent by hand next Monday.
  const monday = [...byStaff.keys()].find((id) => id !== awayId && id !== raviId && id !== principal?.id && id !== free);
  if (monday) await tx.staffAbsence.create({ data: { schoolId, staffId: monday, date: day("2026-10-12"), note: "Exam duty at the board office" } });
}

function utcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
