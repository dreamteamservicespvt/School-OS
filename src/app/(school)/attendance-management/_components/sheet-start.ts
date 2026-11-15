// Where each student starts on Take Attendance (05 §2: "Every student starts
// as Present, or not marked if the school prefers"). The default is only a
// starting point for a register nobody has saved yet, that this person may
// still save. It never shows a student as present who has no saved mark:
// - a saved mark is shown as saved;
// - approved full-day leave is Leave (marked in advance), even over a mark
//   saved before the leave was approved: saving keeps it Leave too, so the
//   counts and the Save button agree with the row;
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
    out[s.id] = { statusKey: fullLeave ? "leave" : s.statusKey ?? (useDefault ? "present" : null), note: s.note ?? "" };
  }
  return out;
}

/** Students with no saved mark (approved full-day leave aside). */
export function unsavedCount(rows: StartRow[]) {
  return rows.filter((s) => !s.statusKey && !(s.leave && !s.leave.halfDay)).length;
}

export type CounterStatus = { key: string; name: string };

/**
 * The live counter above the students (adopt item 3): "36 of 38 marked ·
 * 34 present · 2 absent", then any other status in use ("1 late", "1 leave").
 * Present and absent are always said, even at 0, so the teacher sees both.
 */
export function sheetCounter(rows: { id: string }[], marks: Record<string, { statusKey: string | null } | undefined>, statuses: CounterStatus[]) {
  const by: Record<string, number> = {};
  let marked = 0;
  for (const r of rows) {
    const k = marks[r.id]?.statusKey;
    if (!k) continue;
    marked += 1;
    by[k] = (by[k] ?? 0) + 1;
  }
  const known = new Set(statuses.map((s) => s.key));
  const parts = [
    { key: "present", n: by.present ?? 0, word: "present" },
    { key: "absent", n: by.absent ?? 0, word: "absent" },
    ...statuses.filter((s) => s.key !== "present" && s.key !== "absent" && by[s.key]).map((s) => ({ key: s.key, n: by[s.key], word: s.name.toLowerCase() })),
  ].filter((p) => known.has(p.key) || p.n > 0);
  const text = [`${marked} of ${rows.length} marked`, ...parts.map((p) => `${p.n} ${p.word}`)].join(" · ");
  return { marked, total: rows.length, by, parts, text };
}
