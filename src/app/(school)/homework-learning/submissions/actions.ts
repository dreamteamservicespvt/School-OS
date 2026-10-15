"use server";

import { str, strs } from "@/lib/fees/act";
import { HomeworkProblem } from "@/lib/homework/access";
import { acceptLate, addComment, bulkComplete, gradeSubmission, hideComment, setExcused } from "@/lib/homework/submissions";
import { remindParents } from "@/lib/homework/notify-parents";
import { draftFeedback } from "@/lib/homework/assistant";
import { assistantOn, homeworkFeatures, homeworkSettings, lateAfter } from "@/lib/homework/settings";
import { plural } from "@/lib/homework/words";
import { hwAsk, hwForm, hwQuick } from "../_lib/action";
import { UUID } from "../_lib/page";

const uuid = (fd: FormData, key: string, what: string) => {
  const v = str(fd, key);
  if (!UUID.test(v)) throw new HomeworkProblem(`Choose the ${what}.`, key);
  return v;
};

const idsOf = (fd: FormData) => strs(fd, "ids").flatMap((x) => x.split(",")).filter((x) => UUID.test(x));

/** Mark one student's work (GradeSheet): Complete or Incorrect, a score out of the homework's maximum, feedback. */
export async function gradeAction(_prev: unknown, fd: FormData) {
  return hwForm("edit", fd, async ({ tx, s, today }) => {
    const until = str(fd, "resubmitUntil");
    const r = await gradeSubmission(tx, s, uuid(fd, "id", "submission"), {
      result: str(fd, "result") === "INCORRECT" ? "INCORRECT" : "COMPLETE", score: str(fd, "score"), grade: str(fd, "grade"), feedback: str(fd, "feedback"),
      allowResubmit: str(fd, "resubmit") === "on", resubmitUntil: /^\d{4}-\d{2}-\d{2}$/.test(until) ? new Date(`${until}T00:00:00Z`) : null, fromSuggestion: str(fd, "fromSuggestion") === "1",
    }, today);
    const st = await tx.student.findUnique({ where: { id: r.studentId }, select: { fullName: true } });
    const hw = await tx.homework.findUnique({ where: { id: r.homeworkId }, select: { maxMarks: true } });
    return { name: st?.fullName ?? "", score: r.score, max: hw?.maxMarks ?? 0, result: r.checkResult };
  }, (r) => `Saved for ${r.name}: ${r.score !== null ? `${r.score} of ${r.max} · ` : ""}${r.result === "INCORRECT" ? "Incorrect" : "Complete"}. The student sees it now.`);
}

/** Mark the ticked students Complete (work checked in class), with Undo. */
export async function bulkCompleteAction(_prev: unknown, fd: FormData) {
  return hwForm("edit", fd, async ({ tx, s }) => bulkComplete(tx, s, uuid(fd, "hw", "homework"), idsOf(fd)),
    (r) => ({ message: `${plural(r.count, "student")} marked Complete${r.skipped ? ` · ${r.skipped} skipped: already checked` : ""}.`, undo: { kind: "homework-bulk-complete", id: r.undoId } }));
}

/** Remind the parents of ticked students who have not handed in. */
export async function remindParentsAction(_prev: unknown, fd: FormData) {
  return hwForm("edit", fd, async ({ tx, s }) => remindParents(tx, s, uuid(fd, "hw", "homework"), idsOf(fd)),
    (r) => `Reminder sent to the parents of ${plural(r.students, "student")}. Sent once per homework.`);
}

export async function commentAction(_prev: unknown, fd: FormData) {
  return hwForm("edit", fd, async ({ tx, s }) => addComment(tx, s, uuid(fd, "id", "submission"), str(fd, "body")), () => "Reply sent. The student sees it with their homework.");
}

export async function hideCommentAction(fd: FormData) {
  return hwQuick("edit", async ({ tx, s }) => {
    const id = str(fd, "commentId");
    if (!UUID.test(id)) throw new HomeworkProblem("Choose the comment.");
    await hideComment(tx, s, id, str(fd, "reason") || "Not about the homework", str(fd, "hide") !== "0");
  }, () => "Comment hidden. It is kept with the reason.");
}

export async function excuseAction(fd: FormData) {
  return hwQuick("edit", async ({ tx, s }) => setExcused(tx, s, uuid(fd, "id", "submission"), str(fd, "excused") !== "0"),
    () => "Saved. Excused work is not counted as missing.");
}

export async function acceptLateAction(fd: FormData) {
  return hwQuick("edit", async ({ tx, s }) => acceptLate(tx, s, uuid(fd, "id", "submission")), () => "Accepted as on time.");
}

/** The teacher assistant's feedback draft for one student's work (only when the school has it on). */
export async function draftFeedbackAction(submissionId: string, result: string, score: string): Promise<{ text?: string; source?: string; problem?: string }> {
  const r = await hwAsk("edit", async ({ tx, s, current }) => {
    if (!UUID.test(submissionId)) throw new HomeworkProblem("Choose the student's work.");
    const sub = await tx.submission.findFirst({ where: { id: submissionId, archivedAt: null } });
    const hw = sub ? await tx.homework.findFirst({ where: { id: sub.homeworkId } }) : null;
    if (!sub || !hw) throw new HomeworkProblem("This work was not found.");
    if (s.modes.submissions !== "edit") throw new HomeworkProblem("Your role reads this page but does not change it.");
    const st = await tx.student.findUnique({ where: { id: sub.studentId }, select: { fullName: true } });
    const settings = await homeworkSettings(tx, current.ctx);
    const late = sub.status === "LATE" || (!!sub.submittedAt && sub.submittedAt > lateAfter(hw.dueDate, current.school.timeZone, settings.graceMinutes));
    const n = /^\d+$/.test(score.trim()) ? Number(score) : null;
    return draftFeedback({ firstName: (st?.fullName ?? "").split(" ")[0], score: n, max: hw.maxMarks, result: result === "INCORRECT" ? "INCORRECT" : "COMPLETE", late, note: sub.note }, assistantOn(await homeworkFeatures(tx, current.ctx)));
  });
  return r.ok ? { text: r.data.instructions, source: r.data.source } : { problem: r.problem };
}
