"use server";

import { optionalText, str, strs } from "@/lib/fees/act";
import { HomeworkProblem } from "@/lib/homework/access";
import { addLesson, archiveLesson, copyCourse, editLesson, ensureCourse, markLessonDone, moveLesson, setLessonVisible, type LessonItemInput } from "@/lib/homework/material";
import { plural } from "@/lib/homework/words";
import { hwForm, hwQuick } from "../_lib/action";
import { UUID } from "../_lib/page";

const uuid = (fd: FormData, key: string, what: string) => {
  const v = str(fd, key);
  if (!UUID.test(v)) throw new HomeworkProblem(`Choose the ${what}.`, key);
  return v;
};
const files = (fd: FormData, key: string) => fd.getAll(key).filter((v): v is File => v instanceof File && v.size > 0);

/** Files and links added in the Add lesson and Edit lesson sheets. */
function items(fd: FormData): LessonItemInput[] {
  return [
    ...[...files(fd, "photos"), ...files(fd, "files")].map((file) => ({ kind: "file" as const, file })),
    ...strs(fd, "links").map((url) => ({ kind: "link" as const, url })),
  ];
}

function lesson(fd: FormData) {
  const chapter = str(fd, "chapterId");
  return {
    title: str(fd, "title"), chapterId: UUID.test(chapter) ? chapter : null,
    notes: optionalText(fd, "notes", "Notes", 8000), visible: str(fd, "visible") === "on", items: items(fd),
  };
}

/** Add a lesson at the end of a course's learning path (the course is made the first time). */
export async function addLessonAction(_prev: unknown, fd: FormData) {
  return hwForm("create", fd, async ({ tx, s }) => {
    const c = await ensureCourse(tx, s, uuid(fd, "sectionId", "class"), uuid(fd, "subjectId", "subject"));
    const l = await addLesson(tx, s, c.id, lesson(fd));
    return { title: l.title, visible: l.visible, label: str(fd, "label") };
  }, (r) => `Lesson added: ${r.title}. ${r.visible ? `Visible to ${r.label}. Students get a notification.` : "Hidden from students until you show it."}`);
}

export async function editLessonAction(_prev: unknown, fd: FormData) {
  return hwForm("edit", fd, async ({ tx, s }) => {
    const id = uuid(fd, "id", "lesson");
    await editLesson(tx, s, id, { ...lesson(fd), removeItemIds: strs(fd, "remove").filter((x) => UUID.test(x)) });
    return str(fd, "title").trim();
  }, (title) => `Saved: ${title}. Students see the change.`);
}

export async function archiveLessonAction(_prev: unknown, fd: FormData) {
  return hwForm("archive", fd, async ({ tx, s }) => archiveLesson(tx, s, uuid(fd, "id", "lesson")),
    (l) => ({ message: `Archived: ${l.title}. Students no longer see it.`, undo: { kind: "homework-lesson-archive", id: l.id } }));
}

/** Show or hide one lesson, with Undo. */
export async function lessonVisibleAction(fd: FormData) {
  const visible = str(fd, "visible") === "1";
  return hwQuick("edit", async ({ tx, s }) => setLessonVisible(tx, s, uuid(fd, "id", "lesson"), visible),
    (l) => ({ message: visible ? `${l.title} is visible to ${str(fd, "label")}` : `${l.title} is hidden`, undo: { kind: "homework-lesson-visible", id: `${l.id}:${visible ? "0" : "1"}` } }));
}

export async function moveLessonAction(fd: FormData) {
  return hwQuick("edit", async ({ tx, s }) => moveLesson(tx, s, uuid(fd, "id", "lesson"), str(fd, "dir") === "up" ? "up" : "down"), () => "Moved. Students see lessons in this order.");
}

/** Copy every lesson to another section of the same subject; they start hidden there. */
export async function copyCourseAction(_prev: unknown, fd: FormData) {
  return hwForm("create", fd, async ({ tx, s }) => copyCourse(tx, s, uuid(fd, "courseId", "course"), uuid(fd, "toSectionId", "section to copy to")),
    (r) => `Course copied: ${plural(r.lessons, "lesson")}, all hidden until you show them.`);
}

/** A student marks a lesson done, or not done. */
export async function lessonDoneAction(fd: FormData) {
  const done = str(fd, "done") === "1";
  return hwQuick("edit", async ({ tx, s }) => markLessonDone(tx, s, uuid(fd, "id", "lesson"), done),
    () => (done ? "Marked as done. Your teacher can see your progress." : "Marked as not done."));
}
