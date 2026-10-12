"use server";

// Question Papers (08 §2, optional). Teachers work only on the subjects they
// teach; the library checks that again for every change.
import { ExamRuleError } from "@/lib/exams/common";
import { archiveQuestion, makePaper, saveQuestion, setPaperStatus } from "@/lib/exams/questions";
import { actSimple, str } from "../_lib/server";

const UUID = /^[0-9a-f-]{36}$/i;

function needFeature(features: Set<string>) {
  if (!features.has("exam-question-papers")) throw new ExamRuleError("Question Papers is switched off for this school. Exam Settings can switch it on.");
}
function pair(fd: FormData) {
  const [classId, subjectId] = str(fd, "pair").split("|");
  if (!UUID.test(classId ?? "") || !UUID.test(subjectId ?? "")) throw new ExamRuleError("Choose the class and subject.", "pair");
  return { classId, subjectId };
}

export async function saveQuestionForm(fd: FormData) {
  return actSimple("edit", async ({ tx, current, scope, yearId }) => {
    needFeature(current.features);
    if (!yearId) throw new ExamRuleError("There is no academic year yet.");
    const { classId, subjectId } = pair(fd);
    const id = str(fd, "id");
    const chapterId = str(fd, "chapterId");
    await saveQuestion(tx, current.ctx, scope, yearId, {
      id: UUID.test(id) ? id : null, classId, subjectId, chapterId: UUID.test(chapterId) ? chapterId : null, type: str(fd, "type"), text: str(fd, "text"),
      options: str(fd, "options").split("\n"), answer: str(fd, "answer") || null, marks: Number(str(fd, "marks")), difficulty: str(fd, "difficulty"),
      tags: str(fd, "tags").split(","),
    });
    return { flash: { message: id ? "Question saved." : "Question added to the bank." } };
  }, { needs: "any" });
}

export async function archiveQuestionAction(id: string) {
  return actSimple("archive", async ({ tx, current, scope, yearId }) => {
    if (!UUID.test(id) || !yearId) throw new ExamRuleError("Reload the page and try again.");
    await archiveQuestion(tx, current.ctx, scope, yearId, id);
    return { flash: { message: "Question archived. Papers that use it keep it." } };
  }, { needs: "any" });
}

export async function makePaperForm(fd: FormData) {
  return actSimple("edit", async ({ tx, current, scope, yearId }) => {
    needFeature(current.features);
    if (!yearId) throw new ExamRuleError("There is no academic year yet.");
    const { classId, subjectId } = pair(fd);
    const method = str(fd, "method") === "manual" ? "manual" : "automatic";
    const examId = str(fd, "examId");
    const duration = str(fd, "durationMin");
    const paper = await makePaper(tx, current.ctx, scope, yearId, {
      title: str(fd, "title"), examId: UUID.test(examId) ? examId : null, classId, subjectId, method,
      questionIds: fd.getAll("questionIds").map(String).filter((x) => UUID.test(x)),
      total: Number(str(fd, "total")), mix: { easy: Number(str(fd, "easy")), medium: Number(str(fd, "medium")), hard: Number(str(fd, "hard")) },
      durationMin: duration ? Number(duration) : null, instructions: str(fd, "instructions") || null,
    });
    return { flash: { message: `${paper.title} saved as a draft with ${paper.questionIds.length} questions, ${paper.totalMarks} marks.` } };
  }, { needs: "any" });
}

export async function paperStatusAction(id: string, to: "draft" | "final" | "archived") {
  return actSimple(to === "archived" ? "archive" : "edit", async ({ tx, current, scope, yearId }) => {
    if (!UUID.test(id) || !yearId || !["draft", "final", "archived"].includes(to)) throw new ExamRuleError("Reload the page and try again.");
    await setPaperStatus(tx, current.ctx, scope, yearId, id, to);
    return { flash: { message: to === "final" ? "Paper marked final. It can no longer be changed." : to === "draft" ? "Paper is a draft again." : "Paper archived." } };
  }, { needs: "any" });
}
