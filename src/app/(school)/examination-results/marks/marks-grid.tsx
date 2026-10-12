"use client";

// The marks grid (08 §2 Marks Entry): students in roll order down the side,
// mark categories across, the total and grade worked out as marks are typed.
// Each change saves by itself; when the phone is offline the marks wait on
// this device and save when it is back online. On a phone: one student at a
// time with large number keys, or a compact list with the number pad.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MarksPaperStatus } from "@prisma/client";
import { Button, Spinner } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { checkMark } from "@/lib/exams/compute";
import { bandFor, type Band } from "@/lib/exams/grades";
import { readMarksSheet, requestChangeAction, saveMarksAction, submitPaperAction, type ImportedRow } from "./actions";
import { FormDialog, err } from "../../academic-management/_components/form-dialog";

export type GridStudent = {
  id: string; name: string; rollNo: number | null; admissionNo: string;
  parts: Record<string, number>; absent: boolean; grade: string | null; remark: string | null; waiting: boolean;
  history: { at: string; by: string; approvedBy: string; reason: string; before: string; after: string }[];
};

type Cat = { name: string; max: number };
type Row = { parts: Record<string, string>; absent: boolean; grade: string; remark: string };
type Props = {
  entryId: string; sectionId: string; paperLabel: string; students: GridStudent[]; categories: Cat[]; gradeOnly: boolean; gradeList: string[]; bands: Band[];
  status: MarksPaperStatus; canEdit: boolean; canRequest: boolean;
};

const num = (s: string) => (s.trim() === "" ? null : Number(s.trim()));
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));

function rowOf(s: GridStudent, cats: Cat[]): Row {
  return { parts: Object.fromEntries(cats.map((c) => [c.name, s.parts[c.name] !== undefined ? String(s.parts[c.name]) : ""])), absent: s.absent, grade: s.grade ?? "", remark: s.remark ?? "" };
}

export function MarksGrid(props: Props) {
  const { entryId, sectionId, students, categories: cats, gradeOnly, gradeList, bands, canEdit } = props;
  const router = useRouter();
  const storeKey = `sos-marks:${entryId}:${sectionId}`;
  const max = cats.reduce((s, c) => s + c.max, 0);
  const [rows, setRows] = useState<Record<string, Row>>(() => Object.fromEntries(students.map((s) => [s.id, rowOf(s, cats)])));
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [save, setSave] = useState<{ state: "idle" | "saving" | "saved" | "offline" | "error"; message?: string; at?: Date }>({ state: "idle" });
  const [mode, setMode] = useState<"single" | "list">("list");
  const [index, setIndex] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const rowsRef = useRef(rows);
  const dirtyRef = useRef(dirty);
  useEffect(() => { rowsRef.current = rows; dirtyRef.current = dirty; }, [rows, dirty]);

  // Problems per student, checked as typed (the server checks again).
  const problemOf = useCallback((name: string, r: Row): string | null => {
    const entered = Object.values(r.parts).some((x) => x.trim() !== "");
    if (r.absent && (entered || r.grade)) return `${name} is marked absent. Remove absent to enter marks.`;
    if (gradeOnly) return r.grade && !gradeList.includes(r.grade) ? `Choose a grade from ${gradeList.join(", ")}.` : null;
    for (const c of cats) {
      const v = num(r.parts[c.name] ?? "");
      const p = checkMark(cats.length === 1 ? "This paper" : c.name, c.max, v);
      if (p) return p;
    }
    return null;
  }, [cats, gradeOnly, gradeList]);

  const totals = useMemo(() => Object.fromEntries(students.map((s) => {
    const r = rows[s.id];
    if (!r || r.absent) return [s.id, { total: null as number | null, grade: r?.absent ? "AB" : "", done: Boolean(r?.absent) }];
    if (gradeOnly) return [s.id, { total: null, grade: r.grade, done: Boolean(r.grade) }];
    const vals = cats.map((c) => num(r.parts[c.name] ?? ""));
    if (vals.some((v) => v === null || Number.isNaN(v))) return [s.id, { total: null, grade: "", done: false }];
    const total = vals.reduce((a: number, b) => a + (b as number), 0);
    return [s.id, { total, grade: max ? bandFor((total / max) * 100, bands)?.grade ?? "" : "", done: !problemOf(s.name, r) }];
  })), [rows, students, cats, gradeOnly, max, bands, problemOf]);
  const done = students.filter((s) => totals[s.id]?.done).length;

  // Save what changed. Rows with a problem wait until they are fixed.
  const flush = useCallback(async () => {
    if (saving.current) return;
    const ids = [...dirtyRef.current].filter((id) => !problemOf(students.find((s) => s.id === id)?.name ?? "", rowsRef.current[id]));
    if (ids.length === 0) return;
    const payload = ids.map((id) => {
      const r = rowsRef.current[id];
      return { studentId: id, parts: Object.fromEntries(cats.map((c) => [c.name, num(r.parts[c.name] ?? "")])), absent: r.absent, grade: r.grade || null, remark: r.remark || null };
    });
    // What was sent, so a mark typed while saving is not mistaken for saved.
    const sent = Object.fromEntries(ids.map((id) => [id, JSON.stringify(rowsRef.current[id])]));
    saving.current = true;
    setSave({ state: "saving" });
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("offline");
      const res = await saveMarksAction(entryId, sectionId, payload);
      if (res.ok) {
        const savedIds = ids.filter((id) => JSON.stringify(rowsRef.current[id]) === sent[id]);
        setDirty((d) => { const n = new Set(d); for (const id of savedIds) n.delete(id); return n; });
        dirtyRef.current = new Set([...dirtyRef.current].filter((id) => !savedIds.includes(id)));
        try {
          const kept = JSON.parse(localStorage.getItem(storeKey) ?? "{}") as Record<string, Row>;
          for (const id of savedIds) delete kept[id];
          if (Object.keys(kept).length) localStorage.setItem(storeKey, JSON.stringify(kept)); else localStorage.removeItem(storeKey);
        } catch { /* storage may be blocked */ }
        setSave({ state: "saved", at: new Date() });
      } else {
        setSave({ state: "error", message: res.message });
      }
    } catch {
      setSave({ state: "offline", message: "You are offline. Marks are kept on this device and save when you are back online." });
    } finally {
      saving.current = false;
    }
  }, [cats, entryId, sectionId, storeKey, students, problemOf]);

  // Marks typed earlier on this device that did not reach the school yet.
  useEffect(() => {
    const start = setTimeout(() => {
      try {
        const kept = JSON.parse(localStorage.getItem(storeKey) ?? "{}") as Record<string, Row>;
        const ids = Object.keys(kept).filter((id) => students.some((s) => s.id === id));
        if (ids.length && canEdit) {
          setRows((r) => ({ ...r, ...Object.fromEntries(ids.map((id) => [id, kept[id]])) }));
          setDirty(new Set(ids));
          setSave({ state: "offline", message: `${ids.length} unsaved ${ids.length === 1 ? "change" : "changes"} from this device. Saving now.` });
          setTimeout(() => void flush(), 300);
        } else if (!canEdit) localStorage.removeItem(storeKey);
      } catch { /* storage may be blocked */ }
      if (window.matchMedia("(max-width: 767px)").matches) setMode("single");
    }, 0);
    const online = () => void flush();
    window.addEventListener("online", online);
    const retry = setInterval(() => { if (dirtyRef.current.size && navigator.onLine) void flush(); }, 20000);
    return () => { clearTimeout(start); window.removeEventListener("online", online); clearInterval(retry); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving with unsaved marks asks first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirtyRef.current.size) { e.preventDefault(); } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  function change(id: string, next: Row) {
    setRows((r) => ({ ...r, [id]: next }));
    setDirty((d) => new Set(d).add(id));
    try {
      const kept = JSON.parse(localStorage.getItem(storeKey) ?? "{}") as Record<string, Row>;
      kept[id] = next;
      localStorage.setItem(storeKey, JSON.stringify(kept));
    } catch { /* storage may be blocked */ }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
  }

  function setPart(id: string, cat: string, value: string) {
    const r = rows[id];
    change(id, { ...r, parts: { ...r.parts, [cat]: value.replace(/[^\d.]/g, "").slice(0, 6) } });
  }

  function setAbsent(id: string, absent: boolean) {
    const r = rows[id];
    change(id, absent ? { ...r, absent: true, parts: Object.fromEntries(cats.map((c) => [c.name, ""])), grade: "" } : { ...r, absent: false });
  }

  // Keyboard: Enter or Down goes to the same column of the next student; Up to the one above; A ticks Absent.
  function onKey(e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>, row: number, col: number) {
    const go = (r: number) => {
      const el = document.querySelector<HTMLElement>(`[data-cell="${r}:${col}"]`);
      if (el) { e.preventDefault(); el.focus(); if (el instanceof HTMLInputElement) el.select(); }
    };
    if (e.key === "Enter" || e.key === "ArrowDown") go(e.shiftKey && e.key === "Enter" ? row - 1 : row + 1);
    else if (e.key === "ArrowUp") go(row - 1);
    else if ((e.key === "a" || e.key === "A") && e.currentTarget instanceof HTMLInputElement && e.currentTarget.inputMode === "decimal") {
      e.preventDefault();
      const id = students[row].id;
      setAbsent(id, !rows[id].absent);
    }
  }

  async function submit() {
    if (dirty.size) {
      await flush();
      if (dirtyRef.current.size) return "Some marks are not saved yet. Check the message above the grid, then try again.";
    }
    const e = await submitPaperAction(entryId, sectionId);
    if (!e) {
      try { localStorage.removeItem(storeKey); } catch { /* ignore */ }
      router.refresh();
    }
    return e;
  }

  function fillFromSheet(list: ImportedRow[]) {
    for (const x of list) {
      const r = rowsRef.current[x.studentId];
      if (!r) continue;
      const next: Row = x.absent ? { ...r, absent: true, parts: Object.fromEntries(cats.map((c) => [c.name, ""])), grade: "" } : {
        ...r, absent: false,
        parts: Object.fromEntries(cats.map((c) => [c.name, x.parts[c.name] === null || x.parts[c.name] === undefined || Number.isNaN(x.parts[c.name]) ? r.parts[c.name] ?? "" : String(x.parts[c.name])])),
        grade: gradeOnly ? x.grade ?? r.grade : r.grade,
      };
      rowsRef.current = { ...rowsRef.current, [x.studentId]: next };
      change(x.studentId, next);
    }
  }

  if (students.length === 0) {
    return <Alert>No students sit this paper. {gradeOnly ? "" : "If students chose this optional subject, record their choices in Student Management."}</Alert>;
  }

  const firstProblem = students.map((s) => (dirty.has(s.id) ? problemOf(s.name, rows[s.id]) : null)).find(Boolean);
  const statusLine = (
    <div className="flex flex-wrap items-center justify-between gap-3" aria-live="polite">
      <p className="font-medium">{done} of {students.length} entered</p>
      {canEdit && (
        <p className={`flex items-center gap-2 text-sm ${save.state === "error" ? "text-danger" : save.state === "offline" ? "text-warn-text" : "text-ink-2"}`}>
          {save.state === "saving" && <><Spinner className="size-4" /> Saving…</>}
          {save.state === "saved" && dirty.size === 0 && "All marks saved"}
          {save.state === "saved" && dirty.size > 0 && "Saving as you type"}
          {save.state === "idle" && (dirty.size ? "Not saved yet" : "Marks save as you type")}
          {(save.state === "offline" || save.state === "error") && save.message}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-4 space-y-2 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4">
        {statusLine}
        {firstProblem && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{firstProblem}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-surface-2 p-1 md:hidden" role="group" aria-label="Layout">
            <button type="button" aria-pressed={mode === "single"} onClick={() => setMode("single")} className={`min-h-10 rounded-md px-3 text-sm ${mode === "single" ? "bg-surface font-medium shadow-card" : "text-ink-2"}`}>One at a time</button>
            <button type="button" aria-pressed={mode === "list"} onClick={() => setMode("list")} className={`min-h-10 rounded-md px-3 text-sm ${mode === "list" ? "bg-surface font-medium shadow-card" : "text-ink-2"}`}>List</button>
          </div>
          {canEdit && <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>Import from Excel</Button>}
          {canEdit && (
            done === students.length ? (
              <ConfirmButton trigger="Submit marks" triggerVariant="primary" title={`Submit ${props.paperLabel}?`} confirmLabel={`Submit ${students.length} marks`} onConfirm={submit}>
                <p>After submitting you cannot change these marks. A change then needs a reason and an approval.</p>
              </ConfirmButton>
            ) : <span className="text-sm text-ink-2">Submit when every student has marks{gradeOnly ? " (a grade)" : ""} or Absent: {students.length - done} to go.</span>
          )}
        </div>
      </div>

      {/* Computers: the keyboard grid. On phones only in List view. */}
      <div className={`${mode === "list" ? "block" : "hidden"} md:block`}>
        <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface md:block">
          <table className="w-full text-left text-[15px]">
            <caption className="sr-only">Marks for {props.paperLabel}. Enter moves down; A marks absent.</caption>
            <thead className="border-b border-line bg-surface-2 text-sm text-ink-2">
              <tr>
                <th scope="col" className="w-14 px-3 py-2 font-medium">Roll</th>
                <th scope="col" className="px-3 py-2 font-medium">Student</th>
                {gradeOnly ? <th scope="col" className="px-3 py-2 font-medium">Grade</th> : cats.map((c) => <th key={c.name} scope="col" className="w-28 px-3 py-2 font-medium">{cats.length === 1 ? "Marks" : c.name} / {c.max}</th>)}
                {!gradeOnly && <th scope="col" className="w-20 px-3 py-2 font-medium">Total</th>}
                {!gradeOnly && <th scope="col" className="w-16 px-3 py-2 font-medium">Grade</th>}
                <th scope="col" className="w-20 px-3 py-2 font-medium">Absent</th>
                <th scope="col" className="px-3 py-2 font-medium">Remark</th>
                {props.canRequest && <th scope="col" className="px-3 py-2"><span className="sr-only">Change</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {students.map((s, i) => {
                const r = rows[s.id];
                const t = totals[s.id];
                const bad = dirty.has(s.id) ? problemOf(s.name, r) : null;
                return (
                  <tr key={s.id} className={bad ? "bg-danger-soft/40" : ""}>
                    <td className="px-3 py-1.5 tabular-nums text-ink-2">{s.rollNo ?? ""}</td>
                    <th scope="row" className="px-3 py-1.5 font-medium">{s.name}{s.waiting && <span className="ml-2 text-xs font-normal text-warn-text">change waiting</span>}</th>
                    {gradeOnly ? (
                      <td className="px-3 py-1.5">
                        {canEdit ? (
                          <select data-cell={`${i}:0`} aria-label={`${s.name} grade`} value={r.grade} disabled={r.absent} onChange={(e) => change(s.id, { ...r, grade: e.target.value })} onKeyDown={(e) => onKey(e, i, 0)} className="h-10 w-24 rounded-lg border border-line-strong bg-surface px-2 disabled:bg-surface-2">
                            <option value="">-</option>
                            {gradeList.map((g) => <option key={g} value={g}>{g}</option>)}
                          </select>
                        ) : r.grade || (r.absent ? "AB" : "")}
                      </td>
                    ) : cats.map((c, k) => {
                      const v = num(r.parts[c.name] ?? "");
                      const cellBad = !r.absent && checkMark(c.name, c.max, v);
                      return (
                        <td key={c.name} className="px-3 py-1.5">
                          {canEdit ? (
                            <input data-cell={`${i}:${k}`} inputMode="decimal" autoComplete="off" aria-label={`${s.name} ${c.name}, out of ${c.max}`} aria-invalid={cellBad ? true : undefined}
                              value={r.parts[c.name] ?? ""} disabled={r.absent} onChange={(e) => setPart(s.id, c.name, e.target.value)} onKeyDown={(e) => onKey(e, i, k)} onFocus={(e) => e.currentTarget.select()}
                              className={`h-10 w-20 rounded-lg border bg-surface px-2 text-right tabular-nums disabled:bg-surface-2 ${cellBad ? "border-danger" : "border-line-strong"}`} />
                          ) : <span className="tabular-nums">{r.absent ? "AB" : r.parts[c.name]}</span>}
                        </td>
                      );
                    })}
                    {!gradeOnly && <td className="px-3 py-1.5 font-medium tabular-nums">{t.total !== null ? fmt(t.total) : r.absent ? "AB" : ""}</td>}
                    {!gradeOnly && <td className="px-3 py-1.5">{t.grade}</td>}
                    <td className="px-3 py-1.5">
                      <input type="checkbox" className="size-5 accent-[var(--brand)]" aria-label={`${s.name} absent`} checked={r.absent} disabled={!canEdit} onChange={(e) => setAbsent(s.id, e.target.checked)} />
                    </td>
                    <td className="px-3 py-1.5">
                      {canEdit ? <input aria-label={`${s.name} remark`} maxLength={200} value={r.remark} onChange={(e) => change(s.id, { ...r, remark: e.target.value })} className="h-10 w-full min-w-32 rounded-lg border border-line-strong bg-surface px-2 text-sm" /> : <span className="text-sm">{r.remark}</span>}
                    </td>
                    {props.canRequest && <td className="px-3 py-1.5 text-right"><ChangeButton {...props} student={s} /></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Phones: compact list with the number pad */}
        <ul className="space-y-2 md:hidden">
          {students.map((s, i) => {
            const r = rows[s.id];
            const t = totals[s.id];
            const bad = dirty.has(s.id) ? problemOf(s.name, r) : null;
            return (
              <li key={s.id} className={`rounded-xl border bg-surface p-3 ${bad ? "border-danger" : "border-line"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{s.rollNo ? `${s.rollNo}. ` : ""}{s.name}</span>
                  <span className="text-sm tabular-nums text-ink-2">{t.total !== null ? `${fmt(t.total)}/${max} ${t.grade}` : r.absent ? "Absent" : gradeOnly ? r.grade : ""}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  {gradeOnly ? (
                    <select aria-label={`${s.name} grade`} value={r.grade} disabled={!canEdit || r.absent} onChange={(e) => change(s.id, { ...r, grade: e.target.value })} className="h-11 w-24 rounded-lg border border-line-strong bg-surface px-2">
                      <option value="">-</option>{gradeList.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  ) : cats.map((c, k) => (
                    <label key={c.name} className="text-xs text-ink-2">{cats.length === 1 ? `Out of ${c.max}` : `${c.name} /${c.max}`}
                      <input data-cell={`m${i}:${k}`} inputMode="decimal" enterKeyHint="next" autoComplete="off" value={r.parts[c.name] ?? ""} disabled={!canEdit || r.absent}
                        onChange={(e) => setPart(s.id, c.name, e.target.value)} className="mt-0.5 block h-11 w-20 rounded-lg border border-line-strong bg-surface px-2 text-right text-base tabular-nums text-ink disabled:bg-surface-2" />
                    </label>
                  ))}
                  <label className="flex min-h-11 items-center gap-2 px-1 text-sm">
                    <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={r.absent} disabled={!canEdit} onChange={(e) => setAbsent(s.id, e.target.checked)} /> Absent
                  </label>
                  {props.canRequest && <ChangeButton {...props} student={s} />}
                </div>
                {bad && <p className="mt-1 text-sm text-danger">{bad}</p>}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Phones: one student at a time with large number keys */}
      {mode === "single" && (
        <div className="md:hidden">
          <SingleStudent student={students[index]} row={rows[students[index].id]} total={totals[students[index].id]} cats={cats} max={max} gradeOnly={gradeOnly} gradeList={gradeList} canEdit={canEdit}
            position={`${index + 1} of ${students.length}`}
            problem={dirty.has(students[index].id) ? problemOf(students[index].name, rows[students[index].id]) : null}
            onPart={(cat, v) => setPart(students[index].id, cat, v)} onAbsent={(a) => setAbsent(students[index].id, a)}
            onGrade={(g) => change(students[index].id, { ...rows[students[index].id], grade: g })}
            onPrev={() => setIndex((x) => Math.max(0, x - 1))} onNext={() => setIndex((x) => Math.min(students.length - 1, x + 1))}
            first={index === 0} last={index === students.length - 1}
            jump={<select aria-label="Go to student" value={index} onChange={(e) => setIndex(Number(e.target.value))} className="h-11 max-w-[55%] rounded-lg border border-line-strong bg-surface px-2 text-sm">
              {students.map((s, i) => <option key={s.id} value={i}>{s.rollNo ? `${s.rollNo}. ` : ""}{s.name}{totals[s.id]?.done ? " ✓" : ""}</option>)}
            </select>} />
          {props.canRequest && <div className="mt-2"><ChangeButton {...props} student={students[index]} /></div>}
        </div>
      )}

      {students.some((s) => s.history.length) && (
        <details className="rounded-2xl border border-line bg-surface">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 font-medium">Change history</summary>
          <ul className="divide-y divide-line border-t border-line text-sm">
            {students.flatMap((s) => s.history.map((h, k) => (
              <li key={`${s.id}-${k}`} className="px-4 py-2"><strong>{s.name}</strong>: {h.before || "blank"} to {h.after} on {h.at}. Asked by {h.by || "a teacher"}, approved by {h.approvedBy || "the approver"}. Reason: {h.reason}</li>
            )))}
          </ul>
        </details>
      )}

      {canEdit && <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} {...props} onFill={fillFromSheet} />}
    </div>
  );
}

function SingleStudent({ student, row, total, cats, max, gradeOnly, gradeList, canEdit, position, problem, onPart, onAbsent, onGrade, onPrev, onNext, first, last, jump }: {
  student: GridStudent; row: Row; total: { total: number | null; grade: string; done: boolean }; cats: Cat[]; max: number; gradeOnly: boolean; gradeList: string[]; canEdit: boolean;
  position: string; problem: string | null; onPart: (cat: string, v: string) => void; onAbsent: (a: boolean) => void; onGrade: (g: string) => void;
  onPrev: () => void; onNext: () => void; first: boolean; last: boolean; jump: React.ReactNode;
}) {
  const [active, setActive] = useState(0);
  const [lastStudent, setLastStudent] = useState(student.id);
  if (lastStudent !== student.id) { setLastStudent(student.id); setActive(0); }
  const cat = cats[Math.min(active, cats.length - 1)];
  const value = row.parts[cat?.name] ?? "";
  const press = (k: string) => {
    if (!canEdit || row.absent) return;
    if (k === "back") onPart(cat.name, value.slice(0, -1));
    else if (k === "." && value.includes(".")) return;
    else onPart(cat.name, `${value}${k}`);
  };
  const next = () => { if (!gradeOnly && active < cats.length - 1) setActive(active + 1); else onNext(); };
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2"><span className="text-sm text-ink-2">{position}</span>{jump}</div>
      <p className="mt-2 text-xl font-semibold">{student.rollNo ? `${student.rollNo}. ` : ""}{student.name}</p>
      <p className="text-sm text-ink-2">{student.admissionNo}</p>
      {gradeOnly ? (
        <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="Grade">
          {gradeList.map((g) => (
            <button key={g} type="button" disabled={!canEdit || row.absent} aria-pressed={row.grade === g} onClick={() => onGrade(g)}
              className={`h-14 rounded-xl border text-xl font-semibold ${row.grade === g ? "border-brand bg-brand text-brand-ink" : "border-line-strong bg-surface"} disabled:opacity-50`}>{g}</button>
          ))}
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Mark categories">
            {cats.map((c, i) => (
              <button key={c.name} type="button" onClick={() => setActive(i)} aria-pressed={i === active}
                className={`min-w-24 flex-1 rounded-xl border p-2 text-left ${i === active ? "border-brand ring-2 ring-brand/30" : "border-line-strong"}`}>
                <span className="block text-xs text-ink-2">{cats.length === 1 ? "Marks" : c.name} / {c.max}</span>
                <span className="block text-2xl font-semibold tabular-nums" aria-live="polite">{row.absent ? "AB" : row.parts[c.name] || "–"}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm">Total: <strong className="tabular-nums">{total.total !== null ? `${fmt(total.total)} / ${max}` : "–"}</strong> {total.grade && <span className="ml-2">Grade <strong>{total.grade}</strong></span>}</p>
          {canEdit && (
            <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Number keys">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"].map((k) => (
                <button key={k} type="button" disabled={row.absent} onClick={() => press(k)} aria-label={k === "back" ? "Delete last digit" : k === "." ? "Half mark point" : k}
                  className="h-14 rounded-xl border border-line-strong bg-surface-2 text-2xl font-medium active:bg-brand-soft disabled:opacity-40">{k === "back" ? "⌫" : k}</button>
              ))}
            </div>
          )}
        </>
      )}
      {problem && <p role="alert" className="mt-2 text-sm text-danger">{problem}</p>}
      <label className="mt-3 flex min-h-11 items-center gap-3 text-[15px]">
        <input type="checkbox" className="size-6 accent-[var(--brand)]" checked={row.absent} disabled={!canEdit} onChange={(e) => onAbsent(e.target.checked)} /> Absent
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="lg" onClick={onPrev} disabled={first}>Previous</Button>
        <Button variant="primary" size="lg" onClick={next} disabled={last && (gradeOnly || active >= cats.length - 1)}>Next</Button>
      </div>
    </div>
  );
}

function ChangeButton({ entryId, sectionId, categories: cats, gradeOnly, gradeList, student }: Props & { student: GridStudent }) {
  if (student.waiting) return <span className="text-xs text-warn-text">Change waiting for approval</span>;
  return (
    <FormDialog trigger="Request a change" triggerSize="sm" triggerVariant="ghost" title={`Change marks: ${student.name}`} action={requestChangeAction} submitLabel="Send for approval" hidden={{ entryId, sectionId, studentId: student.id }}>
      {(state) => (
        <>
          <p className="text-ink-2">Marks are submitted. A change needs a reason and an approval. The old marks stay in the history.</p>
          <p className="text-sm">Now: {student.absent ? "Absent" : gradeOnly ? student.grade ?? "no grade" : cats.map((c) => `${cats.length === 1 ? "Marks" : c.name} ${student.parts[c.name] ?? "-"}`).join(", ")}</p>
          {gradeOnly ? (
            <label className="block text-sm font-medium">New grade
              <select name="grade" defaultValue={state?.values?.grade ?? student.grade ?? ""} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-surface px-3 font-normal">
                <option value="">Choose</option>{gradeList.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
          ) : (
            <div className="flex flex-wrap gap-3">
              {cats.map((c) => (
                <label key={c.name} className="text-sm font-medium">{cats.length === 1 ? "New marks" : c.name} (out of {c.max})
                  <input name={`part:${c.name}`} inputMode="decimal" defaultValue={state?.values?.[`part:${c.name}`] ?? student.parts[c.name] ?? ""} className="mt-1 block h-11 w-28 rounded-lg border border-line-strong bg-surface px-3 font-normal" />
                </label>
              ))}
            </div>
          )}
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="absent" defaultChecked={student.absent} className="size-5 accent-[var(--brand)]" /> Absent</label>
          {err(state, "value") && <p className="text-sm text-danger">{err(state, "value")}</p>}
          <label className="block text-sm font-medium">Reason
            <textarea name="reason" required rows={3} defaultValue={state?.values?.reason ?? ""} placeholder="For example: Totalling mistake on page 3" className="mt-1 block w-full rounded-lg border border-line-strong bg-surface px-3 py-2 font-normal" />
          </label>
          {err(state, "reason") && <p className="text-sm text-danger">{err(state, "reason")}</p>}
        </>
      )}
    </FormDialog>
  );
}

function ImportDialog({ open, onClose, entryId, sectionId, paperLabel, students, categories: cats, gradeOnly, onFill }: Props & { open: boolean; onClose: () => void; onFill: (rows: ImportedRow[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ rows: ImportedRow[]; skipped: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const template = () => {
    const head = ["Roll no", "Admission no", "Name", ...(gradeOnly ? ["Grade"] : cats.map((c) => `${c.name} (${c.max})`)), "Absent"];
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = [head.map(q).join(","), ...students.map((s) => [String(s.rollNo ?? ""), s.admissionNo, s.name, ...(gradeOnly ? [""] : cats.map(() => "")), ""].map(q).join(","))];
    const url = URL.createObjectURL(new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `marks-${paperLabel.replace(/[^\w]+/g, "-").toLowerCase()}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Dialog open={open} onClose={() => { setResult(null); setError(null); onClose(); }} title="Import marks from Excel">
      <div className="space-y-4">
        <ol className="list-decimal space-y-1 pl-5 text-ink-2">
          <li><button type="button" className="font-medium text-brand-text underline" onClick={template}>Download the template</button> with your students in roll order.</li>
          <li>Fill the marks. Type Yes in Absent for a student who missed the paper.</li>
          <li>Choose the file. The marks fill the grid for you to check; they save as usual.</li>
        </ol>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setError(null); setResult(null);
          const fd = new FormData(e.currentTarget);
          fd.set("entryId", entryId); fd.set("sectionId", sectionId);
          try {
            const r = await readMarksSheet(fd);
            if (r.ok) setResult({ rows: r.rows, skipped: r.skipped }); else setError(r.message);
          } catch { setError("The file could not be sent. Check the internet connection and try again."); }
          setBusy(false);
        }}>
          <input type="file" name="file" required accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-line-strong file:bg-surface file:px-3" />
          <Button type="submit" variant="secondary" loading={busy} loadingText="Reading…">Read file</Button>
        </form>
        {error && <Alert tone="danger">{error}</Alert>}
        {result && (
          <div className="space-y-2">
            <Alert tone="success">{result.rows.length} students found in the file.</Alert>
            {result.skipped.length > 0 && <ul className="list-disc pl-5 text-sm text-warn-text">{result.skipped.map((s) => <li key={s}>{s}</li>)}</ul>}
            <div className="flex justify-end gap-2 border-t border-line pt-3">
              <Button variant="secondary" onClick={() => { setResult(null); onClose(); }}>Cancel</Button>
              <Button onClick={() => { onFill(result.rows); setResult(null); onClose(); }}>Fill the grid</Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
