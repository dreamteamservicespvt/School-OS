"use server";

// Changes made on Co-curricular & Sports and Daily Activities. Each one checks
// the role on the server (requireAction and the Events level); the diary is
// written only by the class teacher of its pre-primary section (checked in
// src/lib/events/daily.ts), so the Principal, School Admin and VP can read
// and remind but never write it. Everything is audited in the same
// transaction.

import type { FormState } from "@/lib/forms";
import { evAction, need, str, id, ids, maybe, dateIso, checked, EventsProblem, UUID_RE } from "@/lib/events/act";
import {
  addHousePoints, addMembers, archiveAchievement, archiveGroup, assignHouses, correctCredits, issueCertificates, recordAchievements, recordFitness,
  recordResult, recordSession, removeMember, saveClub, saveFixture, saveHouse, saveTeam,
} from "@/lib/events/cocurricular";
import { assignActivity, logActivity, remindTeacher, removeActivity, sendDiary } from "@/lib/events/daily";
import { localNow } from "@/lib/events/jobs";
import { addDaysIso, dayOf, minutesFrom } from "@/lib/events/words";

type S = FormState<unknown>;
const today = (tz: string) => localNow(new Date(), tz).today;
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const optId = (fd: FormData, key: string) => (UUID_RE.test(str(fd, key)) ? str(fd, key) : null);
/** Minutes after midnight now, in the school's time zone. */
function nowMin(tz: string) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  return Number(p.find((x) => x.type === "hour")?.value ?? 0) * 60 + Number(p.find((x) => x.type === "minute")?.value ?? 0);
}
const whole = (fd: FormData, key: string, words: string) => {
  const v = str(fd, key).replace(/[−–]/g, "-");
  if (!/^-?\d+$/.test(v)) throw new EventsProblem(words, key);
  return Number(v);
};
const decimal = (fd: FormData, key: string, words: string) => {
  const v = str(fd, key);
  if (!v) return null;
  if (!/^-?\d+(\.\d+)?$/.test(v)) throw new EventsProblem(words, key);
  return Number(v);
};

/* ---------- Achievements, certificates and credits ---------- */

export async function achievementAction(_: S, fd: FormData): Promise<S> {
  return evAction("create", fd, async (w) => {
    need(w.can.cocurricular, "record achievements");
    return recordAchievements(w.tx, w.ctx, {
      studentIds: ids(fd, "studentIds"), activity: str(fd, "activity"), kind: str(fd, "kind"), level: str(fd, "level") || "School",
      position: maybe(fd, "position", "Position or result", 60), won: str(fd, "result") === "won", date: dateIso(fd, "date", "Date")!,
      eventId: optId(fd, "eventId"), teamId: optId(fd, "teamId"), certificate: checked(fd, "certificate"),
    }, today(w.tz));
  }, (r) => `Achievement recorded for ${count(r.made.length, "student")}.${r.made.some((m) => m.certificateNo) || r.told ? " Certificate issued." : ""}${r.credits ? ` +${r.credits} activity credits each.` : ""} On the student’s profile now.`);
}

export async function certificatesAction(_: S, fd: FormData): Promise<S> {
  return evAction("print", fd, async (w) => {
    need(w.can.cocurricular, "issue certificates");
    const list = ids(fd, "achievementIds");
    if (!list.length) throw new EventsProblem("Tick the achievements first.");
    return issueCertificates(w.tx, w.ctx, list);
  }, (r) => `${count(r.issued, "certificate")} issued.${r.told ? ` ${count(r.told, "parent")} told by message.` : ""} Print them from the list.`);
}

export async function archiveAchievementAction(_: S, fd: FormData): Promise<S> {
  return evAction("archive", fd, async (w) => {
    need(w.can.cocurricular, "change achievements");
    return archiveAchievement(w.tx, w.ctx, id(fd, "achievementId", "achievement"), str(fd, "reason"), today(w.tz));
  }, (r) => `${r.a.activity} taken off the record.${r.back ? ` ${r.back} activity credits reversed.` : ""}`);
}

export async function creditCorrectionAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.cocurricular, "correct activity credits");
    return correctCredits(w.tx, w.ctx, id(fd, "studentId", "student"), whole(fd, "points", "Enter a whole number of credits, like 5 or -5."), str(fd, "reason"), today(w.tz));
  }, (r) => `Credits ${r.points > 0 ? "added" : "taken away"}: ${r.points > 0 ? "+" : "−"}${Math.abs(r.points)}. New total ${r.total}.`);
}

/* ---------- Houses ---------- */

export async function houseAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.settings, "change houses");
    return saveHouse(w.tx, w.ctx, { id: optId(fd, "houseId"), name: str(fd, "name"), colour: str(fd, "colour"), captainStudentId: optId(fd, "captainStudentId") });
  }, (h) => `${h.name} saved.`);
}

export async function housePointsAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.cocurricular, "change house points");
    return addHousePoints(w.tx, w.ctx, id(fd, "houseId", "house"), whole(fd, "points", "Enter a whole number, like 10 or -10."), str(fd, "reason"), today(w.tz));
  }, (r) => `${r.entry.points > 0 ? "+" : "−"}${Math.abs(r.entry.points)} points to ${r.house.name}. ${r.entry.reason}`);
}

export async function assignHousesAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.cocurricular, "assign houses");
    const mode = str(fd, "mode") === "hand" ? "hand" : "turn";
    return assignHouses(w.tx, w.ctx, mode === "turn" ? { mode } : { mode, houseId: id(fd, "houseId", "house"), studentIds: ids(fd, "studentIds") }, today(w.tz));
  }, (r) => (r.house ? `${count(r.assigned, "student")} moved to ${r.house.name}.` : `${count(r.assigned, "student")} given a house, in turn by class and roll.`));
}

/* ---------- Clubs and sports teams ---------- */

export async function clubAction(_: S, fd: FormData): Promise<S> {
  return evAction("create", fd, async (w) => {
    need(w.can.cocurricular, "change clubs");
    return saveClub(w.tx, w.ctx, { id: optId(fd, "clubId"), name: str(fd, "name"), inChargeId: optId(fd, "inChargeId"), meets: maybe(fd, "meets", "Meets", 60) });
  }, (c) => `${c.name} saved.`);
}

export async function teamAction(_: S, fd: FormData): Promise<S> {
  return evAction("create", fd, async (w) => {
    need(w.can.cocurricular, "change sports teams");
    return saveTeam(w.tx, w.ctx, { id: optId(fd, "teamId"), name: str(fd, "name"), sport: str(fd, "sport"), coachId: optId(fd, "coachId"), coachName: maybe(fd, "coachName", "Visiting coach", 60) });
  }, (t) => `${t.name} saved.`);
}

export async function archiveGroupAction(_: S, fd: FormData): Promise<S> {
  return evAction("archive", fd, async (w) => {
    need(w.can.cocurricular, "archive clubs and teams");
    return archiveGroup(w.tx, w.ctx, str(fd, "kind") === "team" ? "team" : "club", id(fd, "groupId", "club or team"));
  }, (n) => `${n} archived. Its history is kept.`);
}

export async function membersAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.cocurricular, "change members");
    return addMembers(w.tx, w.ctx, str(fd, "kind") === "team" ? "team" : "club", id(fd, "groupId", "club or team"), ids(fd, "studentIds"), today(w.tz));
  }, (r) => `${count(r.added, "member")} added to ${r.name}. They see it on their profile.`);
}

export async function removeMemberAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.cocurricular, "change members");
    return removeMember(w.tx, w.ctx, str(fd, "kind") === "team" ? "team" : "club", id(fd, "groupId", "club or team"), id(fd, "studentId", "student"), today(w.tz));
  }, (r) => `Taken off ${r.name}.`);
}

export async function sessionAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.cocurricular, "record attendance");
    const kind = str(fd, "kind") === "team" ? "team" : "club";
    return { kind, ...(await recordSession(w.tx, w.ctx, kind, id(fd, "groupId", "club or team"), {
      date: dateIso(fd, "date", "Date")!, presentIds: ids(fd, "present"), topic: maybe(fd, "topic", "Topic", 120),
      startMin: minutesFrom(str(fd, "time")), venue: maybe(fd, "venue", "Venue", 80),
    }, today(w.tz))) };
  }, (r) => `${r.kind === "team" ? "Training" : "Meeting"} saved: ${r.name} · ${r.present} of ${r.of} present.`);
}

export async function fixtureAction(_: S, fd: FormData): Promise<S> {
  return evAction("create", fd, async (w) => {
    need(w.can.cocurricular, "add fixtures");
    return saveFixture(w.tx, w.ctx, { id: optId(fd, "fixtureId"), teamId: optId(fd, "teamId"), title: str(fd, "title"), date: dateIso(fd, "date", "Date")!, startMin: minutesFrom(str(fd, "time")), venue: maybe(fd, "venue", "Venue", 80), ground: str(fd, "ground") || "HOME" });
  }, (f) => `Fixture saved: ${f.title}.`);
}

export async function resultAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.cocurricular, "record results");
    return recordResult(w.tx, w.ctx, id(fd, "fixtureId", "fixture"), str(fd, "result"), maybe(fd, "score", "Score", 80), today(w.tz));
  }, (f) => `Result saved: ${f.title}.`);
}

export async function fitnessAction(_: S, fd: FormData): Promise<S> {
  return evAction("create", fd, async (w) => {
    need(w.can.cocurricular, "record fitness tests");
    const run = str(fd, "run");
    const m = /^(\d{1,2}):([0-5]\d)$/.exec(run);
    if (run && !m) throw new EventsProblem("Enter the 600 m run time like 2:45.", "run");
    return recordFitness(w.tx, w.ctx, {
      studentId: id(fd, "studentId", "student"), date: dateIso(fd, "date", "Date")!, heightCm: decimal(fd, "heightCm", "Height is a number in cm."), weightKg: decimal(fd, "weightKg", "Weight is a number in kg."),
      runSeconds: m ? Number(m[1]) * 60 + Number(m[2]) : null, reachCm: decimal(fd, "reachCm", "Sit-and-reach is a number in cm."), note: maybe(fd, "note", "Note", 200),
    }, today(w.tz));
  }, () => "Fitness test saved.");
}

/* ---------- Daily Activities ---------- */

export async function assignActivityAction(_: S, fd: FormData): Promise<S> {
  return evAction("create", fd, async (w) => {
    const t = today(w.tz);
    const start = dateIso(fd, "from", "First day") ?? t;
    const days = str(fd, "days") === "week" ? Array.from({ length: 7 }, (_x, i) => addDaysIso(start, i)).filter((d) => dayOf(d).getUTCDay() !== 0).slice(0, 6) : [start];
    const startMin = minutesFrom(str(fd, "time"));
    if (startMin == null) throw new EventsProblem("Enter the time like 11:15.", "time");
    return assignActivity(w.tx, w.ctx, { sectionId: id(fd, "sectionId", "class"), type: str(fd, "type"), label: str(fd, "label"), startMin, dates: days }, t);
  }, (r) => `${r.label} assigned to ${r.section.label} for ${count(r.made, "day")}.${r.skipped ? ` ${count(r.skipped, "day")} left out (holiday or already there).` : ""}`);
}

export async function removeActivityAction(_: S, fd: FormData): Promise<S> {
  return evAction("archive", fd, async (w) => removeActivity(w.tx, w.ctx, id(fd, "activityId", "activity"), today(w.tz)), (a) => `${a.label} taken off the day.`);
}

export async function logActivityAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => logActivity(w.tx, w.ctx, { activityId: id(fd, "activityId", "activity"), studentIds: ids(fd, "studentIds"), value: str(fd, "value"), note: maybe(fd, "note", "Note", 120) }, today(w.tz)),
    (r) => `${r.activity.label} logged for ${count(r.logged, "child", "children")}.${r.absent ? ` ${r.absent} absent left out.` : ""}`);
}

export async function sendDiaryAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => sendDiary(w.tx, w.ctx, id(fd, "sectionId", "class"), today(w.tz)),
    (r) => `Diary sent to ${count(r.people, "parent")} of ${r.section.label}. Each parent gets only their own child’s day.`);
}

export async function remindDiaryAction(_: S, fd: FormData): Promise<S> {
  return evAction("edit", fd, async (w) => {
    need(w.can.dailyRemind, "send diary reminders");
    return remindTeacher(w.tx, w.ctx, id(fd, "sectionId", "class"), today(w.tz), nowMin(w.tz));
  }, (r) => `Reminder sent to ${r.teacher}. ${r.section}: ${r.missing.length ? `${r.missing.length > 1 ? `${r.missing.slice(0, -1).join(", ")} and ${r.missing.at(-1)}` : r.missing[0]} not logged yet` : "keep the diary up to date"}.`);
}
