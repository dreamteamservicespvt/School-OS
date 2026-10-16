"use server";

import { str, strs } from "@/lib/fees/act";
import { HomeworkProblem } from "@/lib/homework/access";
import { addMaterial, addRecording, cancelClass, markJoined, remindMe, removeMaterial, removeRecording, scheduleClass } from "@/lib/homework/online";
import { momentWords, plural } from "@/lib/homework/words";
import { hwForm, hwQuick, localMoment } from "../_lib/action";
import { UUID } from "../_lib/page";

const uuid = (fd: FormData, key: string, what: string) => {
  const v = str(fd, key);
  if (!UUID.test(v)) throw new HomeworkProblem(`Choose the ${what}.`, key);
  return v;
};

/** Schedule an online class, once or the same day and time each week. */
export async function scheduleClassAction(_prev: unknown, fd: FormData) {
  return hwForm("create", fd, async ({ tx, s, now, today, tz }) => {
    const startsAt = localMoment(str(fd, "startsAt"), tz);
    if (!startsAt) throw new HomeworkProblem("Choose the date and time.", "startsAt");
    const weeks = str(fd, "repeat") === "on" ? Number(str(fd, "weeks") || "4") : 1;
    const r = await scheduleClass(tx, s, {
      sectionId: uuid(fd, "sectionId", "class"), subjectId: uuid(fd, "subjectId", "subject"), title: str(fd, "title"), startsAt,
      lengthMin: Number(str(fd, "lengthMin") || "40"), meetingLink: str(fd, "meetingLink"), repeatWeeks: weeks,
    }, now, today, tz);
    return { when: momentWords(startsAt, tz), weeks, section: r.section };
  }, (r) => `Online class scheduled for ${r.when}${r.weeks > 1 ? `, then every week (${plural(r.weeks, "class", "classes")})` : ""}. Students of ${r.section} get a reminder 15 minutes before.`);
}

export async function cancelClassAction(_prev: unknown, fd: FormData) {
  return hwForm("edit", fd, async ({ tx, s, now }) => cancelClass(tx, s, uuid(fd, "id", "online class"), str(fd, "note"), now),
    (x) => ({ message: `Cancelled: ${x.title}. Students are told.`, undo: { kind: "homework-class-cancel", id: x.id } }));
}

/** Who joined: the ticked students joined, everyone else did not. */
export async function attendanceAction(_prev: unknown, fd: FormData) {
  return hwForm("edit", fd, async ({ tx, s, now }) => markJoined(tx, s, uuid(fd, "id", "online class"), strs(fd, "joined").filter((x) => UUID.test(x)), now),
    (r) => `Saved: ${r.joined} of ${r.of} joined.`);
}

export async function recordingAction(fd: FormData) {
  return hwQuick("edit", async ({ tx, s }) => addRecording(tx, s, uuid(fd, "id", "online class"), str(fd, "url")), () => "Recording link added. Students can watch it in Online Classes.");
}

export async function materialAction(_prev: unknown, fd: FormData) {
  return hwForm("edit", fd, async ({ tx, s }) => {
    const f = fd.get("file");
    return addMaterial(tx, s, uuid(fd, "id", "online class"), { file: f instanceof File && f.size > 0 ? f : null, url: str(fd, "url"), name: str(fd, "name") });
  }, (m) => `Shared: ${m.name}.`);
}

/** A student asks for a reminder before the class. */
export async function remindMeAction(fd: FormData) {
  return hwQuick("edit", async ({ tx, s }) => remindMe(tx, s, uuid(fd, "id", "online class")), () => "We will remind you 15 minutes before.");
}

export async function removeRecordingAction(id: string, url: string) {
  return hwQuick("edit", async ({ tx, s }) => removeRecording(tx, s, id, url), () => "Recording link removed.");
}

export async function removeMaterialAction(id: string, key: string) {
  return hwQuick("edit", async ({ tx, s }) => removeMaterial(tx, s, id, key), () => "Material removed.");
}
