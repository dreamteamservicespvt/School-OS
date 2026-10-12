"use client";

// The marks grid (08 §2 Marks Entry, approved design mod-exams MarksGrid):
// students in roll order down the side, mark categories across, the total
// and grade worked out as marks are typed. AB is absent, ML is medical leave.
// Each change saves by itself; when the phone is offline the marks wait on
// this device and save when it is back online. "One at a time" shows one
// student with large number keys, for phones.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MarksPaperStatus } from "@prisma/client";
import {
  BadgeCheck, Calculator, ChevronLeft, ChevronRight, Circle, CircleAlert, CircleCheck, Delete, FileSpreadsheet, History, Hourglass, Info,
  ListChecks, Lock, Save, Send, Smartphone, Stethoscope, Table, TriangleAlert, UserPen, UserX,
} from "lucide-react";
import { Button, Spinner } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill, type PillTone } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/controls";
import { Kbd } from "@/components/ui/display";
import { Banner, Stats, Timeline, TONE_SOFT } from "@/components/ui/kit";
import { inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { checkMark } from "@/lib/exams/compute";
import { bandFor, type Band } from "@/lib/exams/grades";
import type { FormState } from "@/lib/forms";
import { ActionSheet } from "../_components/sheets";
import { readMarksSheet, requestChangeAction, saveMarksAction, submitPaperAction, type ImportedRow } from "./actions";

export type GridStudent = {
  id: string; name: string; rollNo: number | null; admissionNo: string;
  parts: Record<string, number>; absent: boolean; medical: boolean; grade: string | null; remark: string | null; waiting: boolean;
  history: { at: string; by: string; approvedBy: string; reason: string; before: string; after: string }[];
};

export type PaperHead = {
  title: string; sectionShort: string; examTitle: string; paperOn: string; teachers: string; dueText: string | null;
  statusWords: string; statusTone: PillTone; onBehalf: boolean; approver: string;
};

type Cat = { name: string; max: number };
type Row = { parts: Record<string, string>; absent: boolean; medical: boolean; grade: string; remark: string };
type Props = {
  entryId: string; sectionId: string; paperLabel: string; students: GridStudent[]; categories: Cat[]; gradeOnly: boolean; gradeList: string[]; bands: Band[];
  status: MarksPaperStatus; canEdit: boolean; canRequest: boolean; head: PaperHead; actions?: React.ReactNode; notes?: React.ReactNode;
};

const num = (s: string) => (s.trim() === "" ? null : Number(s.trim()));
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));
const code = (r: { absent: boolean; medical: boolean }) => (r.absent ? (r.medical ? "ML" : "AB") : "");

function rowOf(s: GridStudent, cats: Cat[]): Row {
  return { parts: Object.fromEntries(cats.map((c) => [c.name, s.parts[c.name] !== undefined && s.parts[c.name] !== null ? String(s.parts[c.name]) : ""])), absent: s.absent, medical: s.absent && s.medical, grade: s.grade ?? "", remark: s.remark ?? "" };
}

/** Grade colour by its place in the school's scale: top grades green, failing red. */
function toneOf(grade: string, bands: Band[]): PillTone {
  const sorted = [...bands].sort((a, b) => b.from - a.from);
  const i = sorted.findIndex((b) => b.grade === grade);
  if (i < 0) return "neutral";
  if (!sorted[i].passing) return "bad";
  return i < sorted.length / 3 ? "ok" : i < (2 * sorted.length) / 3 ? "brand" : "warn";
}

export function MarksGrid(props: Props) {
  const { entryId, sectionId, students, categories: cats, gradeOnly, gradeList, bands, canEdit, canRequest, head } = props;
  const storeKey = `sos-marks:${entryId}:${sectionId}`;
  const max = cats.reduce((s, c) => s + c.max, 0);
  const [rows, setRows] = useState<Record<string, Row>>(() => Object.fromEntries(students.map((s) => [s.id, rowOf(s, cats)])));
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [save, setSave] = useState<{ state: "idle" | "saving" | "saved" | "offline" | "error"; message?: string; at?: Date }>({ state: "idle" });
  const [view, setView] = useState<"grid" | "one">("grid");
  const [typing, setTyping] = useState<{ key: string; text: string } | null>(null);
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [ask, setAsk] = useState<GridStudent | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const rowsRef = useRef(rows);
  const dirtyRef = useRef(dirty);
  useEffect(() => { rowsRef.current = rows; dirtyRef.current = dirty; }, [rows, dirty]);

  // Problems per student, checked as typed (the server checks again).
  const problemOf = useCallback((r: Row): string | null => {
    const entered = Object.values(r.parts).some((x) => x.trim() !== "");
    if (r.absent && (entered || r.grade)) return `marked ${r.medical ? "ML" : "AB"} and also has marks. Remove one.`;
    if (gradeOnly) return r.grade && !gradeList.includes(r.grade) ? `choose a grade from ${gradeList.join(", ")}.` : null;
    for (const c of cats) {
      const v = num(r.parts[c.name] ?? "");
      if (v !== null && Number.isNaN(v)) return `${cats.length === 1 ? "the mark" : c.name} is not a number.`;
      const p = checkMark(cats.length === 1 ? "This paper" : c.name, c.max, v);
      if (p) return p;
    }
    return null;
  }, [cats, gradeOnly, gradeList]);

  const totals = useMemo(() => Object.fromEntries(students.map((s) => {
    const r = rows[s.id];
    if (!r || r.absent) return [s.id, { total: null as number | null, grade: "", done: Boolean(r?.absent) }];
    if (gradeOnly) return [s.id, { total: null, grade: r.grade, done: Boolean(r.grade) }];
    const vals = cats.map((c) => num(r.parts[c.name] ?? ""));
    if (vals.some((v) => v === null || Number.isNaN(v))) return [s.id, { total: null, grade: "", done: false }];
    const total = vals.reduce((a: number, b) => a + (b as number), 0);
    return [s.id, { total, grade: max ? bandFor((total / max) * 100, bands)?.grade ?? "" : "", done: !problemOf(r) }];
  })), [rows, students, cats, gradeOnly, max, bands, problemOf]);

  const done = students.filter((s) => totals[s.id]?.done).length;
  const ab = students.filter((s) => rows[s.id].absent && !rows[s.id].medical).length;
  const ml = students.filter((s) => rows[s.id].absent && rows[s.id].medical).length;
  const problems = students.map((s) => ({ s, e: problemOf(rows[s.id]) })).filter((x) => x.e);
  const blanks = students.filter((s) => !totals[s.id]?.done && !problemOf(rows[s.id]));
  const marked = students.map((s) => totals[s.id]?.total).filter((t): t is number => t !== null && t !== undefined);
  const average = marked.length ? fmt(Math.round((marked.reduce((a, b) => a + b, 0) / marked.length) * 10) / 10) : null;

  // Save what changed. Rows with a problem wait until they are fixed.
  const flush = useCallback(async () => {
    if (saving.current) return;
    const ids = [...dirtyRef.current].filter((id) => !problemOf(rowsRef.current[id]));
    if (ids.length === 0) return;
    const payload = ids.map((id) => {
      const r = rowsRef.current[id];
      return { studentId: id, parts: Object.fromEntries(cats.map((c) => [c.name, num(r.parts[c.name] ?? "")])), absent: r.absent, medical: r.absent && r.medical, grade: r.grade || null, remark: r.remark || null };
    });
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
  }, [cats, entryId, sectionId, storeKey, problemOf]);

  // Marks typed earlier on this device that did not reach the school yet.
  useEffect(() => {
    const start = setTimeout(() => {
      try {
        const kept = JSON.parse(localStorage.getItem(storeKey) ?? "{}") as Record<string, Row>;
        const ids = Object.keys(kept).filter((id) => students.some((s) => s.id === id));
        if (ids.length && canEdit) {
          setRows((r) => ({ ...r, ...Object.fromEntries(ids.map((id) => [id, { ...kept[id], medical: Boolean(kept[id].medical) }])) }));
          setDirty(new Set(ids));
          setSave({ state: "offline", message: `${ids.length} unsaved ${ids.length === 1 ? "change" : "changes"} from this device. Saving now.` });
          setTimeout(() => void flush(), 300);
        } else if (!canEdit) localStorage.removeItem(storeKey);
      } catch { /* storage may be blocked */ }
      if (window.matchMedia("(max-width: 767px)").matches && canEdit) setView("one");
    }, 0);
    const online = () => void flush();
    window.addEventListener("online", online);
    const retry = setInterval(() => { if (dirtyRef.current.size && navigator.onLine) void flush(); }, 20000);
    return () => { clearTimeout(start); window.removeEventListener("online", online); clearInterval(retry); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving with unsaved marks asks first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirtyRef.current.size) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  function change(id: string, next: Row) {
    rowsRef.current = { ...rowsRef.current, [id]: next };
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

  const blank = () => Object.fromEntries(cats.map((c) => [c.name, ""]));
  /** Sets one cell from what was typed: a mark, AB, ML, or nothing. */
  function setCell(id: string, cat: string, text: string) {
    const r = rowsRef.current[id];
    if (text === "AB" || text === "ML") return change(id, { ...r, absent: true, medical: text === "ML", parts: blank(), grade: "" });
    if (r.absent) return change(id, { ...r, absent: false, medical: false, parts: { ...blank(), [cat]: text } });
    change(id, { ...r, parts: { ...r.parts, [cat]: text } });
  }
  function setGrade(id: string, g: string) {
    const r = rowsRef.current[id];
    if (g === "AB" || g === "ML") return change(id, { ...r, absent: true, medical: g === "ML", grade: "", parts: blank() });
    change(id, { ...r, absent: false, medical: false, grade: g });
  }
  /** What a cell shows: the text being typed, AB or ML, or the mark. */
  const shown = (id: string, cat: string) => (typing?.key === `${id}:${cat}` ? typing.text : rows[id].absent ? code(rows[id]) : rows[id].parts[cat] ?? "");
  function type(id: string, cat: string, raw: string) {
    const text = raw.toUpperCase().replace(/[^0-9.ABML]/g, "").slice(0, 5);
    setTyping({ key: `${id}:${cat}`, text });
    if (text === "" || /^\d*\.?\d*$/.test(text) || text === "AB" || text === "ML") setCell(id, cat, text);
  }
  function settle(id: string, cat: string) {
    if (!typing || typing.key !== `${id}:${cat}`) return;
    const t = typing.text;
    if (t === "A") setCell(id, cat, "AB");
    else if (t === "M") setCell(id, cat, "ML");
    setTyping(null);
  }

  // Keyboard: Enter or Down goes to the same column of the next student; Up to the one above.
  function onKey(e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>, row: number, col: number, id: string, cat: string) {
    const go = (r: number) => {
      const el = document.querySelector<HTMLElement>(`[data-cell="${r}:${col}"]`);
      if (el) { e.preventDefault(); settle(id, cat); el.focus(); if (el instanceof HTMLInputElement) el.select(); }
    };
    if (e.key === "Enter" || e.key === "ArrowDown") go(e.shiftKey && e.key === "Enter" ? row - 1 : row + 1);
    else if (e.key === "ArrowUp") go(row - 1);
  }

  async function submit() {
    if (dirty.size) {
      await flush();
      if (dirtyRef.current.size) return "Some marks are not saved yet. Check the message at the bottom, then try again.";
    }
    const e = await submitPaperAction(entryId, sectionId);
    if (!e) { try { localStorage.removeItem(storeKey); } catch { /* ignore */ } }
    return e;
  }
  const trySubmit = () => { setTried(true); if (problems.length || blanks.length) return; setConfirm(true); };

  function fillFromSheet(list: ImportedRow[]) {
    for (const x of list) {
      const r = rowsRef.current[x.studentId];
      if (!r) continue;
      const next: Row = x.absent ? { ...r, absent: true, medical: false, parts: blank(), grade: "" } : {
        ...r, absent: false, medical: false,
        parts: Object.fromEntries(cats.map((c) => [c.name, x.parts[c.name] === null || x.parts[c.name] === undefined || Number.isNaN(x.parts[c.name]) ? r.parts[c.name] ?? "" : String(x.parts[c.name])])),
        grade: gradeOnly ? x.grade ?? r.grade : r.grade,
      };
      change(x.studentId, next);
    }
  }

  const history = students.flatMap((s) => s.history.map((h) => ({ s, h })));
  const allSubmitted = props.status === "SUBMITTED" || props.status === "LOCKED";
  const catPill = (c: Cat) => (
    <Pill key={c.name} tone={allSubmitted ? "ok" : canEdit ? "warn" : "neutral"}>
      {allSubmitted && <Lock size={12} aria-hidden="true" />}{cats.length === 1 ? "Marks" : c.name} / {c.max}{allSubmitted ? (props.status === "LOCKED" ? " locked" : " submitted") : canEdit ? " open" : ""}
    </Pill>
  );

  return (
    <div className={canEdit ? "pb-4" : undefined}>
      <div className="flex flex-col gap-5">
        <Card className="p-4 md:p-5 flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex items-start gap-4 min-w-0 flex-1">
            <span className={cx("w-12 h-12 rounded-2xl grid place-items-center shrink-0 font-semibold text-[14px]", TONE_SOFT[allSubmitted ? "ok" : "brand"])}>{head.sectionShort}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-[22px] md:text-[26px] font-semibold tracking-tight leading-tight">{head.title}</h1>
                {gradeOnly ? <Pill tone={allSubmitted ? "ok" : canEdit ? "warn" : "neutral"}>Graded</Pill> : cats.map(catPill)}
              </div>
              <p className="text-[13.5px] text-ink3 mt-0.5">{head.examTitle} · paper {head.paperOn} · {head.teachers} · {students.length} {students.length === 1 ? "student" : "students"}{head.dueText ? ` · ${head.dueText}` : ""}</p>
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            {students.length > 0 && <Segmented size="sm" label="Layout" value={view} onChange={(v) => setView(v as "grid" | "one")} options={[{ value: "grid", label: "Grid", icon: Table }, { value: "one", label: "One at a time", icon: Smartphone }]} />}
            {canEdit && <Button variant="secondary" icon={FileSpreadsheet} className="hidden lg:inline-flex" onClick={() => setImportOpen(true)}>Import</Button>}
            {props.actions}
          </div>
        </Card>

        {props.notes}
        {head.onBehalf && canEdit && <Banner tone="brand" icon={UserPen} title={`You are entering marks for ${head.teachers}.`}>Each mark records your name in the change history.</Banner>}

        {students.length === 0 ? (
          <Alert>No students sit this paper. {gradeOnly ? "" : "If students chose this optional subject, record their choices in Student Management."}</Alert>
        ) : (
          <>
            <Stats items={[
              { label: gradeOnly ? "Graded" : "Entered", value: `${done} of ${students.length}`, tone: done === students.length ? "ok" : undefined, icon: ListChecks },
              { label: "Absent (AB)", value: ab, sub: "Counted as the school's rule says", icon: UserX },
              { label: "Medical (ML)", value: ml, sub: "Left out of the total", icon: Stethoscope },
              problems.length
                ? { label: "Need a fix", value: problems.length, tone: "bad", icon: TriangleAlert }
                : { label: "Class average", value: average !== null && !gradeOnly ? `${average} / ${max}` : "—", icon: Calculator },
            ]} />

            {problems.length > 0 && (
              <Banner tone="bad" title={`${problems.length} ${problems.length === 1 ? "mark needs" : "marks need"} a fix.`}>
                {problems.slice(0, 3).map((x) => `Roll ${x.s.rollNo ?? "–"}, ${x.s.name}: ${x.e}`).join(" ")}{problems.length > 3 ? ` And ${problems.length - 3} more.` : ""}
              </Banner>
            )}
            {tried && !problems.length && blanks.length > 0 && (
              <Banner tone="warn" title={`${blanks.length} ${blanks.length === 1 ? "student has" : "students have"} no ${gradeOnly ? "grade" : "mark"} yet:`}>
                {blanks.slice(0, 4).map((s) => `${s.name} (roll ${s.rollNo ?? "–"})`).join(", ")}{blanks.length > 4 ? ` and ${blanks.length - 4} more` : ""}. Type the mark, or AB for absent and ML for medical leave.
              </Banner>
            )}

            {view === "grid" ? (
              <Card className="overflow-hidden">
                {canEdit && (
                  <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap px-4 md:px-5 py-3 border-b border-line text-[12.5px] text-ink3">
                    <span className="flex items-center gap-1.5"><Kbd>Enter</Kbd> or <Kbd>↓</Kbd> next student</span>
                    <span className="flex items-center gap-1.5"><Kbd>↑</Kbd> back</span>
                    <span className="flex items-center gap-1.5"><Kbd>AB</Kbd> absent</span>
                    <span className="flex items-center gap-1.5"><Kbd>ML</Kbd> medical leave</span>
                    <span className="ml-auto">Empty means not entered yet</span>
                  </div>
                )}
                <div className="overflow-x-auto scroll-thin">
                  <table className="text-[13.5px] min-w-full">
                    <caption className="sr-only">Marks for {props.paperLabel}. Enter moves down. Type AB for absent, ML for medical leave.</caption>
                    <thead>
                      <tr className="border-b border-line text-ink3 text-[12px]">
                        <th scope="col" className="sticky left-0 z-10 bg-surface text-left font-semibold px-4 py-2.5 min-w-[190px]">Student</th>
                        {gradeOnly ? <th scope="col" className="font-semibold px-2 py-2.5 text-center min-w-[100px]"><span className="block text-ink2">Grade</span></th> : cats.map((c) => (
                          <th key={c.name} scope="col" className="font-semibold px-2 py-2.5 text-center min-w-[100px]">
                            <span className="block text-ink2">{cats.length === 1 ? "Marks" : c.name} / {c.max}</span>
                            <span className={cx("block text-[11px] font-medium", allSubmitted ? "text-ok" : canEdit ? "text-brand" : "")}>{allSubmitted ? (props.status === "LOCKED" ? "Locked" : "Submitted") : canEdit ? "Open" : "Not open"}</span>
                          </th>
                        ))}
                        {!gradeOnly && cats.length > 1 && <th scope="col" className="font-semibold px-3 py-2.5 text-right whitespace-nowrap">Total / {max}</th>}
                        {!gradeOnly && <th scope="col" className="font-semibold px-4 py-2.5 text-center">Grade</th>}
                        {canEdit && <th scope="col" className="font-semibold px-4 py-2.5 text-left">Remark</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s, i) => {
                        const r = rows[s.id];
                        const t = totals[s.id];
                        const bad = problemOf(r);
                        return (
                          <tr key={s.id} className="border-b border-line/60 last:border-0">
                            <th scope="row" className="sticky left-0 z-10 bg-surface px-4 py-1.5 whitespace-nowrap text-left font-normal">
                              <span className="text-ink3 tnum inline-block w-7">{s.rollNo ?? ""}</span><span className="font-medium">{s.name}</span>
                            </th>
                            {gradeOnly ? (
                              <td className="px-2 py-1.5 text-center">
                                {canEdit ? (
                                  <select data-cell={`${i}:0`} aria-label={`Grade for ${s.name}`} value={r.absent ? code(r) : r.grade} onChange={(e) => setGrade(s.id, e.target.value)} onKeyDown={(e) => onKey(e, i, 0, s.id, "")}
                                    className={cx("w-[88px] h-10 rounded-lg border text-center text-[15px] font-semibold bg-surface outline-none border-line focus:border-brand focus:ring-4 focus:ring-brand/15", r.absent && "text-info", tried && !t.done && "border-warn bg-warn/[.06]")}>
                                    <option value="">—</option>
                                    {gradeList.map((g) => <option key={g} value={g}>{g}</option>)}
                                    <option value="AB">AB</option><option value="ML">ML</option>
                                  </select>
                                ) : <LockedCell value={r.absent ? code(r) : r.grade} s={s} canRequest={canRequest} onAsk={setAsk} />}
                              </td>
                            ) : cats.map((c, k) => {
                              const v = shown(s.id, c.name);
                              const cellBad = !r.absent && (num(r.parts[c.name] ?? "") !== null && (Number.isNaN(num(r.parts[c.name] ?? "")) || checkMark(c.name, c.max, num(r.parts[c.name] ?? ""))));
                              return (
                                <td key={c.name} className="px-2 py-1.5 text-center">
                                  {canEdit ? (
                                    <input data-cell={`${i}:${k}`} inputMode="text" autoComplete="off" spellCheck={false} aria-label={`${cats.length === 1 ? "Marks" : c.name} for ${s.name}, out of ${c.max}`} aria-invalid={cellBad ? true : undefined}
                                      title={cellBad ? bad ?? undefined : undefined} value={v}
                                      onChange={(e) => type(s.id, c.name, e.target.value)} onBlur={() => settle(s.id, c.name)} onKeyDown={(e) => onKey(e, i, k, s.id, c.name)} onFocus={(e) => e.currentTarget.select()}
                                      className={cx("w-[72px] h-10 rounded-lg border text-center text-[15px] font-semibold tnum bg-surface outline-none transition",
                                        cellBad ? "border-bad ring-4 ring-bad/10 text-bad" : r.absent ? "border-line text-info" : "border-line focus:border-brand focus:ring-4 focus:ring-brand/15",
                                        tried && !t.done && !cellBad && v === "" && "border-warn bg-warn/[.06]")} />
                                  ) : <LockedCell value={r.absent ? code(r) : r.parts[c.name] ?? ""} s={s} canRequest={canRequest} onAsk={setAsk} />}
                                </td>
                              );
                            })}
                            {!gradeOnly && cats.length > 1 && <td className="px-3 text-right font-semibold tnum">{t.total !== null ? fmt(t.total) : r.absent ? <span className="text-info">{code(r)}</span> : <span className="text-ink3 font-normal">—</span>}</td>}
                            {!gradeOnly && (
                              <td className="px-4 text-center">
                                {r.absent ? <Pill tone="info" className="!h-5 !text-[11px]">{code(r)}</Pill> : t.grade ? <Pill tone={toneOf(t.grade, bands)} className="!h-5 !text-[11px]">{t.grade}</Pill> : <span className="text-ink3">—</span>}
                              </td>
                            )}
                            {canEdit && (
                              <td className="px-4 py-1.5">
                                <input aria-label={`Remark for ${s.name}`} maxLength={200} value={r.remark} placeholder="Optional" onChange={(e) => change(s.id, { ...r, remark: e.target.value })}
                                  className="h-10 w-full min-w-40 rounded-lg border border-line bg-surface px-2.5 text-[13px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : (
              <OneAtATime students={students} rows={rows} cats={cats} gradeOnly={gradeOnly} gradeList={gradeList} canEdit={canEdit} canRequest={canRequest} totals={totals} max={max} bands={bands}
                problemOf={problemOf} setCell={setCell} setGrade={setGrade} onAsk={setAsk} />
            )}
          </>
        )}

        {history.length > 0 && (
          <Card>
            <CardHeader title="Change history" description="Marks changed after they were submitted. Nothing is overwritten." icon={History} />
            <div className="px-5">
              <Timeline items={history.map(({ s, h }) => ({
                icon: h.approvedBy ? BadgeCheck : Hourglass, tone: h.approvedBy ? "ok" as const : "warn" as const,
                what: <><b className="font-semibold">{s.name}</b>: {h.before || "blank"} → {h.after}. “{h.reason}” · asked by {h.by || "a teacher"}{h.approvedBy ? `, approved by ${h.approvedBy}` : ""}</>,
                when: h.at,
              }))} />
            </div>
          </Card>
        )}
      </div>

      {canEdit && students.length > 0 && (
        <div className="sticky bottom-16 md:bottom-0 mt-4 -mx-4 md:mx-0 px-4 md:px-0 pb-3 pt-3 bg-gradient-to-t from-bg via-bg to-bg/0 z-20">
          <div className="flex items-center gap-2 bg-surface border border-line rounded-2xl shadow-pop p-2 pl-4" aria-live="polite">
            <p className={cx("text-[12.5px] flex-1 min-w-0 truncate hidden sm:flex items-center gap-1.5", save.state === "error" ? "text-bad" : save.state === "offline" ? "text-warn" : "text-ink3")}>
              {save.state === "saving" ? <><Spinner size={13} />Saving…</>
                : save.state === "offline" || save.state === "error" ? <><CircleAlert size={13} aria-hidden="true" />{save.message}</>
                : dirty.size ? <><Circle size={8} className="text-warn fill-current" aria-hidden="true" />Saved on this device as you type</>
                : <><CircleCheck size={13} className="text-ok" aria-hidden="true" />{save.at ? `All marks saved at ${save.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Marks save as you type"}</>}
            </p>
            <Button variant="secondary" icon={Save} className="flex-1 sm:flex-none" onClick={() => void flush()} disabled={!dirty.size}>Save now</Button>
            <Button variant="primary" icon={Send} className="flex-1 sm:flex-none" onClick={trySubmit}>Submit marks</Button>
          </div>
        </div>
      )}

      <ActionSheet open={confirm} onClose={() => setConfirm(false)} title={`Submit ${props.paperLabel} marks?`} confirmLabel={`Submit ${students.length} marks`} confirmIcon={<Send size={16} />} pendingText="Submitting…" run={submit}>
        <div className="flex flex-col gap-3 text-[14px] text-ink2">
          <p>{head.examTitle} · {props.paperLabel}.</p>
          <ul className="grid grid-cols-3 gap-2 text-center">
            <li className="rounded-xl bg-sunken/70 py-2.5"><b className="block font-display text-[20px] text-ink tnum">{students.length - ab - ml}</b><span className="text-[12px]">with marks</span></li>
            <li className="rounded-xl bg-sunken/70 py-2.5"><b className="block font-display text-[20px] text-ink tnum">{ab}</b><span className="text-[12px]">absent (AB)</span></li>
            <li className="rounded-xl bg-sunken/70 py-2.5"><b className="block font-display text-[20px] text-ink tnum">{ml}</b><span className="text-[12px]">medical (ML)</span></li>
          </ul>
          <p>After this, you cannot change these marks. A correction needs a reason and approval from {head.approver}, and the old mark is kept.</p>
        </div>
      </ActionSheet>
      {ask && <ChangeSheet {...props} student={ask} onClose={() => setAsk(null)} />}
      {canEdit && <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} {...props} onFill={fillFromSheet} />}
    </div>
  );
}

function LockedCell({ value, s, canRequest, onAsk }: { value: string; s: GridStudent; canRequest: boolean; onAsk: (s: GridStudent) => void }) {
  const isCode = value === "AB" || value === "ML";
  if (!canRequest) return <span className={cx("inline-grid place-items-center w-[72px] h-10 rounded-lg bg-sunken/50 font-semibold tnum", isCode ? "text-info" : value ? "text-ink" : "text-ink3")}>{value || "—"}</span>;
  return (
    <button type="button" onClick={() => onAsk(s)} disabled={s.waiting} title={s.waiting ? "A change is waiting for approval." : "Submitted. Tap to ask for a change."}
      aria-label={`${s.name}: ${value || "no mark"}. ${s.waiting ? "A change is waiting for approval." : "Ask for a change."}`}
      className={cx("w-[72px] h-10 rounded-lg inline-flex items-center justify-center gap-1 font-semibold tnum transition", s.waiting ? "bg-warn/12 text-warn" : "bg-sunken/70 hover:bg-sunken", isCode && !s.waiting && "text-info")}>
      {s.waiting ? <Hourglass size={12} aria-hidden="true" /> : <Lock size={11} className="text-ink3" aria-hidden="true" />}{value || "—"}
    </button>
  );
}

function OneAtATime({ students, rows, cats, gradeOnly, gradeList, canEdit, canRequest, totals, max, bands, problemOf, setCell, setGrade, onAsk }: {
  students: GridStudent[]; rows: Record<string, Row>; cats: Cat[]; gradeOnly: boolean; gradeList: string[]; canEdit: boolean; canRequest: boolean;
  totals: Record<string, { total: number | null; grade: string; done: boolean }>; max: number; bands: Band[];
  problemOf: (r: Row) => string | null; setCell: (id: string, cat: string, text: string) => void; setGrade: (id: string, g: string) => void; onAsk: (s: GridStudent) => void;
}) {
  const [i, setI] = useState(() => Math.max(0, students.findIndex((s) => !totals[s.id]?.done)));
  const [k, setK] = useState(0);
  const s = students[Math.min(i, students.length - 1)];
  const r = rows[s.id];
  const c = cats[Math.min(k, cats.length - 1)];
  const v = r.absent ? code(r) : c ? r.parts[c.name] ?? "" : "";
  const e = canEdit ? problemOf(r) : null;
  const t = totals[s.id];
  const go = (n: number) => { setI(n); setK(0); };
  const press = (key: string) => {
    if (!canEdit || !c) return;
    if (key === "AB" || key === "ML") return setCell(s.id, c.name, key);
    if (key === "del") return setCell(s.id, c.name, r.absent ? "" : v.slice(0, -1));
    if (key === ".5") return r.absent || v.includes(".") ? undefined : setCell(s.id, c.name, `${v || "0"}.5`);
    setCell(s.id, c.name, r.absent ? key : `${v}${key}`.slice(0, 5));
  };
  return (
    <Card className="p-4 md:p-6 max-w-xl w-full mx-auto">
      <div className="flex items-center gap-3">
        <Avatar name={s.name} size={48} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[16px] truncate">{s.name}</p>
          <p className="text-[13px] text-ink3">{s.rollNo ? `Roll ${s.rollNo} · ` : ""}{i + 1} of {students.length} · <span className="font-mono text-[12px]">{s.admissionNo}</span></p>
        </div>
        <select aria-label="Go to student" value={i} onChange={(ev) => go(Number(ev.target.value))} className={cx(inputCls(), "!h-10 !w-auto max-w-[40%] text-[13px]")}>
          {students.map((x, n) => <option key={x.id} value={n}>{x.rollNo ? `${x.rollNo}. ` : ""}{x.name}{totals[x.id]?.done ? " ✓" : ""}</option>)}
        </select>
      </div>
      {gradeOnly ? (
        <>
          <div className="rounded-2xl border-2 border-brand bg-brand/5 p-3 mt-4">
            <span className="text-[12px] text-ink3 font-semibold flex items-center gap-1">{!canEdit && <Lock size={11} aria-hidden="true" />}Grade</span>
            <span className={cx("block font-display text-[28px] font-semibold leading-tight", r.absent && "text-info")} aria-live="polite">{r.absent ? code(r) : r.grade || "—"}</span>
          </div>
          {canEdit ? (
            <div className="grid grid-cols-3 gap-2 mt-4" role="group" aria-label="Grades">
              {[...gradeList, "AB", "ML"].map((g) => (
                <button key={g} type="button" aria-pressed={(r.absent ? code(r) : r.grade) === g} onClick={() => setGrade(s.id, g)}
                  className={cx("h-14 rounded-xl border text-[18px] font-semibold transition", (r.absent ? code(r) : r.grade) === g ? "border-brand bg-brand text-brandink" : "border-line hover:bg-sunken/60", (g === "AB" || g === "ML") && (r.absent ? code(r) : r.grade) !== g && "text-info")}>{g}</button>
              ))}
            </div>
          ) : canRequest && <Button variant="secondary" className="mt-4 w-full" disabled={s.waiting} onClick={() => onAsk(s)}>{s.waiting ? "A change is waiting for approval" : "Ask for a change"}</Button>}
        </>
      ) : (
        <>
          <div className={cx("grid gap-2 mt-4", cats.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
            {cats.map((x, n) => {
              const xv = r.absent ? code(r) : r.parts[x.name] ?? "";
              const xBad = !r.absent && xv !== "" && (Number.isNaN(Number(xv)) || Boolean(checkMark(x.name, x.max, Number(xv))));
              return (
                <button key={x.name} type="button" onClick={() => (canEdit ? setK(n) : canRequest && !s.waiting ? onAsk(s) : undefined)} aria-pressed={k === n}
                  className={cx("rounded-2xl border-2 p-3 text-left transition", k === n && canEdit ? "border-brand bg-brand/5" : "border-line")}>
                  <span className="text-[12px] text-ink3 font-semibold flex items-center gap-1">{!canEdit && <Lock size={11} aria-hidden="true" />}{cats.length === 1 ? "Marks" : x.name} / {x.max}</span>
                  <span className={cx("block font-display text-[28px] font-semibold tnum leading-tight", xBad && "text-bad", r.absent && "text-info")} aria-live="polite">{xv || "—"}</span>
                </button>
              );
            })}
          </div>
          {cats.length > 1 && <p className="mt-2 text-[13.5px] text-ink2">Total <b className="tnum text-ink">{t.total !== null ? `${fmt(t.total)} / ${max}` : "—"}</b>{t.grade && <> · Grade <Pill tone={toneOf(t.grade, bands)} className="!h-5 !text-[11px]">{t.grade}</Pill></>}</p>}
          {cats.length === 1 && t.grade && <p className="mt-2 text-[13.5px] text-ink2">Grade <Pill tone={toneOf(t.grade, bands)} className="!h-5 !text-[11px]">{t.grade}</Pill></p>}
          {e && <p className="text-[13px] text-bad flex items-center gap-1.5 mt-2" role="alert"><CircleAlert size={15} aria-hidden="true" />{s.name} {e}</p>}
          {canEdit ? (
            <div className="grid grid-cols-3 gap-2 mt-4" role="group" aria-label="Number keys">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "AB", "0", "ML"].map((key) => (
                <button key={key} type="button" onClick={() => press(key)}
                  className={cx("h-14 rounded-xl border border-line text-[20px] font-semibold tnum active:bg-sunken hover:bg-sunken/60 transition", (key === "AB" || key === "ML") && "text-info !text-[16px]")}>{key}</button>
              ))}
              <button type="button" onClick={() => press(".5")} aria-label="Add a half mark" className="h-12 rounded-xl border border-line text-[15px] font-semibold hover:bg-sunken/60">½</button>
              <button type="button" onClick={() => setCell(s.id, c.name, "")} className="h-12 rounded-xl border border-line text-[14px] font-semibold text-ink2 hover:bg-sunken/60">Clear</button>
              <button type="button" onClick={() => press("del")} aria-label="Delete last digit" className="h-12 rounded-xl border border-line grid place-items-center hover:bg-sunken/60"><Delete size={20} aria-hidden="true" /></button>
            </div>
          ) : <p className="text-[13.5px] text-ink3 mt-4">{canRequest ? (s.waiting ? "A change for this student is waiting for approval." : "These marks are submitted. Tap a mark to ask for a change.") : "These marks cannot be changed here."}</p>}
        </>
      )}
      <div className="flex gap-2 mt-4">
        <Button variant="secondary" icon={ChevronLeft} className="flex-1" disabled={i === 0} onClick={() => go(i - 1)}>Previous</Button>
        <Button variant="primary" iconRight={ChevronRight} className="flex-1" disabled={i === students.length - 1 || Boolean(e)}
          onClick={() => (!gradeOnly && k < cats.length - 1 && canEdit ? setK(k + 1) : go(i + 1))}>Next</Button>
      </div>
    </Card>
  );
}

const REASONS = ["Totalling error", "A page was not checked", "Re-evaluation asked by the parent", "Typed wrongly"];

function ChangeSheet({ entryId, sectionId, categories: cats, gradeOnly, gradeList, student, head, onClose }: Props & { student: GridStudent; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const now = student.absent ? (student.medical ? "ML" : "AB") : gradeOnly ? student.grade ?? "—" : cats.map((c) => `${cats.length > 1 ? `${c.name} ` : ""}${student.parts[c.name] ?? "—"}`).join(", ");
  return (
    <ActionSheet open onClose={onClose} title="Ask for a mark change" sub={`${student.name}${student.rollNo ? ` · roll ${student.rollNo}` : ""}`} confirmLabel="Send for approval" confirmIcon={<Send size={16} />} pendingText="Sending…"
      run={async (fd) => {
        fd.set("entryId", entryId); fd.set("sectionId", sectionId); fd.set("studentId", student.id);
        const r = await requestChangeAction({ ok: false } as FormState, fd);
        return r?.ok ? undefined : r?.message ?? "That did not work. Please try again.";
      }}>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-sunken/70 px-3.5 py-2.5"><p className="text-[12px] text-ink3 font-semibold">Submitted mark</p><p className="font-display text-[22px] font-semibold tnum text-ink">{now}</p></div>
        {gradeOnly ? (
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink2">Correct grade
            <select name="grade" defaultValue={student.grade ?? ""} className={cx(inputCls(), "h-11")}><option value="">Choose</option>{gradeList.map((g) => <option key={g} value={g}>{g}</option>)}</select>
          </label>
        ) : cats.length === 1 ? (
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink2">Correct mark
            <input name={`part:${cats[0].name}`} inputMode="decimal" defaultValue={student.parts[cats[0].name] ?? ""} placeholder={`0 to ${cats[0].max}`} className={cx(inputCls(), "h-11 tnum !text-[18px] font-semibold")} />
          </label>
        ) : null}
      </div>
      {!gradeOnly && cats.length > 1 && (
        <div className="grid grid-cols-2 gap-3">
          {cats.map((c) => (
            <label key={c.name} className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink2">{c.name} / {c.max}
              <input name={`part:${c.name}`} inputMode="decimal" defaultValue={student.parts[c.name] ?? ""} placeholder={`0 to ${c.max}`} className={cx(inputCls(), "h-11 tnum font-semibold")} />
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-4 text-[14px] text-ink">
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="absent" defaultChecked={student.absent && !student.medical} className="size-5 accent-brand" /> Absent (AB)</label>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="medical" defaultChecked={student.absent && student.medical} className="size-5 accent-brand" /> Medical leave (ML)</label>
      </div>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink2">
        <span>Reason <span className="text-bad">*</span></span>
        <span className="flex flex-wrap gap-1.5 mb-1">
          {REASONS.map((x) => <button key={x} type="button" onClick={() => setReason(x)} className="h-8 px-3 rounded-full bg-sunken text-[13px] font-medium text-ink hover:bg-line">{x}</button>)}
        </span>
        <textarea name="reason" required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: question 7 was checked but not added to the total" className={cx(inputCls(), "py-2 font-normal")} />
      </label>
      <p className="text-[12.5px] text-ink3 flex gap-1.5"><Info size={14} className="shrink-0 mt-0.5" aria-hidden="true" />Goes to {head.approver} in Approvals. The old mark stays until it is approved. Results are worked out again after approval.</p>
    </ActionSheet>
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
        <ol className="list-decimal space-y-1 pl-5 text-ink2">
          <li><button type="button" className="font-medium text-brand underline" onClick={template}>Download the template</button> with your students in roll order.</li>
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
          <input type="file" name="file" required accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-line file:bg-surface file:px-3" />
          <Button type="submit" variant="secondary" loading={busy} loadingText="Reading…">Read file</Button>
        </form>
        {error && <Alert tone="danger">{error}</Alert>}
        {result && (
          <div className="space-y-2">
            <Alert tone="success">{result.rows.length} students found in the file.</Alert>
            {result.skipped.length > 0 && <ul className="list-disc pl-5 text-sm text-warn">{result.skipped.map((s) => <li key={s}>{s}</li>)}</ul>}
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
