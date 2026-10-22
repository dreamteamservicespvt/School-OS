// Homework & Learning "Done when" 7, 9 and 10 (17-homework-learning.md §9),
// against the real database and the real Communication sending:
// 7. With the pending-homework rule on, parents of students with missing
//    work get one message (and none while the rule is off).
// 9. The teacher assistant drafts only when AI is switched on, and every
//    draft is shown under the "Suggestion" label.
// 10. After a homework message to 40 parents, the homework shows "Seen by 31
//    of 40" with each parent's date and time, and Resend reaches only the 9
//    who have not seen it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool, type Tx } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { todayIn } from "@/lib/academic/common";
import { homeworkScope } from "@/lib/homework/scope";
import { listHomework, seenFor } from "@/lib/homework/homework";
import { markMissing } from "@/lib/homework/submissions";
import { resendToUnseen, tellParentsHomeworkSet, unseenStudents } from "@/lib/homework/notify-parents";
import { draftFeedback, draftHomework } from "@/lib/homework/assistant";
import { assistantOn } from "@/lib/homework/settings";
import { HomeworkProblem } from "@/lib/homework/access";
import { makeCommSchool } from "../communication/fixture";

const TZ = "Asia/Kolkata";
const today = todayIn(TZ);
const day = (n: number) => new Date(today.getTime() + n * 86_400_000);

let s: Awaited<ReturnType<typeof makeCommSchool>>;
let subjectId = "";
const sys = () => ({ schoolId: s.school.id, userId: null });
const run = <T>(fn: (tx: Tx) => Promise<T>) => withSchool(s.ctx, fn, { timeout: 60_000 });

async function teacherScope(tx: Tx) {
  const view = await accessIn(s.teacher.id, s.school.id);
  const ctx = { schoolId: s.school.id, userId: s.teacher.id };
  return homeworkScope(tx, { ...view!, ctx, user: { displayName: "Teacher Person" } }, today);
}

async function homework(title: string, dueDate: Date, students: string[], status: (i: number) => "ASSIGNED" | "SUBMITTED" = () => "ASSIGNED") {
  return run(async (tx) => {
    const hw = await tx.homework.create({ data: { schoolId: s.school.id, academicYearId: s.year.id, sectionId: s.a.id, classId: s.cls.id, subjectId, teacherId: s.teacherStaff.id, title, startDate: day(-7), dueDate } });
    await tx.submission.createMany({ data: students.map((studentId, i) => ({ schoolId: s.school.id, homeworkId: hw.id, studentId, status: status(i), submittedAt: status(i) === "SUBMITTED" ? day(-2) : null })) });
    return hw;
  });
}

const rule = (key: string, isOn: boolean, channels = ["whatsapp"]) => run((tx) => tx.automaticMessageRule.upsert({
  where: { schoolId_key: { schoolId: s.school.id, key } },
  create: { schoolId: s.school.id, key, isOn, channels },
  update: { isOn, channels },
}));

const recipientsOf = (homeworkId: string) => run((tx) => tx.messageRecipient.findMany({ where: { message: { sourceType: "Homework", sourceId: homeworkId } }, select: { guardianId: true, studentId: true, messageId: true, readAt: true } }));

beforeAll(async () => {
  s = await makeCommSchool();
  subjectId = (await run((tx) => tx.subject.create({ data: { schoolId: s.school.id, name: "Mathematics", code: "MAT" } }))).id;
}, 120_000);

describe("Done when 7: the pending-homework rule", () => {
  it("sends nothing while the rule is off, but still marks the work Missing", async () => {
    await rule("homework-pending", false);
    const hw = await homework("Fractions, off", day(-1), [s.ravi.id, s.priya.id]);
    await run((tx) => markMissing(tx, sys(), today));
    expect(await recipientsOf(hw.id)).toHaveLength(0);
    const subs = await run((tx) => tx.submission.findMany({ where: { homeworkId: hw.id } }));
    expect(subs.every((x) => x.status === "MISSING")).toBe(true);
  });

  it("with the rule on, sends one message to the parents of students with missing work, and never again", async () => {
    await rule("homework-pending", true);
    // Ravi and Anil have not handed in (Anil's father opted out of messages); Priya handed in.
    const hw = await homework("Fractions, on", day(-1), [s.ravi.id, s.priya.id, s.anil.id], (i) => (i === 1 ? "SUBMITTED" : "ASSIGNED"));
    await run((tx) => markMissing(tx, sys(), today));
    const first = await recipientsOf(hw.id);
    expect(first.map((r) => r.guardianId)).toEqual([s.father.id]);
    expect(first.map((r) => r.studentId)).toEqual([s.ravi.id]);
    expect(new Set(first.map((r) => r.messageId)).size).toBe(1);
    // The daily job runs again, and the rule is asked again for the same homework: still one message.
    await run((tx) => markMissing(tx, sys(), day(1)));
    await run((tx) => tx.homework.update({ where: { id: hw.id }, data: { missingMarkedAt: null } }));
    await run((tx) => markMissing(tx, sys(), day(1)));
    expect(await recipientsOf(hw.id)).toHaveLength(1);
    const log = await run((tx) => tx.automationLog.findMany({ where: { ruleKey: "homework-pending", eventKey: `homework-pending:${hw.id}` } }));
    expect(log.filter((l) => l.outcome === "sent")).toHaveLength(1);
    expect(log.some((l) => l.outcome === "opted-out")).toBe(true);
  });
});

describe("Done when 9: the teacher assistant", () => {
  it("drafts nothing unless the AI assistant and the teacher assistant are both on", async () => {
    expect(assistantOn(new Set())).toBe(false);
    expect(assistantOn(new Set(["ai-assistant"]))).toBe(false);
    expect(assistantOn(new Set(["ai-teacher-assistant"]))).toBe(false);
    expect(assistantOn(new Set(["ai-assistant", "ai-teacher-assistant"]))).toBe(true);
    await expect(run(async (tx) => draftHomework(tx, await teacherScope(tx), s.a.id, subjectId, today, false))).rejects.toBeInstanceOf(HomeworkProblem);
    expect(() => draftFeedback({ firstName: "Ravi", score: 9, max: 10, result: "COMPLETE", late: false, note: null }, false)).toThrow(/switched off/);
  });

  it("when on, gives a draft with what it was based on, which the screens show as a Suggestion", async () => {
    const d = draftFeedback({ firstName: "Ravi", score: 9, max: 10, result: "COMPLETE", late: true, note: null }, true);
    expect(d.instructions).toMatch(/^Ravi, excellent work/);
    expect(d.instructions).toMatch(/due date next time/);
    expect(d.source).toMatch(/9 of 10/);
    // Both places a draft appears label it "Suggestion", and only offer it when AI is on.
    const root = join(process.cwd(), "src/app/(school)/homework-learning");
    for (const [file, heading] of [["sheets.tsx", "Draft homework"], ["submissions/sheets.tsx", "Feedback draft"]]) {
      const src = readFileSync(join(root, file), "utf8");
      const at = src.indexOf(heading);
      expect(at, file).toBeGreaterThan(0);
      // The label may be translated (gap list G39): plain text or the Words wrapper.
      expect(src.slice(at, at + 200), file).toMatch(/>Suggestion<|<Words k="Suggestion"/);
    }
    expect(readFileSync(join(root, "submissions/sheets.tsx"), "utf8")).toMatch(/\{ai && \(!draft/);
  });
});

describe("Done when 10: Seen by parent and Resend", () => {
  let hwId = "";
  const forty: string[] = [];

  beforeAll(async () => {
    // Saved the way "Homework set" used to default (the app, which parents do not have): it falls back to WhatsApp.
    await rule("homework-set", true, ["app"]);
    await run(async (tx) => {
      for (let i = 0; i < 40; i++) {
        const st = await tx.student.create({ data: { schoolId: s.school.id, campusId: s.school.campus.id, admissionNo: `SB-${i}-${randomUUID().slice(0, 4)}`, firstName: `Child${i}`, fullName: `Child${i} Seen` } });
        await tx.enrolment.create({ data: { schoolId: s.school.id, studentId: st.id, academicYearId: s.year.id, classId: s.cls.id, sectionId: s.a.id } });
        const g = await tx.guardian.create({ data: { schoolId: s.school.id, name: `Parent ${i}`, relationship: "Mother", phone: String(8100000000 + Math.floor(Math.random() * 89999999)) } });
        await tx.studentGuardian.create({ data: { schoolId: s.school.id, studentId: st.id, guardianId: g.id, relationship: "Mother", isPrimary: true } });
        forty.push(st.id);
      }
    });
    const hw = await homework("Chapter 4 questions", day(2), forty);
    hwId = hw.id;
    const status = await run((tx) => tellParentsHomeworkSet(tx, s.ctx, { homeworkId: hw.id, title: hw.title, subject: "Mathematics", sectionLabel: "5 A", dueDate: hw.dueDate, studentIds: forty }));
    expect(status).toBe("sent");
    // 31 parents open it on WhatsApp.
    const rows = await recipientsOf(hwId);
    expect(rows).toHaveLength(40);
    const readers = forty.slice(0, 31);
    await run((tx) => tx.messageRecipient.updateMany({ where: { message: { sourceType: "Homework", sourceId: hwId }, studentId: { in: readers } }, data: { readAt: new Date("2026-10-15T09:30:00Z") } }));
  }, 120_000);

  it("shows Seen by 31 of 40, with each parent's date and time", async () => {
    const seen = (await run((tx) => seenFor(tx, [hwId]))).get(hwId)!;
    expect(seen.size).toBe(31);
    for (const id of forty.slice(0, 31)) {
      expect(seen.get(id)?.at.toISOString()).toBe("2026-10-15T09:30:00.000Z");
      expect(seen.get(id)?.via).toBe("WhatsApp");
    }
    const row = (await run(async (tx) => listHomework(tx, await teacherScope(tx), today))).rows.find((r) => r.id === hwId)!;
    expect(`Seen by ${row.seen} of ${row.counts.assigned}`).toBe("Seen by 31 of 40");
  });

  it("Resend reaches only the 9 parents who have not seen it, and is audited", async () => {
    const unseen = await run((tx) => unseenStudents(tx, hwId));
    expect(unseen.sort()).toEqual(forty.slice(31).sort());
    const r = await run(async (tx) => resendToUnseen(tx, await teacherScope(tx), hwId));
    expect(r.students).toBe(9);
    const resent = (await recipientsOf(hwId)).filter((x) => x.messageId === r.messageId);
    expect(resent).toHaveLength(9);
    expect(resent.map((x) => x.studentId).sort()).toEqual(forty.slice(31).sort());
    expect(await run((tx) => tx.auditLogEntry.count({ where: { recordType: "Homework", recordId: hwId, action: "resent" } }))).toBe(1);
  });
});
