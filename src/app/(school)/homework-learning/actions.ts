"use server";

import { file as oneFile, optionalText, str, strs } from "@/lib/fees/act";
import { HomeworkProblem } from "@/lib/homework/access";
import { archiveHomework, editHomework, giveHomework, givenWords, type NewAttachment } from "@/lib/homework/homework";
import { resendToUnseen } from "@/lib/homework/notify-parents";
import { remindTeacher } from "@/lib/homework/overview";
import { submitWork } from "@/lib/homework/submissions";
import { draftHomework, type Draft } from "@/lib/homework/assistant";
import { assistantOn, homeworkFeatures } from "@/lib/homework/settings";
import { plural } from "@/lib/homework/words";
import { hwAsk, hwForm, hwQuick } from "./_lib/action";
import { UUID } from "./_lib/page";

const day = (fd: FormData, key: string, label: string) => {
  const v = str(fd, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HomeworkProblem(`Choose the ${label.toLowerCase()}.`, key);
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new HomeworkProblem(`${label} is not a real date.`, key);
  return d;
};
const uuid = (fd: FormData, key: string, what: string) => {
  const v = str(fd, key);
  if (!UUID.test(v)) throw new HomeworkProblem(`Choose the ${what}.`, key);
  return v;
};
const files = (fd: FormData, key: string) => fd.getAll(key).filter((v): v is File => v instanceof File && v.size > 0);

/** Photos, files and links attached in the Give homework and Edit sheets. */
function attachments(fd: FormData): NewAttachment[] {
  const list: NewAttachment[] = [];
  for (const f of files(fd, "photos")) list.push({ kind: "photo", file: f });
  for (const f of files(fd, "files")) list.push({ kind: /^image\//.test(f.type) ? "photo" : "file", file: f });
  for (const url of strs(fd, "links")) list.push({ kind: "link", url });
  return list;
}

const marks = (fd: FormData) => {
  const v = str(fd, "maxMarks");
  const n = Number(v);
  if (!/^\d{1,3}$/.test(v) || n < 1 || n > 100) throw new HomeworkProblem("Maximum marks must be from 1 to 100.", "maxMarks");
  return n;
};

/** Give homework (17 §2): class, what to do, due. Students and parents hear at once. */
export async function giveHomeworkAction(_prev: unknown, fd: FormData) {
  return hwForm("create", fd, async ({ tx, s, today }) => {
    const givenTo = (["SECTION", "CLASS", "STUDENTS"].includes(str(fd, "givenTo")) ? str(fd, "givenTo") : "SECTION") as "SECTION" | "CLASS" | "STUDENTS";
    // The screen refuses a past due date; refuse it here too (QA ACADEMICS-20).
    const dueDate = day(fd, "dueDate", "Due date");
    if (dueDate.getTime() < today.getTime()) throw new HomeworkProblem("The due date is in the past. Choose today or a later day.", "dueDate");
    const r = await giveHomework(tx, s, {
      sectionId: uuid(fd, "sectionId", "class"), subjectId: uuid(fd, "subjectId", "subject"),
      title: str(fd, "title"), instructions: optionalText(fd, "instructions", "Instructions", 4000),
      givenTo, studentIds: strs(fd, "studentIds").filter((x) => UUID.test(x)),
      startDate: day(fd, "startDate", "Start date"), dueDate,
      maxMarks: marks(fd), onlineSubmission: str(fd, "online") === "on", fromSuggestion: str(fd, "fromSuggestion") === "1",
      attachments: attachments(fd),
    }, today);
    const students = r.made.reduce((a, m) => a + m.students, 0);
    return { ...r, students, first: r.made[0] };
  }, (r) => ({
    message: givenWords(r.made),
    link: { href: `/homework-learning/homework/${r.first.id}`, label: "Open" },
  }));
}

export async function editHomeworkAction(_prev: unknown, fd: FormData) {
  return hwForm("edit", fd, async ({ tx, s }) => editHomework(tx, s, uuid(fd, "id", "homework"), {
    title: str(fd, "title"), instructions: optionalText(fd, "instructions", "Instructions", 4000),
    startDate: day(fd, "startDate", "Start date"), dueDate: day(fd, "dueDate", "Due date"), maxMarks: marks(fd),
    onlineSubmission: str(fd, "online") === "on", attachments: attachments(fd), removeAttachmentIds: strs(fd, "remove").filter((x) => UUID.test(x)),
  }), (r) => `Saved: ${r.title}. Students and parents see the change. It is in the audit log.`);
}

export async function archiveHomeworkAction(_prev: unknown, fd: FormData) {
  return hwForm("archive", fd, async ({ tx, s }) => archiveHomework(tx, s, uuid(fd, "id", "homework")),
    (hw) => ({ message: `Archived: ${hw.title}. Find it in History with Archived.`, undo: { kind: "homework-archive", id: hw.id } }));
}

/** Resend to the parents who have not seen the homework (Seen by parent, "Resend to N"). */
export async function resendHomeworkAction(_prev: unknown, fd: FormData) {
  return hwForm("edit", fd, async ({ tx, s }) => resendToUnseen(tx, s, uuid(fd, "id", "homework")),
    (r) => `Homework sent again to the parents of ${plural(r.students, "student")}. With SMS backup if not read in 2 hours.`);
}

/** The Principal, School Admin, Vice Principal or Academic Head reminds a teacher about work waiting to be checked. */
export async function remindTeacherAction(staffId: string): Promise<string | null> {
  const problem = await hwQuick("edit", async ({ tx, s, today, tz }) => {
    if (!UUID.test(staffId)) throw new HomeworkProblem("Choose the teacher.");
    return remindTeacher(tx, s, staffId, today, tz);
  }, (r) => `Reminded ${r.name}: ${plural(r.waiting, "piece")} of work waiting to be checked.`);
  return problem ?? null;
}

/** A student hands in work: photos or PDFs and an optional note. */
export async function submitWorkAction(_prev: unknown, fd: FormData) {
  return hwForm("edit", fd, async ({ tx, s, now, today, tz }) => {
    const id = uuid(fd, "id", "homework");
    const list = [...files(fd, "photos"), ...files(fd, "files")];
    const one = oneFile(fd, "file");
    if (one) list.push(one);
    const r = await submitWork(tx, s, id, { files: list, note: str(fd, "note") }, now, today, tz);
    return r;
  }, (r) => `Handed in${r.late ? " late" : " on time"}${r.files ? ` · ${plural(r.files, "file")}` : ""}. Your teacher will check it.`);
}

/** The teacher assistant's homework draft (only when the school has it on). Returns the draft or a problem. */
export async function draftHomeworkAction(sectionId: string, subjectId: string): Promise<{ draft: Draft | null; problem?: string }> {
  const r = await hwAsk("create", async ({ tx, s, today, current }) => {
    if (!UUID.test(sectionId) || !UUID.test(subjectId)) throw new HomeworkProblem("Choose the class and subject first.");
    const on = assistantOn(await homeworkFeatures(tx, current.ctx));
    return draftHomework(tx, s, sectionId, subjectId, today, on);
  });
  if (!r.ok) return { draft: null, problem: r.problem };
  return r.data ? { draft: r.data } : { draft: null, problem: "There is nothing in this class’s syllabus to draft from yet. Type the homework yourself." };
}
