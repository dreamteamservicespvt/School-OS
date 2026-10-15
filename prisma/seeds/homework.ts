// Homework & Learning demo: the optional pages and the teacher assistant on;
// homework for Classes 5 to 7 in Maths, English, EVS or Science and Hindi
// (past work checked with scores and feedback, some missing or still to
// check; current work due today and in the next days, partly handed in), the
// "Homework set" message to parents with WhatsApp read receipts; Ravi Teja's
// 5 A Maths learning path with lessons opened and finished; quizzes (open,
// closed, draft) with attempts; class discussion boards with a pinned topic,
// replies and a hidden post; online classes (done with attendance and a
// recording, cancelled, coming up); and a "student" demo login in 5 A.
import type { Prisma } from "@prisma/client";
import { prisma, withSchool, type SchoolContext, type Tx } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/auth/password";
import { tellParentsHomeworkSet } from "../../src/lib/homework/notify-parents";
import { gradeFor, markAttempt } from "../../src/lib/homework/words";
import type { SeedSchool } from "./types";

const DAY = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
/** A moment at a clock time in India on a date. */
const at = (d: Date, hhmm: string) => new Date(`${d.toISOString().slice(0, 10)}T${hhmm}:00+05:30`);

/** A small repeatable random number source, so every reset gives the same demo. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const WORK: Record<string, { title: string; instructions: string; max: number }[]> = {
  MAT: [
    { title: "Exercise 4.2 · Fractions, Q1–Q10", instructions: "Solve questions 1 to 10 in your notebook. Write each step. Draw the fraction strips for Q3 and Q4.", max: 20 },
    { title: "Practice sheet · Multiplication of large numbers", instructions: "Do all 12 sums on the sheet. Check each answer by estimating first.", max: 20 },
    { title: "Exercise 3.4 · Division word problems", instructions: "Read each problem twice. Write what you know, the sum and the answer with its unit.", max: 20 },
    { title: "Revision worksheet 1 · Numbers and operations", instructions: "Revise chapters 1 to 3. Attempt every question; the last two are a little harder.", max: 50 },
  ],
  ENG: [
    { title: "Read chapter 5 and write a short summary", instructions: "Read the lesson again and write a summary in about 100 words. Underline five new words.", max: 10 },
    { title: "Grammar · Adjectives worksheet", instructions: "Fill in the blanks with suitable adjectives and make three sentences of your own.", max: 10 },
    { title: "Letter to a friend about Dasara", instructions: "Write an informal letter (120 words) to a friend about how you will spend the Dasara holidays.", max: 10 },
  ],
  EVS: [
    { title: "Water: draw the water cycle", instructions: "Draw and label the water cycle. Write two lines on each stage.", max: 10 },
    { title: "Plants around us · leaf collection", instructions: "Collect five different leaves, paste them and write the plant's name under each.", max: 10 },
  ],
  SCI: [
    { title: "Light: draw ray diagrams for 3 mirrors", instructions: "Draw ray diagrams for a plane, a concave and a convex mirror. Label every ray.", max: 10 },
    { title: "Lab record · Nutrition in plants", instructions: "Write the starch test experiment in your lab record: aim, material, method and result.", max: 10 },
  ],
  SST: [
    { title: "Map work · Rivers of India", instructions: "Mark the main rivers of India on the outline map. Use blue for rivers and write their names neatly.", max: 10 },
  ],
  HIN: [
    { title: "निबंध · मेरा प्रिय त्योहार", instructions: "Write an essay of 120 words on your favourite festival. Check the matras.", max: 20 },
    { title: "Hindi · पाठ 6 के प्रश्न-उत्तर", instructions: "Answer the questions at the end of lesson 6 in full sentences.", max: 10 },
  ],
};

const FEEDBACK = [
  "Neat working and correct answers. Keep it up.",
  "Good work. Check the last two answers again.",
  "Well done. Write the units with every answer.",
  "Good ideas. Write in paragraphs next time.",
  "Some answers need another look. Let us go over them in class.",
];

/** A "student" demo login for a 5 A student (from DEMO_PASSWORD; none without it). */
async function studentLogin(school: SeedSchool, studentId: string, name: string) {
  const password = process.env.DEMO_PASSWORD;
  if (!password) return null;
  let u = await prisma.userLogin.findUnique({ where: { username: "student" } });
  if (!u) u = await prisma.userLogin.create({ data: { username: "student", displayName: name, status: "ACTIVE", passwordHash: await hashPassword(password), passwordChangedAt: new Date() } });
  const userId = u.id;
  await withSchool({ schoolId: school.schoolId, userId: null }, async (tx) => {
    await tx.role.updateMany({ where: { key: "student" }, data: { isEnabled: true } });
    await tx.student.update({ where: { id: studentId }, data: { userLoginId: userId } });
    if (await tx.schoolAccess.findFirst({ where: { userLoginId: userId } })) return;
    const role = await tx.role.findFirstOrThrow({ where: { key: "student" } });
    await tx.schoolAccess.create({ data: { schoolId: school.schoolId, userLoginId: userId, roles: { create: [{ roleId: role.id, schoolId: school.schoolId }] } } });
  });
  return userId;
}

export async function seedHomework(school: SeedSchool) {
  const sys: SchoolContext = { schoolId: school.schoolId, userId: school.users.principal ?? null };
  // The optional pages and the teacher assistant, on in both demo schools.
  await withSchool(sys, async (tx) => {
    for (const featureKey of ["homework-study-material", "homework-quizzes", "homework-discussions", "homework-online-classes", "ai-assistant", "ai-teacher-assistant"]) {
      await tx.schoolFeature.upsert({ where: { schoolId_featureKey: { schoolId: school.schoolId, featureKey } }, create: { schoolId: school.schoolId, featureKey, isOn: true }, update: { isOn: true } });
    }
  });
  if (!school.full) return;
  if (await withSchool(sys, (tx) => tx.homework.count())) return;

  const today = new Date(new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10) + "T00:00:00Z");
  const random = rng(17);
  const yearId = school.yearId;

  // Who teaches what in Classes 5 to 7.
  const plan = await withSchool(sys, async (tx) => {
    const sections = await tx.section.findMany({ where: { academicYearId: yearId, archivedAt: null, schoolClass: { name: { in: ["Class 5", "Class 6", "Class 7"] } } }, include: { schoolClass: true }, orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }] });
    const subjects = await tx.subject.findMany({ where: { code: { in: Object.keys(WORK) } } });
    const allocs = await tx.teacherAllocation.findMany({ where: { academicYearId: yearId, sectionId: { in: sections.map((s) => s.id) }, subjectId: { in: subjects.map((s) => s.id) } } });
    const staff = await tx.staff.findMany({ where: { id: { in: [...new Set(allocs.map((a) => a.staffId))] } }, select: { id: true, fullName: true, userLoginId: true } });
    const students = new Map<string, { id: string; name: string; roll: number }[]>();
    for (const s of sections) {
      const rows = await tx.enrolment.findMany({ where: { sectionId: s.id, academicYearId: yearId, archivedAt: null, status: "STUDYING" }, include: { student: { select: { id: true, fullName: true } } }, orderBy: { rollNo: "asc" } });
      students.set(s.id, rows.map((r) => ({ id: r.student.id, name: r.student.fullName, roll: r.rollNo ?? 0 })));
    }
    // Homework messages to parents: "Homework set" on WhatsApp, with the template approved.
    await tx.automaticMessageRule.upsert({ where: { schoolId_key: { schoolId: school.schoolId, key: "homework-set" } }, create: { schoolId: school.schoolId, key: "homework-set", isOn: true, channels: ["whatsapp"] }, update: { isOn: true, channels: ["whatsapp"] } });
    if (!(await tx.template.findFirst({ where: { key: "homework-set", channel: "whatsapp" } }))) {
      const t = await tx.template.create({ data: { schoolId: school.schoolId, name: "Homework set (WhatsApp)", category: "homework", channel: "whatsapp", key: "homework-set" } });
      await tx.templateVersion.create({ data: { schoolId: school.schoolId, templateId: t.id, language: "en", version: 1, body: "Dear {guardian_name}, new homework for {class}: {message} - {school_name}", variables: ["guardian_name", "class", "message", "school_name"], whatsappName: "homework_set", whatsappStatus: "APPROVED" } });
    }
    await tx.templateVersion.updateMany({ where: { template: { channel: "whatsapp", key: { in: ["homework-set", "homework-pending"] } } }, data: { whatsappStatus: "APPROVED" } });
    return { sections, subjects, allocs, staff, students };
  });
  const subjectCode = new Map(plan.subjects.map((s) => [s.id, s.code]));
  const staffOf = new Map(plan.staff.map((s) => [s.id, s]));
  const fiveA = plan.sections.find((s) => s.schoolClass.name === "Class 5" && s.name === "A")!;
  const me = plan.students.get(fiveA.id)![3];
  const studentUser = await studentLogin(school, me.id, me.name);

  // ------------------------------------------------------------ homework and submissions
  let n = 0;
  for (const sec of plan.sections) {
    const roster = plan.students.get(sec.id) ?? [];
    if (!roster.length) continue;
    const label = `${sec.schoolClass.name.replace("Class ", "")} ${sec.name}`;
    for (const a of plan.allocs.filter((x) => x.sectionId === sec.id)) {
      const code = subjectCode.get(a.subjectId)!;
      const teacher = staffOf.get(a.staffId)!;
      const ctx: SchoolContext = { schoolId: school.schoolId, userId: teacher.userLoginId ?? sys.userId };
      const list = WORK[code];
      const isRavi = teacher.userLoginId === school.users.teacher;
      // Past (checked), past due with work to check (Ravi), due today, due later.
      const kinds: ("past" | "check" | "today" | "later")[] = isRavi ? ["past", "check", "today", "later"] : n % 3 === 0 ? ["past", "today"] : ["past", "later"];
      for (const [i, kind] of kinds.entries()) {
        const w = list[(i + n) % list.length];
        const start = kind === "past" ? addDays(today, -16 - (n % 5)) : kind === "check" ? addDays(today, -6) : kind === "today" ? addDays(today, -1 - (n % 2)) : addDays(today, -(n % 2));
        let due = kind === "past" ? addDays(start, 3) : kind === "check" ? addDays(today, -3) : kind === "today" ? today : addDays(today, 1 + (n % 2));
        if (due.getUTCDay() === 0) due = addDays(due, 1);
        n++;
        await withSchool(ctx, async (tx: Tx) => {
          const hw = await tx.homework.create({ data: {
            schoolId: school.schoolId, academicYearId: yearId, sectionId: sec.id, classId: sec.classId, subjectId: a.subjectId, teacherId: a.staffId,
            title: w.title, instructions: w.instructions, givenTo: "SECTION", startDate: start, dueDate: due, maxMarks: w.max, createdById: ctx.userId,
            createdAt: at(start, "15:10"), missingMarkedAt: kind === "past" ? at(addDays(due, 1), "00:30") : null,
          } });
          if (i === 0 && code === "MAT") await tx.homeworkAttachment.create({ data: { schoolId: school.schoolId, homeworkId: hw.id, kind: "link", name: "NCERT Maths textbook", url: "https://ncert.nic.in/textbook.php" } });
          for (const st of roster) {
            const r = random();
            const handedAt = at(addDays(due, r < 0.5 ? -1 : 0), r < 0.5 ? "19:12" : "07:40");
            let data: Partial<Prisma.SubmissionUncheckedCreateInput> = {};
            const score = () => Math.max(Math.round(w.max * 0.35), Math.round(w.max * (0.55 + random() * 0.45)));
            if (kind === "past") {
              if (r < 0.07) data = { status: "MISSING" };
              else if (r < 0.12) data = { status: "GRADED", checkResult: "INCORRECT", submittedAt: handedAt, score: Math.round(w.max * 0.3), feedback: FEEDBACK[4], gradedAt: at(addDays(due, 2), "13:00"), gradedById: ctx.userId, handIns: 1 };
              else { const sc = score(); data = { status: "GRADED", checkResult: "COMPLETE", submittedAt: handedAt, score: sc, grade: gradeFor(sc, w.max), feedback: random() < 0.4 ? FEEDBACK[Math.floor(random() * 4)] : null, gradedAt: at(addDays(due, 2), "13:00"), gradedById: ctx.userId, handIns: 1 }; }
            } else if (kind === "check") {
              if (r < 0.1) data = { status: "MISSING" };
              else if (r < 0.25) data = { status: "LATE", submittedAt: at(addDays(due, 1), "20:05"), handIns: 1 };
              else if (r < 0.45) { const sc = score(); data = { status: "GRADED", checkResult: "COMPLETE", submittedAt: handedAt, score: sc, grade: gradeFor(sc, w.max), gradedAt: at(addDays(due, 1), "12:00"), gradedById: ctx.userId, handIns: 1 }; }
              else data = { status: "SUBMITTED", submittedAt: handedAt, handIns: 1 };
            } else if (kind === "today") {
              if (r < 0.55) data = { status: "SUBMITTED", submittedAt: at(addDays(today, -1), "18:30"), handIns: 1 };
              else if (r < 0.7) { const sc = score(); data = { status: "GRADED", checkResult: "COMPLETE", submittedAt: at(addDays(today, -1), "17:00"), score: sc, grade: gradeFor(sc, w.max), gradedAt: at(today, "08:20"), gradedById: ctx.userId, handIns: 1 }; }
            } else if (r < 0.2) data = { status: "SUBMITTED", submittedAt: at(today, "07:15"), handIns: 1 };
            // The student login: one of each, so every tab has something.
            if (st.id === me.id) {
              if (kind === "today" || kind === "later") data = {};
              if (kind === "check" && code === "MAT") data = { status: "SUBMITTED", submittedAt: handedAt, handIns: 1, note: "I could not do Q9." };
              if (kind === "past" && code === "HIN") data = { status: "GRADED", checkResult: "COMPLETE", submittedAt: handedAt, score: 13, grade: gradeFor(13, w.max), feedback: "Good ideas. Check the spelling of the matras and write in paragraphs.", resubmitAllowed: true, resubmitUntil: addDays(today, 2), gradedAt: at(addDays(due, 2), "13:00"), gradedById: ctx.userId, handIns: 1 };
            }
            await tx.submission.create({ data: { schoolId: school.schoolId, homeworkId: hw.id, studentId: st.id, ...data } });
          }
          // Parents hear about current homework; most read it on WhatsApp.
          if (kind === "today" || kind === "later" || kind === "check") {
            await tellParentsHomeworkSet(tx, ctx, { homeworkId: hw.id, title: hw.title, subject: plan.subjects.find((s) => s.id === a.subjectId)!.name, sectionLabel: label, dueDate: due, studentIds: roster.map((s) => s.id) });
            const recips = await tx.messageRecipient.findMany({ where: { message: { sourceType: "Homework", sourceId: hw.id } }, select: { id: true } });
            const share = kind === "later" ? 0.55 : 0.8;
            for (const rc of recips) if (random() < share) await tx.messageRecipient.update({ where: { id: rc.id }, data: { status: "READ", readAt: at(start, random() < 0.5 ? "16:40" : "20:15") } });
          }
        });
      }
    }
  }

  // ------------------------------------------------------------ study material, quizzes, boards, online classes
  const raviStaff = plan.staff.find((s) => s.userLoginId === school.users.teacher);
  const mathId = plan.subjects.find((s) => s.code === "MAT")!.id;
  const engAlloc = plan.allocs.find((a) => a.sectionId === fiveA.id && subjectCode.get(a.subjectId) === "ENG");
  const roster5A = plan.students.get(fiveA.id) ?? [];
  if (!raviStaff?.userLoginId || !roster5A.length) return;
  const ravi: SchoolContext = { schoolId: school.schoolId, userId: raviStaff.userLoginId };
  await withSchool(ravi, async (tx) => {
    const base = { schoolId: school.schoolId, academicYearId: yearId, sectionId: fiveA.id, classId: fiveA.classId, subjectId: mathId, teacherId: raviStaff.id };
    // Learning path: 5 visible lessons and one hidden draft.
    const course = await tx.course.create({ data: { ...base, createdById: ravi.userId } });
    const LESSONS = [
      ["Large numbers", "Place value up to crores, reading and writing large numbers, the Indian and international systems.", "https://www.youtube.com/watch?v=9Dq2RmLdEvE"],
      ["Addition and subtraction", "Adding and taking away large numbers with carrying and borrowing. Estimate first, then solve.", "https://ncert.nic.in/textbook.php"],
      ["Multiplication", "Multiplying by 2- and 3-digit numbers. The column method, step by step.", "https://www.youtube.com/watch?v=FJ5qLWP3Fqo"],
      ["Division", "Long division with remainders. Checking with multiplication.", "https://ncert.nic.in/textbook.php"],
      ["Fractions", "Like and unlike fractions, equivalent fractions and fraction strips.", "https://www.youtube.com/watch?v=n0FZhQ_GkKw"],
      ["Decimals (draft)", "Tenths and hundredths. To be shared after the Dasara holidays.", ""],
    ] as const;
    const lessons = [];
    for (const [i, [title, notes, url]] of LESSONS.entries()) {
      const visible = i < 5;
      const l = await tx.lesson.create({ data: { schoolId: school.schoolId, courseId: course.id, title, chapterTitle: title, notes, sortOrder: i + 1, visible, createdById: ravi.userId, createdAt: addDays(today, -40 + i * 7) } });
      if (url) await tx.lessonItem.create({ data: { schoolId: school.schoolId, lessonId: l.id, kind: url.includes("youtube") ? "VIDEO" : "LINK", name: url.includes("youtube") ? `Video: ${title}` : "NCERT textbook chapter", url, sortOrder: 1 } });
      lessons.push({ id: l.id, visible });
    }
    for (const [k, st] of roster5A.entries()) {
      // Most opened the first lessons; five students finished the whole path.
      const reach = k < 5 ? 5 : Math.max(0, 5 - Math.floor(k / 6));
      for (const [i, l] of lessons.entries()) {
        if (!l.visible || i >= reach + 1) continue;
        const done = i < reach;
        if (st.id === me.id && i > 2) continue;
        await tx.lessonView.create({ data: { schoolId: school.schoolId, lessonId: l.id, studentId: st.id, firstOpenedAt: addDays(today, -35 + i * 7), doneAt: done ? addDays(today, -34 + i * 7) : null } });
      }
    }

    // Quizzes: open until 6 PM today, closed last week, a draft.
    const QS = [
      { kind: "CHOICE", text: "Which fraction is equal to 1/2?", options: ["2/3", "3/6", "1/3", "4/6"], correctIndex: 1, marks: 1 },
      { kind: "CHOICE", text: "What is 3/4 of 20?", options: ["12", "15", "16", "5"], correctIndex: 1, marks: 1 },
      { kind: "TRUE_FALSE", text: "5/8 is greater than 3/8.", options: ["True", "False"], correctIndex: 0, marks: 1 },
      { kind: "CHOICE", text: "Which is the smallest: 1/2, 1/3, 1/4, 1/5?", options: ["1/2", "1/3", "1/4", "1/5"], correctIndex: 3, marks: 1 },
      { kind: "CHOICE", text: "2/5 + 1/5 = ?", options: ["3/10", "3/5", "2/25", "1/5"], correctIndex: 1, marks: 1 },
    ] as const;
    const makeQuiz = async (title: string, status: "OPEN" | "CLOSED" | "DRAFT", opensAt: Date | null, closesAt: Date | null, takers: number, hard: number) => {
      const q = await tx.quiz.create({ data: { ...base, title, status, opensAt, closesAt, timeLimitMin: 15, createdById: ravi.userId, closedAt: status === "CLOSED" ? closesAt : null, createdAt: opensAt ?? today } });
      const questions = [];
      for (const [i, x] of QS.entries()) questions.push(await tx.quizQuestion.create({ data: { schoolId: school.schoolId, quizId: q.id, sortOrder: i + 1, kind: x.kind, text: x.text, options: [...x.options], correctIndex: x.correctIndex, marks: x.marks } }));
      if (status === "DRAFT") return;
      for (const [k, st] of roster5A.entries()) {
        if (k / roster5A.length >= takers || (st.id === me.id && status === "OPEN")) continue;
        const answers: Record<string, number> = {};
        for (const [i, qq] of questions.entries()) answers[qq.id] = random() < (i === 3 ? hard : 0.82) ? qq.correctIndex! : (qq.correctIndex! + 1) % qq.options.length;
        const m = markAttempt(questions, answers);
        const startedAt = new Date((opensAt ?? today).getTime() + (1 + k) * 600_000);
        await tx.quizAttempt.create({ data: { schoolId: school.schoolId, quizId: q.id, studentId: st.id, startedAt, submittedAt: new Date(startedAt.getTime() + 9 * 60_000), answers, score: m.score, maxScore: m.max } });
      }
    };
    await makeQuiz("Fractions · quick check", "OPEN", at(addDays(today, -1), "16:00"), at(today, "18:00"), 0.6, 0.35);
    await makeQuiz("Multiplication · chapter test", "CLOSED", at(addDays(today, -9), "09:00"), at(addDays(today, -7), "18:00"), 1, 0.5);
    await makeQuiz("Division practice", "DRAFT", null, null, 0, 0);

    // A class board for 5 A Maths with a pinned topic, a question with replies, and a hidden post.
    const board = await tx.discussionBoard.create({ data: { schoolId: school.schoolId, academicYearId: yearId, title: "5 A Mathematics", sectionId: fiveA.id, subjectId: mathId, description: "Ask about the lessons and homework. Be kind; no answers to tests.", ownerId: ravi.userId, ownerName: raviStaff.fullName } });
    const post = (data: { topicId?: string; title?: string; body: string; author: string; authorId: string | null; staff: boolean; pinned?: boolean; hidden?: string; when: Date }) =>
      tx.discussionPost.create({ data: { schoolId: school.schoolId, boardId: board.id, topicId: data.topicId ?? null, title: data.title ?? null, body: data.body, authorId: data.authorId, authorName: data.author, authorIsStaff: data.staff, pinned: !!data.pinned, hiddenAt: data.hidden ? data.when : null, hiddenReason: data.hidden ?? null, hiddenById: data.hidden ? ravi.userId : null, createdAt: data.when } });
    await post({ title: "How to ask a good question here", body: "Write the exercise and question number, what you tried, and where you got stuck. A photo of your working helps.", author: raviStaff.fullName, authorId: ravi.userId, staff: true, pinned: true, when: addDays(today, -30) });
    const t1 = await post({ title: "Exercise 4.2 Q7: how do I start?", body: "I do not understand how to make the denominators the same in Q7.", author: me.name, authorId: studentUser, staff: false, when: at(addDays(today, -1), "18:40") });
    await post({ topicId: t1.id, body: "Find the smallest number both 4 and 6 go into. That is 12. Then change both fractions to twelfths.", author: raviStaff.fullName, authorId: ravi.userId, staff: true, when: at(addDays(today, -1), "19:30") });
    await post({ topicId: t1.id, body: "Thank you sir, I got 11/12.", author: me.name, authorId: studentUser, staff: false, when: at(addDays(today, -1), "20:05") });
    const t2 = await post({ title: "Is the chapter test on Monday?", body: "Will the test have word problems too?", author: roster5A[6]?.name ?? "A student", authorId: null, staff: false, when: at(addDays(today, -3), "17:10") });
    await post({ topicId: t2.id, body: "All answers of the test are here …", author: roster5A[8]?.name ?? "A student", authorId: null, staff: false, hidden: "Answers to a test", when: at(addDays(today, -3), "21:00") });

    // Online classes: one done with attendance and a recording, one cancelled, two coming up.
    const session = (title: string, start: Date, data: Partial<Prisma.OnlineClassSessionUncheckedCreateInput> = {}) =>
      tx.onlineClassSession.create({ data: { ...base, title, startsAt: start, lengthMin: 40, meetingLink: "https://meet.google.com/sps-math-5a", createdById: ravi.userId, ...data } });
    const done = await session("Fractions doubt-clearing", at(addDays(today, -2), "17:00"), { recordingLinks: ["https://drive.google.com/file/d/sps-fractions-recording"], materials: [{ name: "Fraction strips worksheet", url: "https://ncert.nic.in/textbook.php" }] });
    for (const [k, st] of roster5A.entries()) await tx.onlineClassAttendance.create({ data: { schoolId: school.schoolId, sessionId: done.id, studentId: st.id, joined: k % 5 !== 2, minutes: k % 5 !== 2 ? 32 + (k % 8) : null, markedById: ravi.userId } });
    await session("Multiplication revision", at(addDays(today, 1), "17:00"), { status: "CANCELLED", cancelNote: "Moved to after the holidays: staff meeting that evening." });
    await session("Maths doubt-clearing", at(addDays(today, 3), "17:00"), { reminderUserIds: studentUser ? [studentUser] : [] });
    if (engAlloc) {
      const eng = staffOf.get(engAlloc.staffId);
      await tx.onlineClassSession.create({ data: { ...base, subjectId: engAlloc.subjectId, teacherId: engAlloc.staffId, title: "Reading circle · chapter 6", startsAt: at(addDays(today, 2), "16:00"), lengthMin: 30, meetingLink: "https://meet.google.com/sps-eng-5a", createdById: eng?.userLoginId ?? ravi.userId } });
    }
  });

  // A school-wide board for science questions, run by the Science teacher.
  const sciUser = school.users.subjectteacher;
  if (sciUser) {
    await withSchool({ schoolId: school.schoolId, userId: sciUser }, async (tx) => {
      const sci = await tx.staff.findFirst({ where: { userLoginId: sciUser }, select: { fullName: true } });
      const b = await tx.discussionBoard.create({ data: { schoolId: school.schoolId, academicYearId: yearId, title: "Science doubts", description: "Questions about experiments and the science around us, for every class.", ownerId: sciUser, ownerName: sci?.fullName ?? "Science teacher" } });
      const t = await tx.discussionPost.create({ data: { schoolId: school.schoolId, boardId: b.id, title: "Why does a spoon look bent in water?", body: "We saw it in class. Why does it happen?", authorName: roster5A[2]?.name ?? "A student", createdAt: at(addDays(today, -4), "18:00") } });
      await tx.discussionPost.create({ data: { schoolId: school.schoolId, boardId: b.id, topicId: t.id, body: "Light bends when it goes from water into air. This is called refraction. We will try it with a glass of water next week.", authorId: sciUser, authorName: sci?.fullName ?? "Science teacher", authorIsStaff: true, createdAt: at(addDays(today, -4), "19:10") } });
    });
  }
}
