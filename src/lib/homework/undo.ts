// Undo for Homework & Learning's simple changes (P5): archiving homework, a
// bulk "Mark Complete", hiding a lesson or a post, archiving a lesson and
// cancelling an online class. Each undo checks the person's reach again.
import "server-only";

import { registerUndo } from "../undo";
import { withSchool, type Tx } from "../db";
import { requirePermission } from "../permissions";
import type { Current } from "../current";
import { todayIn } from "../academic/common";
import { homeworkScope, type HomeworkScope } from "./scope";
import { restoreHomework } from "./homework";
import { undoBulkComplete } from "./submissions";
import { restoreLesson, setLessonVisible } from "./material";
import { moderate } from "./discussions";
import { restoreClass } from "./online";

async function run(current: Current, work: (tx: Tx, s: HomeworkScope) => Promise<unknown>) {
  requirePermission(current.permissions, "homework-learning", "edit");
  await withSchool(current.ctx, async (tx) => {
    const s = await homeworkScope(tx, current, todayIn(current.school.timeZone));
    await work(tx, s);
  });
}

registerUndo("homework-archive", (current, id) => run(current, (tx, s) => restoreHomework(tx, s, id)));
registerUndo("homework-bulk-complete", (current, auditId) => run(current, (tx, s) => undoBulkComplete(tx, s, auditId)));
registerUndo("homework-lesson-visible", (current, key) => {
  const [lessonId, was] = key.split(":");
  return run(current, (tx, s) => setLessonVisible(tx, s, lessonId, was === "1"));
});
registerUndo("homework-lesson-archive", (current, id) => run(current, (tx, s) => restoreLesson(tx, s, id)));
registerUndo("homework-post-hide", (current, id) => run(current, (tx, s) => moderate(tx, s, id, "unhide")));
registerUndo("homework-class-cancel", (current, id) => run(current, (tx, s) => restoreClass(tx, s, id)));
