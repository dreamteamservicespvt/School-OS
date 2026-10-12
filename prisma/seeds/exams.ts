// Examination & Results demo, made through the module's own rules so every
// screen shows real records:
// - Unit Test 1 (July) for Classes 1–5 and 6–10: results published.
// - Unit Test 2 (September): Classes 1–5 published; Classes 6–8 published,
//   Classes 9–10 complete and set to publish on Wednesday.
// - Half Yearly for Classes 6–10: published datesheet, starting today, with
//   Theory and Internal marks and some internal marks already entered.
// - Half Yearly for Classes 1–5 and Pre-board 1 for Class 10: drafts.
// - A marks change approved after the lock (with history), one waiting,
//   remarks and co-scholastic grades, a question bank and two papers.
// Green Valley gets one published Unit Test, so its walls can be checked.
import { withSchool, type SchoolContext } from "../../src/lib/db";
import { createDatesheet, publishDatesheet, setCategories, type Category, type ScheduleRow } from "../../src/lib/exams/datesheet";
import { requestModeration, saveMarks, submitPaper, type MarkValue } from "../../src/lib/exams/marks";
import { publishResults } from "../../src/lib/exams/results";
import { ensureExamDefaults, saveWeights, setExamFeature } from "../../src/lib/exams/settings";
import { saveCoScholastic, saveRemarks } from "../../src/lib/exams/report-cards";
import { makePaper, saveQuestion, setPaperStatus } from "../../src/lib/exams/questions";
import { sectionStudents } from "../../src/lib/exams/roster";
import { subjectsForClass } from "../../src/lib/academic/subjects";
import { decide } from "../../src/lib/approvals";
import "../../src/lib/exams/handlers";
import type { ExamScope } from "../../src/lib/exams/scope";
import type { SeedSchool } from "./types";
import { day, rng } from "./names";

const FULL: ExamScope = { see: "all", manage: true, office: false, datesheets: true, publish: true, staffId: null, sectionIds: null, teaches: null, classTeacherOf: [], results: true, analysis: true, principal: true };

const SENIOR = ["English", "Mathematics", "Science", "Telugu", "Social Studies", "Hindi"];
const PRIMARY = ["English", "Mathematics", "Environmental Studies", "Telugu", "Hindi"];
const BIAS: Record<string, number> = { English: 0.04, Telugu: -0.01, Hindi: -0.03, Mathematics: 0.01, Science: 0.02, "Social Studies": -0.06, "Environmental Studies": 0.05 };

type Slot = { date: string; time: string; duration: number };
type Spec = { title: string; type: string; pattern: "PERCENTAGE" | "GRADING"; term: number; classes: string[]; subjects: string[]; slots: Slot[]; max: number; split?: (subject: string, className: string) => Category[] };

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/** A student's steady ability, from 0.38 to 0.96, so their results look alike across exams. */
const ability = (studentId: string) => 0.38 + (hash(studentId) % 59) / 100;

function markFor(studentId: string, subject: string, max: number, salt: string) {
  const r = rng(hash(`${studentId}|${subject}|${salt}`));
  const v = ability(studentId) + (BIAS[subject] ?? 0) + (r() - 0.5) * 0.18;
  return Math.max(0, Math.min(max, Math.round(max * Math.max(0.12, Math.min(1, v)))));
}

export async function seedExams(school: SeedSchool) {
  const principal = school.users.principal;
  if (!principal) return;
  const ctx: SchoolContext = { schoolId: school.schoolId, userId: principal };
  const yearId = school.yearId;

  const base = await withSchool(ctx, async (tx) => {
    await ensureExamDefaults(tx, ctx);
    const types = await tx.examType.findMany();
    const classes = await tx.schoolClass.findMany({ where: { campusId: school.campusId, archivedAt: null }, orderBy: { sortOrder: "asc" } });
    const sections = await tx.section.findMany({ where: { academicYearId: yearId, archivedAt: null }, orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }], include: { schoolClass: true } });
    const staff = await tx.staff.findMany({ where: { archivedAt: null, staffType: "Teaching" }, orderBy: { staffCode: "asc" }, select: { id: true, fullName: true } });
    return { types, classes, sections, staff };
  });
  const typeId = (name: string) => base.types.find((t) => t.name === name)!.id;
  const classId = (name: string) => base.classes.find((c) => c.name === name)?.id;
  const sectionsOf = (names: string[]) => base.sections.filter((s) => names.includes(s.schoolClass.name));
  const label = (s: (typeof base.sections)[number]) => `${s.schoolClass.name} ${s.name}`;

  // Invigilators: a different teacher for each paper written on the same day.
  const busy = new Map<string, number>();
  const invigilator = (slot: Slot) => {
    const n = busy.get(slot.date) ?? 0;
    busy.set(slot.date, n + 1);
    return base.staff.length > n ? base.staff[(n + hash(slot.date)) % base.staff.length].id : null;
  };

  async function makeExam(spec: Spec) {
    return withSchool(ctx, async (tx) => {
      const term = await tx.term.findFirstOrThrow({ where: { id: school.termIds[spec.term] } });
      const classIds = spec.classes.map(classId).filter((x): x is string => Boolean(x));
      const rows: ScheduleRow[] = [];
      for (const cid of classIds) {
        const cls = base.classes.find((c) => c.id === cid)!;
        const have = await subjectsForClass(tx, cid, day(spec.slots[0].date));
        spec.subjects.forEach((name, i) => {
          const sub = have.find((s) => s.name === name);
          const slot = spec.slots[i];
          if (!sub || !slot) return;
          rows.push({ classId: cid, subjectId: sub.id, date: day(slot.date), startTime: slot.time, durationMin: slot.duration, room: `Room ${cls.sortOrder + 4}`, invigilatorId: invigilator(slot), maxMarks: spec.max, pattern: null });
        });
      }
      const dates = spec.slots.map((s) => s.date).sort();
      const { exam } = await createDatesheet(tx, ctx, yearId, {
        title: spec.title, examTypeId: typeId(spec.type), pattern: spec.pattern, termId: term.id,
        startDate: day(dates[0]), endDate: day(dates.at(-1)!), classIds, gradeScaleId: null,
      }, rows);
      if (spec.split) {
        const entries = await tx.datesheetEntry.findMany({ where: { examId: exam.id } });
        for (const e of entries) {
          const sub = await tx.subject.findFirstOrThrow({ where: { id: e.subjectId } });
          const cls = base.classes.find((c) => c.id === e.classId)!;
          await setCategories(tx, ctx, e.id, spec.split(sub.name, cls.name), false);
        }
      }
      return exam;
    });
  }

  async function publishSheet(examId: string, on: string) {
    await withSchool(ctx, async (tx) => {
      await publishDatesheet(tx, ctx, examId, { tellParents: false });
      await tx.exam.update({ where: { id: examId }, data: { publishedAt: new Date(`${on}T10:30:00+05:30`) } });
    });
  }

  /** Enters marks for every paper of an exam in some sections. `share` leaves the rest blank; `parts` limits to some categories. */
  async function enterMarks(examId: string, sectionIds: string[], opts: { submit?: boolean; share?: (entrySubject: string, section: string) => number; parts?: string[] } = {}) {
    const entries = await withSchool(ctx, (tx) => tx.datesheetEntry.findMany({ where: { examId, archivedAt: null }, include: { exam: true } }));
    for (const sectionId of sectionIds) {
      const section = base.sections.find((s) => s.id === sectionId)!;
      for (const e of entries.filter((x) => x.classId === section.classId)) {
        await withSchool(ctx, async (tx) => {
          const sub = await tx.subject.findFirstOrThrow({ where: { id: e.subjectId } });
          const students = await sectionStudents(tx, [sectionId], yearId);
          const cats = (Array.isArray(e.categories) && e.categories.length ? e.categories : [{ name: "Marks", max: e.maxMarks }]) as Category[];
          const share = opts.share ? opts.share(sub.name, label(section)) : 1;
          const rows: ({ studentId: string } & MarkValue)[] = [];
          students.slice(0, Math.round(students.length * share)).forEach((st, i) => {
            const salt = `${e.examId}`;
            const r = rng(hash(`${st.studentId}${sub.name}${salt}abs`))();
            const absent = r < 0.015;
            const medical = !absent && i === 3 && sub.name === "Social Studies" && label(section) === "Class 7 A";
            const parts: Record<string, number | null> = {};
            for (const c of cats) {
              if (opts.parts && !opts.parts.includes(c.name)) continue;
              parts[c.name] = absent || medical ? null : markFor(st.studentId, sub.name, c.max, `${salt}${c.name}`);
            }
            rows.push({ studentId: st.studentId, parts: absent || medical ? {} : parts, absent, medical, grade: null, remark: null });
          });
          if (rows.length) await saveMarks(tx, ctx, FULL, { entryId: e.id, sectionId, rows });
          if (opts.submit && share >= 1 && !opts.parts) await submitPaper(tx, ctx, FULL, e.id, sectionId);
        }, { timeout: 120_000 });
      }
    }
  }

  async function publish(examId: string, sectionIds: string[], at: string, messageParents = false) {
    const when = new Date(`${at}+05:30`);
    await withSchool(ctx, (tx) => publishResults(tx, ctx, FULL, { key: `exam:${examId}`, sectionIds, publishOn: when, messageParents }, when), { timeout: 120_000 });
  }

  const seniorNames = ["Class 6", "Class 7", "Class 8", "Class 9", "Class 10"].filter((c) => classId(c));
  const primaryNames = ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5"].filter((c) => classId(c));
  const ut = (days: [string, string][], dur = 60): Slot[] => days.map(([date, time]) => ({ date, time, duration: dur }));

  if (!school.full) {
    // Green Valley: one Unit Test for Classes 6 to 8, results published.
    const names = ["Class 6", "Class 7", "Class 8"].filter((c) => classId(c));
    const exam = await makeExam({ title: "Unit Test 1", type: "Unit Test 1", pattern: "PERCENTAGE", term: 0, classes: names, subjects: SENIOR, max: 25, slots: ut([["2026-07-20", "09:00"], ["2026-07-21", "09:00"], ["2026-07-22", "09:00"], ["2026-07-23", "09:00"], ["2026-07-24", "09:00"], ["2026-07-24", "11:00"]]) });
    await publishSheet(exam.id, "2026-07-06");
    const secs = sectionsOf(names).map((s) => s.id);
    await enterMarks(exam.id, secs, { submit: true });
    await publish(exam.id, secs, "2026-07-31T16:00:00");
    return;
  }

  // Exam Settings: final weights and the optional parts this school uses.
  await withSchool(ctx, async (tx) => {
    await saveWeights(tx, ctx, [
      { examTypeId: typeId("Unit Test 1"), weight: 10 }, { examTypeId: typeId("Unit Test 2"), weight: 10 },
      { examTypeId: typeId("Half Yearly"), weight: 30 }, { examTypeId: typeId("Annual"), weight: 50 },
    ]);
    for (const key of ["exam-seating", "exam-question-papers", "exam-co-scholastic"]) await setExamFeature(tx, ctx, key, true);
  });

  // ---------- Unit Test 1 (July) ----------
  const ut1s = await makeExam({ title: "Unit Test 1", type: "Unit Test 1", pattern: "PERCENTAGE", term: 0, classes: seniorNames, subjects: SENIOR, max: 25, slots: ut([["2026-07-20", "09:00"], ["2026-07-21", "09:00"], ["2026-07-22", "09:00"], ["2026-07-23", "09:00"], ["2026-07-24", "09:00"], ["2026-07-24", "11:00"]]) });
  const ut1p = await makeExam({ title: "Unit Test 1", type: "Unit Test 1", pattern: "GRADING", term: 0, classes: primaryNames, subjects: PRIMARY, max: 25, slots: ut([["2026-07-21", "09:00"], ["2026-07-21", "11:00"], ["2026-07-22", "09:00"], ["2026-07-23", "09:00"], ["2026-07-23", "11:00"]]) });
  await publishSheet(ut1s.id, "2026-07-06");
  await publishSheet(ut1p.id, "2026-07-07");
  const seniorSecs = sectionsOf(seniorNames).map((s) => s.id);
  const primarySecs = sectionsOf(primaryNames).map((s) => s.id);
  await enterMarks(ut1s.id, seniorSecs, { submit: true });
  await enterMarks(ut1p.id, primarySecs, { submit: true });
  await publish(ut1s.id, seniorSecs, "2026-07-31T16:00:00");
  await publish(ut1p.id, primarySecs, "2026-07-30T16:00:00");

  // ---------- Unit Test 2 (September) ----------
  const ut2s = await makeExam({ title: "Unit Test 2", type: "Unit Test 2", pattern: "PERCENTAGE", term: 0, classes: seniorNames, subjects: SENIOR, max: 25, slots: ut([["2026-09-21", "09:00"], ["2026-09-22", "09:00"], ["2026-09-23", "09:00"], ["2026-09-24", "09:00"], ["2026-09-25", "09:00"], ["2026-09-25", "11:00"]]) });
  const ut2p = await makeExam({ title: "Unit Test 2", type: "Unit Test 2", pattern: "GRADING", term: 0, classes: primaryNames, subjects: PRIMARY, max: 25, slots: ut([["2026-09-22", "09:00"], ["2026-09-22", "11:00"], ["2026-09-23", "09:00"], ["2026-09-24", "09:00"], ["2026-09-24", "11:00"]]) });
  await publishSheet(ut2s.id, "2026-09-08");
  await publishSheet(ut2p.id, "2026-09-09");
  await enterMarks(ut2s.id, seniorSecs, { submit: true });
  await enterMarks(ut2p.id, primarySecs, { submit: true });
  const middle = sectionsOf(["Class 6", "Class 7", "Class 8"]).map((s) => s.id);
  const upper = sectionsOf(["Class 9", "Class 10"]).map((s) => s.id);
  await publish(ut2s.id, middle, "2026-09-28T16:00:00");
  await publish(ut2p.id, primarySecs, "2026-09-29T16:00:00");
  // Classes 9 and 10: complete, set to publish on Wednesday morning.
  await withSchool(ctx, (tx) => publishResults(tx, ctx, FULL, { key: `exam:${ut2s.id}`, sectionIds: upper, publishOn: new Date("2026-10-14T09:00:00+05:30"), messageParents: true }, new Date("2026-10-07T12:00:00+05:30")), { timeout: 120_000 });

  // A marks change after the lock, approved: Mathematics in Class 6 A, asked by the subject teacher.
  const teacher = school.users.teacher;
  const six = base.sections.find((s) => s.schoolClass.name === "Class 6" && s.name === "A");
  if (teacher && six) {
    const tctx: SchoolContext = { schoolId: school.schoolId, userId: teacher };
    await withSchool(tctx, async (tx) => {
      const maths = await tx.subject.findFirstOrThrow({ where: { name: "Mathematics" } });
      const entry = await tx.datesheetEntry.findFirstOrThrow({ where: { examId: ut2s.id, classId: six.classId, subjectId: maths.id } });
      const m = await tx.marks.findFirstOrThrow({ where: { entryId: entry.id, sectionId: six.id, absent: false, total: { lt: 22 } }, orderBy: { total: "desc" } });
      const scope: ExamScope = { ...FULL, manage: false, publish: false, principal: false, teaches: [{ sectionId: six.id, subjectId: maths.id }], sectionIds: [six.id] };
      const { approval } = await requestModeration(tx, tctx, scope, { entryId: entry.id, sectionId: six.id, studentId: m.studentId, value: { parts: { Marks: (m.total ?? 0) + 2 }, absent: false, grade: null, remark: null }, reason: "Question 7 was checked but not added to the total" });
      await decide(tx, ctx, approval.id, "approve", null);
    });
  }
  // One waiting for the Principal: Science in Class 9 A, asked by the subject teacher's head (School Admin).
  const admin = school.users.admin;
  const nine = base.sections.find((s) => s.schoolClass.name === "Class 9" && s.name === "A");
  if (admin && nine) {
    const actx: SchoolContext = { schoolId: school.schoolId, userId: admin };
    await withSchool(actx, async (tx) => {
      const sci = await tx.subject.findFirstOrThrow({ where: { name: "Science" } });
      const entry = await tx.datesheetEntry.findFirstOrThrow({ where: { examId: ut2s.id, classId: nine.classId, subjectId: sci.id } });
      const m = await tx.marks.findFirstOrThrow({ where: { entryId: entry.id, sectionId: nine.id, absent: false, total: { lt: 24 } }, orderBy: { total: "asc" } });
      await requestModeration(tx, actx, FULL, { entryId: entry.id, sectionId: nine.id, studentId: m.studentId, value: { parts: { Marks: (m.total ?? 0) + 1 }, absent: false, grade: null, remark: null }, reason: "Diagram in question 4 was not marked" });
    });
  }

  // ---------- Half Yearly (Classes 6–10), starting today ----------
  const split = (subject: string, className: string): Category[] =>
    subject === "Science" && ["Class 6", "Class 7", "Class 8"].includes(className) ? [{ name: "Theory", max: 70 }, { name: "Practical", max: 30 }] : [{ name: "Theory", max: 80 }, { name: "Internal", max: 20 }];
  const hySlots: Slot[] = [["2026-10-12", "09:00"], ["2026-10-14", "09:00"], ["2026-10-15", "09:00"], ["2026-10-16", "09:00"], ["2026-10-26", "09:00"], ["2026-10-27", "09:00"]].map(([date, time]) => ({ date, time, duration: 180 }));
  const hy = await makeExam({ title: "Half Yearly", type: "Half Yearly", pattern: "PERCENTAGE", term: 0, classes: seniorNames, subjects: SENIOR, max: 100, slots: hySlots, split });
  await publishSheet(hy.id, "2026-10-02");
  // Internal and practical marks are being entered; more done in some classes than others.
  await enterMarks(hy.id, seniorSecs, { parts: ["Internal", "Practical"], share: (sub, sec) => ((hash(sub + sec) % 10) < 3 ? 0 : (hash(sub + sec) % 10) < 7 ? 1 : 0.75) });

  // Admit cards printed for most sections.
  await withSchool(ctx, async (tx) => {
    for (const s of sectionsOf(seniorNames).slice(0, -1)) {
      const n = (await sectionStudents(tx, [s.id], yearId)).length;
      await tx.admitCardPrint.create({ data: { schoolId: school.schoolId, examId: hy.id, sectionId: s.id, count: n, printedById: principal, printedAt: new Date("2026-10-06T11:00:00+05:30") } });
    }
  });

  // ---------- Drafts ----------
  await makeExam({ title: "Half Yearly", type: "Half Yearly", pattern: "GRADING", term: 0, classes: primaryNames, subjects: PRIMARY, max: 50,
    slots: [["2026-10-27", "11:30"], ["2026-10-28", "09:00"], ["2026-10-29", "09:00"], ["2026-10-30", "09:00"], ["2026-10-30", "11:30"]].map(([date, time]) => ({ date, time, duration: 120 })) });
  if (classId("Class 10")) {
    await makeExam({ title: "Pre-board 1", type: "Pre-final", pattern: "PERCENTAGE", term: 1, classes: ["Class 10"], subjects: ["Mathematics", "English", "Science", "Social Studies"], max: 80,
      slots: [["2026-12-07", "09:00"], ["2026-12-09", "09:00"], ["2026-12-11", "09:00"], ["2026-12-14", "09:00"]].map(([date, time]) => ({ date, time, duration: 180 })) });
  }

  // ---------- Report cards: remarks and co-scholastic grades ----------
  const REMARKS = [
    "Works steadily and takes part in class. Keep reading every day.",
    "A bright and curious learner. Needs to check answers before handing in.",
    "Has improved a lot this term. Should practise mental maths daily.",
    "Neat and careful work. Should ask questions more often in class.",
    "Good effort in all subjects. Handwriting can be more careful.",
    "Very helpful to classmates. Should revise lessons at home regularly.",
  ];
  await withSchool(ctx, async (tx) => {
    const areas = await tx.coScholasticArea.findMany({ where: { archivedAt: null } });
    for (const name of ["Class 5", "Class 7"]) {
      const sec = base.sections.find((s) => s.schoolClass.name === name && s.name === "A");
      if (!sec) continue;
      const exam = name === "Class 5" ? ut2p : ut2s;
      const period = `exam:${exam.id}`;
      const students = await sectionStudents(tx, [sec.id], yearId);
      const withRemarks = students.slice(0, students.length - 3);
      await saveRemarks(tx, ctx, FULL, { sectionId: sec.id, period, principal: false, rows: withRemarks.map((s, i) => ({ studentId: s.studentId, classTeacherRemark: REMARKS[(i + hash(s.studentId)) % REMARKS.length] })) });
      if (name === "Class 7") await saveRemarks(tx, ctx, FULL, { sectionId: sec.id, period, principal: true, rows: withRemarks.slice(0, 6).map((s) => ({ studentId: s.studentId, principalRemark: "Keep up the good work." })) });
      await saveCoScholastic(tx, ctx, FULL, { sectionId: sec.id, period, rows: students.flatMap((s) => areas.map((a) => ({ studentId: s.studentId, areaId: a.id, grade: a.grades[hash(s.studentId + a.name) % 2] }))) });
    }
  }, { timeout: 120_000 });

  // ---------- Question bank and papers (Class 6 Mathematics) ----------
  await withSchool(ctx, async (tx) => {
    const cid = classId("Class 6");
    const maths = await tx.subject.findFirst({ where: { name: "Mathematics" } });
    if (!cid || !maths) return;
    const chapters = await tx.syllabusItem.findMany({ where: { academicYearId: yearId, classId: cid, subjectId: maths.id, kind: "CHAPTER", archivedAt: null }, orderBy: { sortOrder: "asc" } });
    if (chapters.length === 0) return;
    const ch = (title: string) => (chapters.find((c) => c.title === title) ?? chapters[0]).id;
    const Q: [string, string, string, number, string, string[], string | null][] = [
      ["Large numbers", "mcq", "Which is the place value of 7 in 4,73,215?", 1, "easy", ["70,000", "7,000", "7,00,000", "700"], "70,000"],
      ["Large numbers", "short", "Write 6,05,040 in words.", 2, "easy", [], "Six lakh five thousand forty"],
      ["Large numbers", "short", "Round off 8,46,519 to the nearest thousand.", 2, "medium", [], "8,47,000"],
      ["Large numbers", "true-false", "The smallest 6-digit number is 1,00,000.", 1, "easy", [], "true"],
      ["Operations", "short", "Find 3,456 × 25.", 2, "medium", [], "86,400"],
      ["Operations", "long", "A school bought 48 benches at ₹1,250 each and 36 tables at ₹2,175 each. How much did it pay in all?", 5, "hard", [], "₹1,38,300"],
      ["Operations", "mcq", "What is 9,876 ÷ 12?", 1, "medium", ["823", "813", "832", "803"], "823"],
      ["Fractions", "mcq", "Which fraction is equal to 3/4?", 1, "easy", ["6/8", "4/6", "9/16", "3/8"], "6/8"],
      ["Fractions", "short", "Add 2/5 and 1/3.", 2, "medium", [], "11/15"],
      ["Fractions", "fill-blank", "A fraction with the numerator greater than the denominator is called an ______ fraction.", 1, "easy", [], "improper"],
      ["Fractions", "long", "Ravi ate 2/7 of a cake and Meena ate 3/7. What part of the cake is left? Show your working.", 3, "medium", [], "2/7"],
      ["Decimals", "short", "Write 7 tenths and 5 hundredths as a decimal.", 1, "easy", [], "0.75"],
      ["Decimals", "long", "Mark 0.3, 0.75 and 1.2 on a number line and arrange them in increasing order.", 4, "hard", [], "0.3 < 0.75 < 1.2"],
      ["Shapes and angles", "mcq", "An angle of 120° is", 1, "easy", ["Obtuse", "Acute", "Right", "Straight"], "Obtuse"],
      ["Shapes and angles", "short", "How many right angles make a complete turn?", 1, "easy", [], "4"],
      ["Perimeter and area", "short", "Find the perimeter of a rectangle 12 cm long and 7 cm wide.", 2, "easy", [], "38 cm"],
      ["Perimeter and area", "long", "A garden is 25 m long and 18 m wide. Find the cost of fencing it at ₹40 per metre.", 4, "hard", [], "₹3,440"],
      ["Perimeter and area", "match", "Match each shape with its area formula.", 3, "medium", ["Square = side × side", "Rectangle = length × breadth", "Triangle = ½ × base × height"], null],
      ["Tables and graphs", "short", "In a tally, what does a bundle of four lines crossed by a fifth stand for?", 1, "easy", [], "5"],
      ["Tables and graphs", "long", "Draw a bar graph for: Monday 30, Tuesday 45, Wednesday 25, Thursday 40 students in the library.", 5, "medium", [], null],
    ];
    const ids: string[] = [];
    for (const [chapter, type, text, marks, difficulty, options, answer] of Q) {
      const q = await saveQuestion(tx, ctx, FULL, yearId, { classId: cid, subjectId: maths.id, chapterId: ch(chapter), type, text, options, answer, marks, difficulty, tags: [] });
      ids.push(q.id);
    }
    const final = await makePaper(tx, ctx, FULL, yearId, { title: "Half Yearly Mathematics, Class 6", examId: hy.id, classId: cid, subjectId: maths.id, method: "manual", questionIds: ids.slice(0, 14), durationMin: 180, instructions: "Answer all questions. Show your working for long answers." });
    await setPaperStatus(tx, ctx, FULL, yearId, final.id, "final");
    await makePaper(tx, ctx, FULL, yearId, { title: "Practice test: Fractions and decimals", examId: null, classId: cid, subjectId: maths.id, method: "manual", questionIds: ids.slice(7, 13), durationMin: 40, instructions: null });
  });
}

