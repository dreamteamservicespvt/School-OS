// Publishing a datesheet tells parents only about papers still to come
// (browser finding TEACHING-13): a datesheet whose papers are all over sends
// no "starts on" message, and one with some papers held already names the
// next paper's day, never a day in the past. Real Communication sending.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool, type Tx } from "@/lib/db";
import { addDays, todayIn } from "@/lib/academic/common";
import { formatDate } from "@/lib/format";
import { createDatesheet, publishDatesheet, upcomingPapers } from "@/lib/exams/datesheet";
import { examSettings } from "@/lib/exams/settings";
import { makeCommSchool } from "../communication/fixture";

let s: Awaited<ReturnType<typeof makeCommSchool>>;
let typeId = "";
let termId = "";
const subjects: Record<string, string> = {};
const run = <T>(fn: (tx: Tx) => Promise<T>) => withSchool(s.ctx, fn, { timeout: 60_000 });
const today = todayIn("Asia/Kolkata");
/** A school day (not a Sunday) `n` days from today. */
const weekday = (n: number) => { let x = addDays(today, n); if (x.getUTCDay() === 0) x = addDays(x, n < 0 ? -1 : 1); return x; };

async function datesheet(title: string, papers: [string, Date][], startTime = "09:30") {
  const dates = papers.map((p) => p[1]).sort((a, b) => a.getTime() - b.getTime());
  const r = await run((tx) => createDatesheet(tx, s.ctx, s.year.id, { title, examTypeId: typeId, pattern: "PERCENTAGE", termId, startDate: dates[0], endDate: dates[dates.length - 1], classIds: [s.cls.id], gradeScaleId: null },
    papers.map(([code, date]) => ({ classId: s.cls.id, subjectId: subjects[code], date, startTime, durationMin: 60, room: null, invigilatorId: null, maxMarks: 50, pattern: null }))));
  return r.exam.id;
}
const sentFor = (examId: string) => run((tx) => tx.messageRecipient.findMany({ where: { message: { sourceType: "Exam", sourceId: examId } }, select: { text: true, studentId: true } }));

beforeAll(async () => {
  s = await makeCommSchool();
  await run(async (tx) => {
    for (const [code, name] of [["MAT", "Mathematics"], ["ENG", "English"]]) {
      const sub = await tx.subject.create({ data: { schoolId: s.school.id, code, name } });
      subjects[code] = sub.id;
      await tx.subjectClass.create({ data: { schoolId: s.school.id, subjectId: sub.id, classId: s.cls.id, periodsPerWeek: 5 } });
    }
    termId = (await tx.term.create({ data: { schoolId: s.school.id, academicYearId: s.year.id, name: "Term 1", startDate: s.year.startDate, endDate: s.year.endDate, sortOrder: 1 } })).id;
    await examSettings(tx, s.ctx);
    typeId = (await tx.examType.findFirstOrThrow({ where: { name: "Unit Test 1" } })).id;
  });
}, 120_000);

describe("publishing a datesheet with \"Message parents now\" on", () => {
  it("sends nothing when every paper is already over", async () => {
    const id = await datesheet("Class Test held", [["MAT", weekday(-2)]]);
    const r = await run((tx) => publishDatesheet(tx, s.ctx, id, { tellParents: true }));
    expect(r).toMatchObject({ parents: 0, past: 1, upcoming: 0 });
    expect(await sentFor(id)).toHaveLength(0);
    const audit = await run((tx) => tx.auditLogEntry.findFirstOrThrow({ where: { recordType: "Exam", recordId: id, action: "published" } }));
    expect(audit.after).toMatchObject({ parentsMessaged: 0, papersAlreadyHeld: 1 });
  });

  it("with some papers held already, tells parents the day of the next paper, never a past one", async () => {
    const past = weekday(-3);
    const next = weekday(5);
    const id = await datesheet("Unit Test running", [["MAT", past], ["ENG", next]], "13:00");
    const r = await run((tx) => publishDatesheet(tx, s.ctx, id, { tellParents: true }));
    expect(r).toMatchObject({ past: 1, upcoming: 1 });
    expect(r.parents).toBeGreaterThan(0);
    const sent = await sentFor(id);
    expect(sent.length).toBeGreaterThan(0);
    for (const m of sent) {
      expect(m.text).toContain(`starts on ${formatDate(next, "UTC")}`);
      expect(m.text).not.toContain(formatDate(past, "UTC"));
    }
  });

  it("the publish dialog's count of papers already held matches", () => {
    const a = upcomingPapers([{ classId: "x", date: weekday(-3) }, { classId: "x", date: today }, { classId: "y", date: weekday(4) }], today);
    expect(a.past).toBe(1);
    expect(a.upcoming).toBe(2);
    // A paper today is still to come; each class's first one counts.
    expect(a.firstByClass.get("x")!.getTime()).toBe(today.getTime());
    expect(a.next!.getTime()).toBe(today.getTime());
  });
});
