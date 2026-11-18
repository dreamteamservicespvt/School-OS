// "Not marked yet" on the Attendance Register: what the card offers for a class whose register is not
// taken today. Before the lock time a reminder helps: the class teacher can still take it. After the
// lock it cannot: Take Attendance refuses the teacher ("locked at 11:00 AM. Request a correction"), so
// the card offers what works, a correction request for that class and day (it goes to Approvals).
// Live test 17 Nov 2026 (Principal): "Remind" was still offered under "Today · locked at 11:00 AM".
import { BASE } from "./access";
import type { NotMarkedRow } from "./remind";

type Row = Pick<NotMarkedRow, "sectionId" | "teacher" | "teacherLogin" | "remindedAt">;

/**
 * `canRemind`: the person looks after the whole school's attendance. `mayCorrect`: they may change this
 * class's register (directly or by a correction request). `date`: the day shown, as YYYY-MM-DD.
 */
export type NotMarkedWhen = { locked: boolean; canRemind: boolean; mayCorrect: boolean; date: string };

export type NotMarkedOffer =
  | { kind: "remind"; remindedAt: Date | null }
  | { kind: "correction"; href: string }
  | { kind: "note"; text: "Cannot sign in" | "No class teacher" };

/** The one action (or note) for a class on the card; null when this person can do nothing about it. */
export function notMarkedOffer(row: Row, when: NotMarkedWhen): NotMarkedOffer | null {
  if (when.locked) return when.mayCorrect ? { kind: "correction", href: `${BASE}/register/correction?section=${row.sectionId}&date=${when.date}` } : null;
  if (!when.canRemind) return null;
  return row.teacherLogin ? { kind: "remind", remindedAt: row.remindedAt } : { kind: "note", text: row.teacher ? "Cannot sign in" : "No class teacher" };
}

/** The classes "Remind all" reminds: only before the lock, and only when two or more teachers are still to be reminded. */
export function remindAllFor<R extends Row>(rows: R[], when: Pick<NotMarkedWhen, "locked" | "canRemind">): R[] {
  if (when.locked || !when.canRemind) return [];
  const left = rows.filter((r) => !r.remindedAt && r.teacherLogin);
  return left.length > 1 ? left : [];
}
