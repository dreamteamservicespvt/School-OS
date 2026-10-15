"use server";

import { str } from "@/lib/fees/act";
import { HomeworkProblem, OPTIONAL_PAGES, type OptionalFeature } from "@/lib/homework/access";
import type { HomeworkScope } from "@/lib/homework/scope";
import { saveHomeworkSettings, setOptionalPage, type SettingsChange } from "@/lib/homework/settings";
import { hwForm, hwQuick } from "../_lib/action";

const SECTIONS = ["Submission rules", "Late marking", "Grading", "Course access", "Display"] as const;

function mustRun(s: HomeworkScope) {
  if (s.modes.settings !== "edit") throw new HomeworkProblem("Your role reads Homework Settings but does not change them.");
}

const int = (fd: FormData, key: string, label: string) => {
  const v = str(fd, key);
  if (!/^\d{1,4}$/.test(v)) throw new HomeworkProblem(`${label} must be a whole number.`, key);
  return Number(v);
};
const on = (fd: FormData, key: string) => str(fd, key) === "on";

/** Saves one card of Homework Settings. Only the fields of that card change. */
export async function saveSettingsAction(_prev: unknown, fd: FormData) {
  return hwForm("edit", fd, async ({ tx, s, current }) => {
    mustRun(s);
    const section = str(fd, "section");
    if (!(SECTIONS as readonly string[]).includes(section)) throw new HomeworkProblem("That settings card was not found.");
    let change: SettingsChange;
    if (section === "Submission rules") change = { onlineSubmission: on(fd, "onlineSubmission"), maxFileMb: int(fd, "maxFileMb", "File size"), resubmit: str(fd, "resubmit") === "always" ? "always" : "per-student", discussionOn: on(fd, "discussionOn") };
    else if (section === "Late marking") change = { graceMinutes: int(fd, "graceMinutes", "Grace time"), missingOn: on(fd, "missingOn") };
    else if (section === "Grading") {
      const bands = [0, 1, 2, 3, 4, 5].flatMap((i) => {
        const grade = str(fd, `band${i}grade`).trim();
        const from = str(fd, `band${i}from`).trim();
        if (!grade && !from) return [];
        if (!/^\d{1,3}$/.test(from)) throw new HomeworkProblem("Each grade needs a start from 0 to 100%.", "gradeBands");
        return [{ grade: grade.slice(0, 4), from: Number(from) }];
      });
      change = { gradingShow: ["score", "grade"].includes(str(fd, "gradingShow")) ? str(fd, "gradingShow") : "both", defaultMaxMarks: int(fd, "defaultMaxMarks", "Default maximum marks"), feedbackVisible: on(fd, "feedbackVisible"), gradeBands: bands };
    } else if (section === "Course access") change = { classTeacherReadsCourses: on(fd, "classTeacherReadsCourses"), studentCourses: str(fd, "studentCourses") === "class" ? "class" : "section" };
    else change = { listView: str(fd, "listView") === "list" ? "list" : "cards", cardShowsSeen: on(fd, "cardShowsSeen"), cardShowsFiles: on(fd, "cardShowsFiles") };
    await saveHomeworkSettings(tx, current.ctx, change, section);
    return section;
  }, (section) => `Saved: ${section}. It is in the audit log.`);
}

/** Switches an optional page on or off for the whole school. */
export async function optionalPageAction(fd: FormData) {
  const feature = str(fd, "feature") as OptionalFeature;
  const value = str(fd, "on") === "1";
  return hwQuick("edit", async ({ tx, s, current }) => {
    mustRun(s);
    if (!OPTIONAL_PAGES.some((o) => o.feature === feature)) throw new HomeworkProblem("That page was not found.");
    return setOptionalPage(tx, current.ctx, feature, value);
  }, (def) => (value ? `${def.label} is on for everyone in the school.` : `${def.label} is off. Nothing is deleted; switch it on to see it again.`));
}
