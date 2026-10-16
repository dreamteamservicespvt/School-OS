// Where each student starts on Take Attendance (05 §2: "Every student starts
// as Present, or not marked if the school prefers"). The default is only a
// starting point for a register nobody has saved yet, that this person may
// still save. It never shows a student as present who has no saved mark:
// - a saved mark is shown as saved;
// - approved full-day leave starts as Leave (marked in advance);
// - once the class is saved, a student with no saved mark (admitted after the
//   save, for example) is "Not marked";
// - on a locked register this person cannot change, only saved marks show.

export type StartRow = { id: string; statusKey: string | null; note: string | null; leave: { halfDay: boolean } | null };
export type StartMark = { statusKey: string | null; note: string };

export function startMarks(rows: StartRow[], opts: { saved: boolean; readOnly: boolean; defaultStatus: "present" | "not-marked" }): Record<string, StartMark> {
  const useDefault = !opts.saved && !opts.readOnly && opts.defaultStatus === "present";
  const out: Record<string, StartMark> = {};
  for (const s of rows) {
    const fullLeave = Boolean(s.leave && !s.leave.halfDay);
    out[s.id] = { statusKey: s.statusKey ?? (fullLeave ? "leave" : useDefault ? "present" : null), note: s.note ?? "" };
  }
  return out;
}

/** Students with no saved mark (approved full-day leave aside). */
export function unsavedCount(rows: StartRow[]) {
  return rows.filter((s) => !s.statusKey && !(s.leave && !s.leave.halfDay)).length;
}
