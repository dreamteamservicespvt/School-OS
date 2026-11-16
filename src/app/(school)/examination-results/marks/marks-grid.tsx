"use client";

// The marks grid (08 §2 Marks Entry, approved design mod-exams MarksGrid):
// students in roll order down the side, mark categories across, the total
// and grade worked out as marks are typed. AB is absent, ML is medical leave.
// Each change saves by itself; when the phone is offline the marks wait on
// this device and save when it is back online. "One at a time" shows one
// student with large number keys, for phones.
// A student who joined after the marks were in shows "Joined late"; their
// marks are added by a request that needs approval, when the school allows it.

import { keypadValue } from "@/lib/exams/keypad";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MarksPaperStatus } from "@prisma/client";
import {
  BadgeCheck, Calculator, ChevronDown, ChevronLeft, ChevronRight, Circle, CircleAlert, CircleCheck, Delete, FileSpreadsheet, History, Hourglass, Info,
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
import { checkMark, markNumber, missingWords, readMarkText, typedTotal } from "@/lib/exams/compute";
import type { Band } from "@/lib/exams/grades";
import type { FormState } from "@/lib/forms";
import { ActionSheet } from "../_components/sheets";
import { readMarksSheet, requestChangeAction, saveMarksAction, submitPaperAction, type ImportedRow } from "./actions";
import { Words, useT } from "@/lib/i18n/client";
import { screenMessage } from "@/lib/i18n/messages";
import { formatTime } from "@/lib/format";

export type GridStudent = {
  id: string; name: string; rollNo: number | null; admissionNo: string;
  parts: Record<string, number>; absent: boolean; medical: boolean; grade: string | null; remark: string | null; waiting: boolean;
  /** No marks while the paper is submitted or locked: joined after the marks were in. */
  late: boolean;
  history: { at: string; by: string; approvedBy: string; reason: string; before: string; after: string }[];
};

export type PaperHead = {
  title: string; sectionShort: string; examTitle: string; paperOn: string; teachers: string; dueText: string | null;
  statusWords: string; statusTone: PillTone; onBehalf: boolean; approver: string;
  /** The marks due date has passed: One at a time on a phone shows it as a short red word, not a banner. */
  overdue?: boolean;
};

type Cat = { name: string; max: number };
type Row = { parts: Record<string, string>; absent: boolean; medical: boolean; grade: string; remark: string };
type Props = {
  entryId: string; sectionId: string; paperLabel: string; students: GridStudent[]; categories: Cat[]; gradeOnly: boolean; gradeList: string[]; bands: Band[];
  status: MarksPaperStatus; canEdit: boolean; canRequest: boolean; head: PaperHead; actions?: React.ReactNode; notes?: React.ReactNode;
  /** Exam Settings, Late joiners: "approval" adds late marks by a request; "off" leaves the student out. */
  lateMarks: "approval" | "off";
  /** Exam Settings: an absent (AB) student counts as 0 marks, or is left out of the total. */
  absentRule?: "zero" | "leave-out";
};

// Plain digits only: "1e2" is not 100 and "-5" is not 5 (QA LC9).
const num = markNumber;
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
  const t = useT();
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
  /** Rows with a wrong mark already sent (with the box's last saved mark), as they looked then. */
  const emptied = useRef<Record<string, string>>({});
  /** What the school holds in each box, from the last successful save (or the page load). */
  const savedParts = useRef<Record<string, Record<string, number | null>>>(Object.fromEntries(students.map((s) => [s.id, Object.fromEntries(cats.map((c) => [c.name, s.absent ? null : s.parts[c.name] ?? null]))])));
  const rowsRef = useRef(rows);
  const dirtyRef = useRef(dirty);
  useEffect(() => { rowsRef.current = rows; dirtyRef.current = dirty; }, [rows, dirty]);

  // The problem with one box of marks, or null.
  const partProblem = useCallback((c: Cat, text: string): string | null => {
    const label = cats.length === 1 ? "the mark" : c.name;
    const read = readMarkText(text);
    if (read.kind === "bad") return `${label}: ${read.problem}`;
    if (read.kind === "partial") return `${label}: “${text.trim()}” is not finished. Type AB for absent, ML for medical leave, or the mark.`;
    const v = num(text);
    if (v !== null && Number.isNaN(v)) return `${label} is not a number.`;
    return checkMark(cats.length === 1 ? "This paper" : c.name, c.max, v);
  }, [cats]);

  // Problems per student, checked as typed (the server checks again).
  const problemOf = useCallback((r: Row): string | null => {
    const entered = Object.values(r.parts).some((x) => x.trim() !== "");
    if (r.absent && (entered || r.grade)) return `marked ${r.medical ? "ML" : "AB"} and also has marks. Remove one.`;
    if (gradeOnly) return r.grade && !gradeList.includes(r.grade) ? `choose a grade from ${gradeList.join(", ")}.` : null;
    for (const c of cats) {
      const p = partProblem(c, r.parts[c.name] ?? "");
      if (p) return p;
    }
    return null;
  }, [cats, gradeOnly, gradeList, partProblem]);

  const totals = useMemo(() => Object.fromEntries(students.map((s) => {
    const r = rows[s.id];
    if (!r || r.absent) return [s.id, { total: null as number | null, grade: "", done: Boolean(r?.absent) }];
    if (gradeOnly) return [s.id, { total: null, grade: r.grade, done: Boolean(r.grade) }];
    // No total and no grade for a mark outside its maximum (TEACHING-19): the error shows instead.
    const t = typedTotal(cats.map((c) => ({ name: c.name, max: c.max, value: num(r.parts[c.name] ?? "") })), max, bands);
    return [s.id, { total: t.total, grade: t.grade, done: t.valid && !problemOf(r) }];
  })), [rows, students, cats, gradeOnly, max, bands, problemOf]);

  const done = students.filter((s) => totals[s.id]?.done).length;
  const ab = students.filter((s) => rows[s.id].absent && !rows[s.id].medical).length;
  const ml = students.filter((s) => rows[s.id].absent && rows[s.id].medical).length;
  const problems = students.map((s) => ({ s, e: problemOf(rows[s.id]) })).filter((x) => x.e);
  const blanks = students.filter((s) => !totals[s.id]?.done && !problemOf(rows[s.id]));
  const marked = students.map((s) => totals[s.id]?.total).filter((t): t is number => t !== null && t !== undefined);
  const average = marked.length ? fmt(Math.round((marked.reduce((a, b) => a + b, 0) / marked.length) * 10) / 10) : null;

  // Save what changed. A row with a wrong mark stays "not saved" until it is fixed; its wrong box
  // sends the box's LAST SAVED mark, so a typing mistake never wipes a correct mark (layman loop 5:
  // a saved 8 typed over as 99 became empty). Empty only when nothing was saved in that box before.
  const flush = useCallback(async () => {
    if (saving.current) return;
    const good = [...dirtyRef.current].filter((id) => !problemOf(rowsRef.current[id]));
    const wrong = gradeOnly ? [] : [...dirtyRef.current].filter((id) => {
      const r = rowsRef.current[id];
      return problemOf(r) && !r.absent && emptied.current[id] !== JSON.stringify(r);
    });
    const ids = [...good, ...wrong];
    if (ids.length === 0) return;
    const payload = ids.map((id) => {
      const r = rowsRef.current[id];
      return { studentId: id, parts: Object.fromEntries(cats.map((c) => [c.name, partProblem(c, r.parts[c.name] ?? "") ? savedParts.current[id]?.[c.name] ?? null : num(r.parts[c.name] ?? "")])), absent: r.absent, medical: r.absent && r.medical, grade: r.grade || null, remark: r.remark || null };
    });
    const sent = Object.fromEntries(ids.map((id) => [id, JSON.stringify(rowsRef.current[id])]));
    saving.current = true;
    setSave({ state: "saving" });
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("offline");
      const res = await saveMarksAction(entryId, sectionId, payload);
      if (res.ok) {
        for (const x of payload) savedParts.current[x.studentId] = Object.fromEntries(cats.map((c) => [c.name, x.absent ? null : x.parts[c.name] ?? null]));
        for (const id of wrong) if (JSON.stringify(rowsRef.current[id]) === sent[id]) emptied.current[id] = sent[id];
        const savedIds = good.filter((id) => JSON.stringify(rowsRef.current[id]) === sent[id]);
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
  }, [cats, entryId, sectionId, storeKey, problemOf, partProblem, gradeOnly]);

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
  // What was typed is kept as typed: a mark, AB or ML (any case) is used; anything else stays in the
  // box with a message, never quietly changed into AB or a different number (QA LC9).
  function type(id: string, cat: string, raw: string) {
    const text = raw.slice(0, 8);
    setTyping({ key: `${id}:${cat}`, text });
    const m = readMarkText(text);
    if (m.kind === "blank") setCell(id, cat, "");
    else if (m.kind === "mark") setCell(id, cat, m.text);
    else if (m.kind === "code") setCell(id, cat, m.code);
    else if (m.kind === "bad") setCell(id, cat, text.trim());
    // "A", "M" or ".": still being typed; leaving the box like that shows a message.
  }
  function settle(id: string, cat: string) {
    if (!typing || typing.key !== `${id}:${cat}`) return;
    if (readMarkText(typing.text).kind === "partial") setCell(id, cat, typing.text.trim());
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
  // A failed Submit brings the list of what to fix into view: on a phone it was above the card, off screen (layman loop 4).
  const trySubmit = () => {
    setTried(true);
    if (!problems.length && !blanks.length) return setConfirm(true);
    requestAnimationFrame(() => document.getElementById("marks-fix")?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  };

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
      {allSubmitted && <Lock size={12} aria-hidden="true" />}<Words k="{name} out of {max}" vars={{ name: cats.length === 1 ? t("Marks") : t.any(c.name), max: c.max }} />{allSubmitted ? <> · {t(props.status === "LOCKED" ? "Locked" : "Submitted")}</> : ""}
    </Pill>
  );
  // One at a time on a phone: the subject card shrinks to its title, so the student, the keys and Next fit the screen (layman loop 5).
  const one = view === "one";

  return (
    <div className={canEdit ? "pb-4" : undefined}>
      <div className="flex flex-col gap-5">
        <Card className={cx("p-4 md:p-5 flex flex-col lg:flex-row lg:items-center gap-4", one && "max-md:p-3 max-md:gap-2.5")}>
          <div className="flex items-start gap-4 min-w-0 flex-1">
            <span className={cx("w-12 h-12 rounded-2xl grid place-items-center shrink-0 font-semibold text-[14px]", TONE_SOFT[allSubmitted ? "ok" : "brand"], one && "max-md:hidden")}>{head.sectionShort}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className={cx("font-display text-[22px] md:text-[26px] font-semibold tracking-tight leading-tight", one && "max-md:text-[18px]")}>{head.title}</h1>
                <span className={cx("contents", one && "max-md:hidden")}>{gradeOnly ? <Pill tone={allSubmitted ? "ok" : canEdit ? "warn" : "neutral"}><Words k="Grade paper" /></Pill> : cats.map(catPill)}</span>
              </div>
              <p className={cx("text-[13.5px] text-ink3 mt-0.5", one && "max-md:hidden")}>{head.examTitle} <Words k="· paper" /> {screenMessage(t, head.paperOn)} · {t.any(head.teachers)} · {students.length === 1 ? t("1 student") : t("{n} students", { n: students.length })}{head.dueText ? ` · ${t("marks due {date}", { date: head.dueText })}` : ""}</p>
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            {students.length > 0 && <Segmented label="Layout" value={view} onChange={(v) => setView(v as "grid" | "one")} options={[{ value: "grid", label: "Grid", icon: Table }, { value: "one", label: "One at a time", icon: Smartphone }]} />}
            {canEdit && <Button variant="secondary" icon={FileSpreadsheet} className="hidden lg:inline-flex" onClick={() => setImportOpen(true)}><Words k="Import" /></Button>}
            {props.actions}
          </div>
        </Card>

        {/* One at a time on a phone: the due-date banner folds into the short line above the student (layman loop 5). */}
        {one && canEdit ? <div className="contents max-md:hidden">{props.notes}</div> : props.notes}
        {head.onBehalf && canEdit && <Banner tone="brand" icon={UserPen} title={t("You are entering marks for {name}.", { name: head.teachers })}><Words k="Each mark records your name in the change history." /></Banner>}

        {students.length === 0 ? (
          <Alert><Words k="No students sit this paper." /> {gradeOnly ? "" : t("If students chose this optional subject, record their choices in Student Management.")}</Alert>
        ) : (
          <>
            {/* One at a time on a phone: the four cards fold into one line, so the student, the boxes, every key and
                Next fit on the first screen (layman loop 3). */}
            {view === "one" && <p className="md:hidden px-1 text-[13px] text-ink3 tnum">{gradeOnly ? <Words k="Graded {n} of {n2}" vars={{ n: done, n2: students.length }} /> : <Words k="Entered {n} of {n2}" vars={{ n: done, n2: students.length }} />} · AB {ab} · ML {ml}{canEdit && head.overdue ? <> · <b className="font-semibold text-bad"><Words k="Overdue" /></b></> : null}</p>}
            <Stats className={view === "one" ? "hidden md:block" : undefined} items={[
              { label: "Entered", value: `${done} of ${students.length}`, tone: done === students.length ? "ok" : undefined, icon: ListChecks },
              // A grade paper has no marks: "Counted as 0 marks" was wrong there, and "Graded" also named the paper type (QA L6-51).
              { label: "Absent (AB)", value: ab, sub: gradeOnly ? "Absent: no grade" : props.absentRule === "leave-out" ? "Left out of the total" : "Counted as 0 marks", icon: UserX },
              { label: "Medical (ML)", value: ml, sub: "Left out of the total", icon: Stethoscope },
              problems.length
                ? { label: "Need a fix", value: problems.length, tone: "bad", icon: TriangleAlert }
                : { label: "Class average", value: average !== null && !gradeOnly ? `${average} / ${max}` : "—", icon: Calculator },
            ]} />

            {(problems.length > 0 || (tried && blanks.length > 0)) && <div id="marks-fix" className="flex flex-col gap-5">
            {problems.length > 0 && (
              <Banner tone="bad" title={problems.length === 1 ? t("1 mark needs a fix.") : t("{n} marks need a fix.", { n: problems.length })}>
                {problems.slice(0, 3).map((x) => t("Roll {n}, {name}: {problem}", { n: x.s.rollNo ?? "–", name: x.s.name, problem: screenMessage(t, x.e ?? "") })).join(" ")}{problems.length > 3 ? ` ${t("And {n} more.", { n: problems.length - 3 })}` : ""}
              </Banner>
            )}
            {tried && !problems.length && blanks.length > 0 && (
              <Banner tone="warn" title={gradeOnly
                ? (blanks.length === 1 ? t("1 student has no grade yet:") : t("{n} students have no grade yet:", { n: blanks.length }))
                : (blanks.length === 1 ? t("1 student has marks missing yet:") : t("{n} students have marks missing yet:", { n: blanks.length }))}>
                {/* Whole sentences with blanks, so a Telugu or Hindi screen keeps its own word order (layman loop 5). */}
                {blanks.slice(0, 4).map((s) => {
                  const who = t("{name} (roll {n})", { name: s.name, n: s.rollNo ?? "–" });
                  const gap = missingWords(rows[s.id], cats, gradeOnly).replace(/^: | missing$/g, "");
                  return gap ? t("{who}: {what} missing", { who, what: gap.split(" and ").map((x) => t.any(x)).join(", ") }) : who;
                }).join(", ")}{blanks.length > 4 ? ` ${t("and {n} more", { n: blanks.length - 4 })}` : ""}<Words k=". Type the mark, or AB for absent and ML for medical leave." />
              </Banner>
            )}
            </div>}

            {view === "grid" ? (
              <Card className="overflow-hidden">
                {canEdit && (
                  <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap px-4 md:px-5 py-3 border-b border-line text-[12.5px] text-ink3">
                    <span className="flex items-center gap-1.5"><Kbd>Enter</Kbd> <Words k="or" /> <Kbd>↓</Kbd> <Words k="next student" /></span>
                    <span className="flex items-center gap-1.5"><Kbd>↑</Kbd> <Words k="back" /></span>
                    <span className="flex items-center gap-1.5"><Kbd>AB</Kbd> <Words k="absent" /></span>
                    <span className="flex items-center gap-1.5"><Kbd>ML</Kbd> <Words k="medical leave" /></span>
                    <span className="ml-auto"><Words k="Empty means not entered yet" /></span>
                  </div>
                )}
                <div className="overflow-x-auto scroll-thin">
                  <table className="text-[13.5px] min-w-full">
                    <caption className="sr-only"><Words k="Marks for" /> {props.paperLabel}<Words k=". Enter moves down. Type AB for absent, ML for medical leave." /></caption>
                    <thead>
                      <tr className="border-b border-line text-ink3 text-[12px]">
                        <th scope="col" className="sticky left-0 z-10 bg-surface text-left font-semibold px-4 py-2.5 min-w-[190px]"><Words k="Student" /></th>
                        {gradeOnly ? <th scope="col" className="font-semibold px-2 py-2.5 text-center min-w-[100px]"><span className="block text-ink2"><Words k="Grade" /></span></th> : cats.map((c) => (
                          <th key={c.name} scope="col" className="font-semibold px-2 py-2.5 text-center min-w-[100px]">
                            <span className="block text-ink2">{cats.length === 1 ? t("Marks") : t.any(c.name)} / {c.max}</span>
                            <span className={cx("block text-[11px] font-medium", allSubmitted ? "text-ok" : canEdit ? "text-brand" : "")}>{allSubmitted ? t(props.status === "LOCKED" ? "Locked" : "Submitted") : canEdit ? "" : t("Not open")}</span>
                          </th>
                        ))}
                        {!gradeOnly && cats.length > 1 && <th scope="col" className="font-semibold px-3 py-2.5 text-right whitespace-nowrap"><Words k="Total /" /> {max}</th>}
                        {!gradeOnly && <th scope="col" className="font-semibold px-4 py-2.5 text-center"><Words k="Grade" /></th>}
                        {canEdit && <th scope="col" className="font-semibold px-4 py-2.5 text-left"><Words k="Remark" /></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s, i) => {
                        const r = rows[s.id];
                        const tot = totals[s.id];
                        const bad = problemOf(r);
                        return (
                          <tr key={s.id} className="border-b border-line/60 last:border-0">
                            <th scope="row" className="sticky left-0 z-10 bg-surface px-4 py-1.5 whitespace-nowrap text-left font-normal">
                              <span className="text-ink3 tnum inline-block w-7">{s.rollNo ?? ""}</span><span className="font-medium">{s.name}</span>
                              {s.late && <Pill tone="info" className="ml-2 !h-5 !text-[11px]"><Words k="Joined late" /></Pill>}
                            </th>
                            {gradeOnly ? (
                              <td className="px-2 py-1.5 text-center">
                                {canEdit ? (
                                  <select data-cell={`${i}:0`} aria-label={t("Grade for {name}", { name: s.name })} value={r.absent ? code(r) : r.grade} onChange={(e) => setGrade(s.id, e.target.value)} onKeyDown={(e) => onKey(e, i, 0, s.id, "")}
                                    className={cx("w-[88px] h-10 scroll-mb-48 md:scroll-mb-28 rounded-lg border text-center text-[15px] font-semibold bg-surface outline-none border-line focus:border-brand focus:ring-4 focus:ring-brand/15", r.absent && "text-info", tried && !tot.done && "border-warn bg-warn/[.06]")}>
                                    <option value="">—</option>
                                    {gradeList.map((g) => <option key={g} value={g}>{g}</option>)}
                                    <option value="AB">AB</option><option value="ML">ML</option>
                                  </select>
                                ) : <LockedCell value={r.absent ? code(r) : r.grade} s={s} canRequest={canRequest && (!s.late || props.lateMarks === "approval")} onAsk={setAsk} />}
                              </td>
                            ) : cats.map((c, k) => {
                              const v = shown(s.id, c.name);
                              const cellBad = !r.absent && (num(r.parts[c.name] ?? "") !== null && (Number.isNaN(num(r.parts[c.name] ?? "")) || checkMark(c.name, c.max, num(r.parts[c.name] ?? ""))));
                              return (
                                <td key={c.name} className="px-2 py-1.5 text-center">
                                  {canEdit ? (
                                    <input data-cell={`${i}:${k}`} inputMode="text" autoComplete="off" spellCheck={false} aria-label={t("{what} for {name}, out of {max}", { what: cats.length === 1 ? t("Marks") : t.any(c.name), name: s.name, max: c.max })} aria-invalid={cellBad ? true : undefined}
                                      title={cellBad && bad ? screenMessage(t, bad) : undefined} value={v}
                                      onChange={(e) => type(s.id, c.name, e.target.value)} onBlur={() => settle(s.id, c.name)} onKeyDown={(e) => onKey(e, i, k, s.id, c.name)} onFocus={(e) => e.currentTarget.select()}
                                      className={cx("w-[72px] h-10 scroll-mb-48 md:scroll-mb-28 rounded-lg border text-center text-[15px] font-semibold tnum bg-surface outline-none transition",
                                        cellBad ? "border-bad ring-4 ring-bad/10 text-bad" : r.absent ? "border-line text-info" : "border-line focus:border-brand focus:ring-4 focus:ring-brand/15",
                                        tried && !tot.done && !cellBad && v === "" && "border-warn bg-warn/[.06]")} />
                                  ) : <LockedCell value={r.absent ? code(r) : r.parts[c.name] ?? ""} s={s} canRequest={canRequest && (!s.late || props.lateMarks === "approval")} onAsk={setAsk} />}
                                </td>
                              );
                            })}
                            {!gradeOnly && cats.length > 1 && <td className="px-3 text-right font-semibold tnum">{tot.total !== null ? fmt(tot.total) : r.absent ? <span className="text-info">{code(r)}</span> : <span className="text-ink3 font-normal">—</span>}</td>}
                            {!gradeOnly && (
                              <td className="px-4 text-center">
                                {r.absent ? <Pill tone="info" className="!h-5 !text-[11px]">{code(r)}</Pill> : tot.grade ? <Pill tone={toneOf(tot.grade, bands)} className="!h-5 !text-[11px]">{tot.grade}</Pill> : <span className="text-ink3">—</span>}
                              </td>
                            )}
                            {canEdit && (
                              <td className="px-4 py-1.5">
                                <input aria-label={t("Remark for {name}", { name: s.name })} maxLength={200} value={r.remark} placeholder={t("Optional")} onChange={(e) => change(s.id, { ...r, remark: e.target.value })}
                                  className="h-10 scroll-mb-48 md:scroll-mb-28 w-full min-w-40 rounded-lg border border-line bg-surface px-2.5 text-[13px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
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
              <OneAtATime students={students} rows={rows} cats={cats} gradeOnly={gradeOnly} gradeList={gradeList} canEdit={canEdit} canRequest={canRequest} lateMarks={props.lateMarks} totals={totals} max={max} bands={bands}
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
                what: <><b className="font-semibold">{s.name}</b>: {h.before || t("blank")} → {h.after}. “{h.reason}<Words k="” · asked by" /> {h.by || t("a teacher")}{h.approvedBy ? `, ${t("approved by {name}", { name: h.approvedBy })}` : ""}</>,
                when: h.at,
              }))} />
            </div>
          </Card>
        )}
      </div>

      {canEdit && students.length > 0 && (
        <div className={cx("md:sticky md:bottom-0 mt-4 -mx-4 md:mx-0 px-4 md:px-0 pb-3 pt-3 bg-gradient-to-t from-bg via-bg to-bg/0 z-20", view === "grid" && "sticky bottom-16")}>
          {/* One at a time on a phone: the bar sits after the card, not over the number keys and Next (layman loop 2). */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 bg-surface border border-line rounded-2xl shadow-pop p-2 pl-4" aria-live="polite">
            {/* Shown on a phone too, so "Save now" visibly says it saved (self-test B4). */}
            <p className={cx("text-[12.5px] basis-full sm:basis-auto sm:flex-1 min-w-0 flex items-center gap-1.5 leading-snug", save.state === "error" ? "text-bad" : save.state === "offline" ? "text-warn" : "text-ink3")}>
              {save.state === "saving" ? <><Spinner size={13} /><Words k="Saving…" /></>
                : save.state === "offline" || save.state === "error" ? <><CircleAlert size={13} aria-hidden="true" />{screenMessage(t, save.message)}</>
                : dirty.size && problems.length ? <><CircleAlert size={13} className="text-bad" aria-hidden="true" /><Words k="Marks in red are not saved. The last saved mark stays." /></>
                : dirty.size ? <><Circle size={8} className="text-warn fill-current" aria-hidden="true" /><Words k="Not sent to the school yet. Keep this page open, or tap Save now." /></>
                : <><CircleCheck size={13} className="text-ok" aria-hidden="true" />{save.at ? <Words k="All marks saved at {time}" vars={{ time: formatTime(save.at) }} /> : <Words k="Marks save as you type" />}</>}
            </p>
            <Button variant="secondary" icon={Save} className="flex-1 sm:flex-none" onClick={() => void flush()} disabled={!dirty.size}><Words k="Save now" /></Button>
            <Button variant="primary" icon={Send} className="flex-1 sm:flex-none" onClick={trySubmit}><Words k="Submit marks" /></Button>
          </div>
        </div>
      )}

      <ActionSheet open={confirm} onClose={() => setConfirm(false)} title={t("Submit {paper} marks?", { paper: props.paperLabel })} confirmLabel={t("Submit marks of {n} students", { n: students.length })} confirmIcon={<Send size={16} />} pendingText="Submitting…" run={submit}>
        <div className="flex flex-col gap-3 text-[14px] text-ink2">
          <p>{head.examTitle} · {props.paperLabel}.</p>
          <ul className="grid grid-cols-3 gap-2 text-center">
            <li className="rounded-xl bg-sunken/70 py-2.5"><b className="block font-display text-[20px] text-ink tnum">{students.length - ab - ml}</b><span className="text-[12px]"><Words k="with marks" /></span></li>
            <li className="rounded-xl bg-sunken/70 py-2.5"><b className="block font-display text-[20px] text-ink tnum">{ab}</b><span className="text-[12px]"><Words k="absent (AB)" /></span></li>
            <li className="rounded-xl bg-sunken/70 py-2.5"><b className="block font-display text-[20px] text-ink tnum">{ml}</b><span className="text-[12px]"><Words k="medical (ML)" /></span></li>
          </ul>
          <p>{t("After this, you cannot change these marks. A correction needs a reason and approval from {who}, and the old mark is kept.", { who: t.any(head.approver) })}</p>
        </div>
      </ActionSheet>
      {ask && <ChangeSheet {...props} student={ask} onClose={() => setAsk(null)} />}
      {canEdit && <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} {...props} onFill={fillFromSheet} />}
    </div>
  );
}

function LockedCell({ value, s, canRequest, onAsk }: { value: string; s: GridStudent; canRequest: boolean; onAsk: (s: GridStudent) => void }) {
  const t = useT();
  const isCode = value === "AB" || value === "ML";
  if (s.late) {
    if (!canRequest) return <span title={t("Joined after the marks were in: left out of this exam.")} className="inline-grid place-items-center w-[72px] h-10 rounded-lg bg-sunken/50 text-ink3">—</span>;
    return (
      <button type="button" onClick={() => onAsk(s)} disabled={s.waiting} title={t(s.waiting ? "Marks are waiting for approval." : "Joined after the marks were in. Tap to add marks; they need approval.")}
        aria-label={`${t("{name} joined late and has no marks.", { name: s.name })} ${t(s.waiting ? "Marks are waiting for approval." : "Add marks.")}`}
        className={cx("w-[72px] h-10 rounded-lg inline-flex items-center justify-center gap-1 text-[13px] font-semibold transition", s.waiting ? "bg-warn/12 text-warn" : "bg-info/10 text-info hover:bg-info/15")}>
        {s.waiting ? <><Hourglass size={12} aria-hidden="true" /><Words k="Asked" /></> : <>+ {t("Add")}</>}
      </button>
    );
  }
  if (!canRequest) return <span className={cx("inline-grid place-items-center w-[72px] h-10 rounded-lg bg-sunken/50 font-semibold tnum", isCode ? "text-info" : value ? "text-ink" : "text-ink3")}>{value || "—"}</span>;
  return (
    <button type="button" onClick={() => onAsk(s)} disabled={s.waiting} title={t(s.waiting ? "A change is waiting for approval." : "Submitted. Tap to ask for a change.")}
      aria-label={`${s.name}: ${value || t("no mark")}. ${t(s.waiting ? "A change is waiting for approval." : "Ask for a change.")}`}
      className={cx("w-[72px] h-10 rounded-lg inline-flex items-center justify-center gap-1 font-semibold tnum transition", s.waiting ? "bg-warn/12 text-warn" : "bg-sunken/70 hover:bg-sunken", isCode && !s.waiting && "text-info")}>
      {s.waiting ? <Hourglass size={12} aria-hidden="true" /> : <Lock size={11} className="text-ink3" aria-hidden="true" />}{value || "—"}
    </button>
  );
}

/** An empty box: a dash on screen, "not entered" to a screen reader (not "dash"). */
function NotEntered() {
  return <><span aria-hidden="true">—</span><span className="sr-only"><Words k="not entered" /></span></>;
}

/** The number keys of One at a time, four to a row like a phone's keypad; the label is for screen readers. */
const KEYS: { key: string; label?: string; wide?: boolean }[] = [
  { key: "1" }, { key: "2" }, { key: "3" }, { key: "del", label: "Delete last digit" },
  { key: "4" }, { key: "5" }, { key: "6" }, { key: "clear", label: "Clear the mark" },
  { key: "7" }, { key: "8" }, { key: "9" }, { key: ".5", label: "Add a half mark" },
  { key: "AB" }, { key: "0", wide: true }, { key: "ML" },
];

function OneAtATime({ students, rows, cats, gradeOnly, gradeList, canEdit, canRequest: canAsk, lateMarks, totals, max, bands, problemOf, setCell, setGrade, onAsk }: {
  students: GridStudent[]; rows: Record<string, Row>; cats: Cat[]; gradeOnly: boolean; gradeList: string[]; canEdit: boolean; canRequest: boolean; lateMarks: "approval" | "off";
  totals: Record<string, { total: number | null; grade: string; done: boolean }>; max: number; bands: Band[];
  problemOf: (r: Row) => string | null; setCell: (id: string, cat: string, text: string) => void; setGrade: (id: string, g: string) => void; onAsk: (s: GridStudent) => void;
}) {
  // Each student opens on the first EMPTY box, so a key never replaces a mark already in (layman loop 2).
  const firstEmpty = (n: number) => {
    const row = rows[students[n]?.id];
    const at = row && !row.absent ? cats.findIndex((x) => (row.parts[x.name] ?? "") === "") : -1;
    return at < 0 ? 0 : at;
  };
  const t0 = useT();
  const [i, setI] = useState(() => Math.max(0, students.findIndex((s) => !totals[s.id]?.done)));
  const [k, setK] = useState(() => firstEmpty(Math.max(0, students.findIndex((s) => !totals[s.id]?.done))));
  const s = students[Math.min(i, students.length - 1)];
  const canRequest = canAsk && (!s.late || lateMarks === "approval");
  const r = rows[s.id];
  const c = cats[Math.min(k, cats.length - 1)];
  const v = r.absent ? code(r) : c ? r.parts[c.name] ?? "" : "";
  const e = canEdit ? problemOf(r) : null;
  const t = totals[s.id];
  // A box just chosen (or a new student) is "fresh": the first number key replaces the mark in it, like
  // selecting the text, so correcting 11 to 18 does not give 1118 (self-test B4).
  const [fresh, setFresh] = useState(true);
  const go = (n: number) => { setI(n); setK(firstEmpty(n)); setFresh(true); };
  const pick = (n: number) => { setK(n); setFresh(true); };
  // Next moves to this student's next EMPTY box, else to the next student. It never lands on a box that
  // already has a mark, where the next key would replace it (layman loop 5: a saved 8 was typed over).
  const nextPart = canEdit && !gradeOnly && !r.absent ? cats.findIndex((x, n) => n > k && (r.parts[x.name] ?? "") === "") : -1;
  const press = (key: string) => {
    if (!canEdit || !c) return;
    const next = keypadValue(v, key, { fresh, absent: r.absent });
    setFresh(false);
    if (next !== undefined) setCell(s.id, c.name, next);
  };
  const shown = r.absent ? code(r) : r.grade;
  return (
    // data-keypad: the phone's bottom menu steps aside while these keys are on screen (src/components/shell/app-shell.tsx).
    // overflow-anchor none: when the red line under the mark appears, the keys move down under it. The browser
    // otherwise scrolled the page to keep the keys still, and the part that stays on screen then hid the
    // top row of keys (layman loop 4).
    <Card className="p-4 md:p-6 max-w-xl w-full mx-auto [overflow-anchor:none]" data-keypad={canEdit ? "" : undefined}>
      {/* On a phone the student and the mark box stay in view while the number keys and Next
          are on screen, even on a small phone (TEACHING-14); short screens get smaller keys. */}
      <div className="sticky top-16 z-10 -mx-4 -mt-4 px-4 pt-4 pb-2 rounded-t-2xl bg-surface md:static md:m-0 md:p-0 md:rounded-none">
        <div className="flex items-center gap-3">
          <span className="shrink-0 [@media(max-height:720px)]:hidden"><Avatar name={s.name} size={48} /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[16px] truncate">{s.name}</p>
            <p className="text-[13px] text-ink3 truncate"><Words k="{n} of {n2}" vars={{ n: i + 1, n2: students.length }} /> · <span className="font-mono text-[12px]">{s.admissionNo}</span>{s.late ? <> · <Words k="Joined late" /></> : ""}</p>
          </div>
          {/* A short "Roll 3" chip, so the name and the line under it are not cut off on a phone (layman loop 2). */}
          <span className={cx(inputCls(), "!h-10 !w-auto relative shrink-0 inline-flex items-center gap-1 text-[13px] font-semibold")}>
            {s.rollNo ? t0("Roll {n}", { n: s.rollNo }) : `${i + 1} / ${students.length}`}<ChevronDown size={15} className="text-ink3" aria-hidden="true" />
            <select aria-label={t0("Go to student")} value={i} onChange={(ev) => go(Number(ev.target.value))} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
              {students.map((x, n) => <option key={x.id} value={n}>{x.rollNo ? `${x.rollNo}. ` : ""}{x.name}{totals[x.id]?.done ? " ✓" : ""}</option>)}
            </select>
          </span>
        </div>
        {gradeOnly ? (
          <div className="rounded-2xl border-2 border-brand bg-brand/5 p-3 mt-4 [@media(max-height:720px)]:mt-3 [@media(max-height:720px)]:p-2">
            <span className="text-[12px] text-ink3 font-semibold flex items-center gap-1">{!canEdit && <Lock size={11} aria-hidden="true" />}<Words k="Grade" /></span>
            <span className={cx("block font-display text-[28px] font-semibold leading-tight [@media(max-height:720px)]:text-[24px]", r.absent && "text-info")} aria-live="polite">{shown || <NotEntered />}</span>
          </div>
        ) : (
          <>
            <div className={cx("grid gap-2 mt-4 [@media(max-height:720px)]:mt-3", cats.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
              {cats.map((x, n) => {
                const xv = r.absent ? code(r) : r.parts[x.name] ?? "";
                const xn = num(xv);
                const xBad = !r.absent && xn !== null && (Number.isNaN(xn) || Boolean(checkMark(x.name, x.max, xn)));
                return (
                  <button key={x.name} type="button" onClick={() => (canEdit ? pick(n) : canRequest && !s.waiting ? onAsk(s) : undefined)} aria-pressed={k === n}
                    className={cx("rounded-2xl border-2 p-3 text-left transition flex items-end justify-between gap-2 [@media(max-height:720px)]:p-2", k === n && canEdit ? "border-brand bg-brand/5" : "border-line")}>
                    <span className="min-w-0">
                      <span className="text-[12px] text-ink3 font-semibold flex items-center gap-1">{!canEdit && <Lock size={11} aria-hidden="true" />}<Words k="{name} out of {max}" vars={{ name: cats.length === 1 ? t0("Marks") : t0.any(x.name), max: x.max }} /></span>
                      <span className={cx("block font-display text-[28px] font-semibold tnum leading-tight [@media(max-height:720px)]:text-[24px]", xBad && "text-bad", r.absent && "text-info")} aria-live="polite">
                        {/* A chosen box with a mark shows it selected: the next key replaces it. */}
                        {xv && k === n && fresh && canEdit ? <span className="rounded-md bg-brand/20 px-1 -mx-1">{xv}</span> : xv || <NotEntered />}
                      </span>
                    </span>
                    {/* The grade sits in the box, so the box and keys fit a small screen; never for a mark that is not allowed. */}
                    {cats.length === 1 && t.grade && <span className="text-[13px] text-ink2 shrink-0 pb-1"><Words k="Grade" /> <Pill tone={toneOf(t.grade, bands)} className="!h-5 !text-[11px]">{t.grade}</Pill></span>}
                  </button>
                );
              })}
            </div>
            {/* "8 so far, Theory missing", not "— + 8", which read like a sum (layman loop 5). */}
            {cats.length > 1 && <p className="mt-2 text-[13.5px] text-ink2"><Words k="Total" /> <b className="tnum text-ink">{t.total !== null ? `${fmt(t.total)} / ${max}` : !r.absent && !e && cats.some((x) => r.parts[x.name])
              ? <Words k="{n} so far, {what} missing" vars={{ n: fmt(cats.reduce((a, x) => a + (num(r.parts[x.name] ?? "") ?? 0), 0)), what: cats.filter((x) => !r.parts[x.name]).map((x) => t0.any(x.name)).join(", ") }} />
              : <NotEntered />}</b>{t.grade && <> <Words k="· Grade" /> <Pill tone={toneOf(t.grade, bands)} className="!h-5 !text-[11px]">{t.grade}</Pill></>}</p>}
            {canEdit && !e && !r.absent && fresh && c && r.parts[c.name] && <p className="mt-1 text-[12.5px] text-ink3"><Words k="The next key replaces this mark." /></p>}
          </>
        )}
        {e && <p className="text-[13px] text-bad flex items-center gap-1.5 mt-2" role="alert"><CircleAlert size={15} aria-hidden="true" />{t0("{name}: {problem}", { name: s.name, problem: screenMessage(t0, e) })}</p>}
      </div>
      {gradeOnly ? (
        canEdit ? (
          <div className="grid grid-cols-3 gap-2 mt-4 [@media(max-height:720px)]:mt-2 [@media(max-height:720px)]:gap-1.5" role="group" aria-label={t0("Grades")}>
            {[...gradeList, "AB", "ML"].map((g) => (
              <button key={g} type="button" aria-pressed={shown === g} onClick={() => setGrade(s.id, g)}
                className={cx("h-14 rounded-xl border text-[18px] font-semibold transition [@media(max-height:720px)]:h-11", shown === g ? "border-brand bg-brand text-brandink" : "border-line hover:bg-sunken/60", (g === "AB" || g === "ML") && shown !== g && "text-info")}>{g}</button>
            ))}
          </div>
        ) : canRequest && <Button variant="secondary" className="mt-4 w-full" disabled={s.waiting} onClick={() => onAsk(s)}>{t0(s.waiting ? "Waiting for approval" : s.late ? "Add marks" : "Ask for a change")}</Button>
      ) : canEdit ? (
        <div className="grid grid-cols-4 gap-2 mt-4 [@media(max-height:720px)]:mt-2 [@media(max-height:720px)]:gap-1.5" role="group" aria-label={t0("Number keys")}>
          {KEYS.map(({ key, label, wide }) => (
            <button key={key} type="button" aria-label={label ? t0.any(label) : undefined} onClick={() => (key === "clear" ? setCell(s.id, c.name, "") : press(key))}
              className={cx("h-14 rounded-xl border border-line font-semibold tnum active:bg-sunken hover:bg-sunken/60 transition grid place-items-center [@media(max-height:720px)]:h-11",
                wide && "col-span-2", key === "AB" || key === "ML" ? "text-info text-[16px]" : key === "clear" ? "text-ink2 text-[14px]" : "text-[20px]")}>
              {key === "del" ? <Delete size={20} aria-hidden="true" /> : key === "clear" ? <Words k="Clear" /> : key === ".5" ? "½"
                // AB and ML say what they mean under the letters, at no extra height (layman loop 5).
                : key === "AB" || key === "ML" ? <span className="flex flex-col items-center leading-none gap-0.5">{key}<span className="text-[10px] font-medium text-ink3 max-w-full truncate px-0.5"><Words k={key === "AB" ? "absent" : "medical leave"} /></span></span> : key}
            </button>
          ))}
        </div>
      ) : <p className="text-[13.5px] text-ink3 mt-4">{t0(s.late
        ? (canRequest ? (s.waiting ? "Marks for this student are waiting for approval." : "Joined after the marks were in. Tap a mark to add marks; they need approval.") : "Joined after the marks were in: left out of this exam.")
        : canRequest ? (s.waiting ? "A change for this student is waiting for approval." : "These marks are submitted. Tap a mark to ask for a change.") : "These marks cannot be changed here.")}</p>}
      <div className="flex gap-2 mt-4 [@media(max-height:720px)]:mt-2">
        <Button variant="secondary" icon={ChevronLeft} className="flex-1" disabled={i === 0} onClick={() => go(i - 1)}><Words k="Previous" /></Button>
        <Button variant="primary" iconRight={ChevronRight} className="flex-1" disabled={(nextPart < 0 && i === students.length - 1) || Boolean(e)}
          onClick={() => (nextPart >= 0 ? pick(nextPart) : go(i + 1))}>{cats.length < 2 || gradeOnly ? <Words k="Next" /> : nextPart >= 0 ? <Words k="Next mark" /> : <Words k="Next student" />}</Button>
      </div>
    </Card>
  );
}

const REASONS = ["Totalling error", "A page was not checked", "Re-evaluation asked by the parent", "Typed wrongly"];
const LATE_REASONS = ["Joined late; took the paper on another day", "Marks from the previous school", "Joined late; absent for the paper"];

function ChangeSheet({ entryId, sectionId, categories: cats, gradeOnly, gradeList, student, head, onClose }: Props & { student: GridStudent; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const t = useT();
  const now = student.late ? t("None yet") : student.absent ? (student.medical ? "ML" : "AB") : gradeOnly ? student.grade ?? "—" : cats.map((c) => `${cats.length > 1 ? `${t.any(c.name)} ` : ""}${student.parts[c.name] ?? "—"}`).join(", ");
  return (
    <ActionSheet open onClose={onClose} title={student.late ? "Add marks for a student who joined late" : "Ask for a mark change"} sub={`${student.name}${student.rollNo ? ` · ${t("roll {n}", { n: student.rollNo })}` : ""}`} confirmLabel={t("Send for approval")} confirmIcon={<Send size={16} />} pendingText="Sending…"
      run={async (fd) => {
        fd.set("entryId", entryId); fd.set("sectionId", sectionId); fd.set("studentId", student.id);
        const r = await requestChangeAction({ ok: false } as FormState, fd);
        return r?.ok ? undefined : screenMessage(t, r?.message ?? "That did not work. Please try again.");
      }}>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-sunken/70 px-3.5 py-2.5"><p className="text-[12px] text-ink3 font-semibold">{t(student.late ? "Marks now" : "Submitted mark")}</p><p className="font-display text-[22px] font-semibold tnum text-ink">{now}</p></div>
        {gradeOnly ? (
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink2"><Words k="Correct grade" />
            <select name="grade" defaultValue={student.grade ?? ""} className={cx(inputCls(), "h-11")}><option value="">{t("Choose")}</option>{gradeList.map((g) => <option key={g} value={g}>{g}</option>)}</select>
          </label>
        ) : cats.length === 1 ? (
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink2"><Words k="Correct mark" />
            <input name={`part:${cats[0].name}`} inputMode="decimal" defaultValue={student.parts[cats[0].name] ?? ""} placeholder={t("0 to {max}", { max: cats[0].max })} className={cx(inputCls(), "h-11 tnum !text-[18px] font-semibold")} />
          </label>
        ) : null}
      </div>
      {!gradeOnly && cats.length > 1 && (
        <div className="grid grid-cols-2 gap-3">
          {cats.map((c) => (
            <label key={c.name} className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink2">{t.any(c.name)} / {c.max}
              <input name={`part:${c.name}`} inputMode="decimal" defaultValue={student.parts[c.name] ?? ""} placeholder={t("0 to {max}", { max: c.max })} className={cx(inputCls(), "h-11 tnum font-semibold")} />
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-4 text-[14px] text-ink">
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="absent" defaultChecked={student.absent && !student.medical} className="size-5 accent-brand" /> <Words k="Absent (AB)" /></label>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="medical" defaultChecked={student.absent && student.medical} className="size-5 accent-brand" /> <Words k="Medical leave (ML)" /></label>
      </div>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink2">
        <span><Words k="Reason" /> <span className="text-bad">*</span></span>
        <span className="flex flex-wrap gap-1.5 mb-1">
          {(student.late ? LATE_REASONS : REASONS).map((x) => <button key={x} type="button" onClick={() => setReason(t.any(x))} className="h-8 px-3 rounded-full bg-sunken text-[13px] font-medium text-ink hover:bg-line">{t.any(x)}</button>)}
        </span>
        <textarea name="reason" required rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("For example: question 7 was checked but not added to the total")} className={cx(inputCls(), "py-2 font-normal")} />
      </label>
      <p className="text-[12.5px] text-ink3 flex gap-1.5"><Info size={14} className="shrink-0 mt-0.5" aria-hidden="true" />{student.late
        ? t("Goes to {who} in Approvals. Nothing changes until it is approved. The student's result counts once every paper has marks, and is then published like any other; the class's published results do not change.", { who: t.any(head.approver) })
        : t("Goes to {who} in Approvals. The old mark stays until it is approved. Results are worked out again after approval.", { who: t.any(head.approver) })}</p>
    </ActionSheet>
  );
}

function ImportDialog({ open, onClose, entryId, sectionId, paperLabel, students, categories: cats, gradeOnly, onFill }: Props & { open: boolean; onClose: () => void; onFill: (rows: ImportedRow[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ rows: ImportedRow[]; skipped: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useT();
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
          <li><button type="button" className="font-medium text-brand underline" onClick={template}><Words k="Download the template" /></button> <Words k="with your students in roll order." /></li>
          <li><Words k="Fill the marks. Type Yes in Absent for a student who missed the paper." /></li>
          <li><Words k="Choose the file. The marks fill the grid for you to check; they save as usual." /></li>
        </ol>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setError(null); setResult(null);
          const fd = new FormData(e.currentTarget);
          fd.set("entryId", entryId); fd.set("sectionId", sectionId);
          try {
            const r = await readMarksSheet(fd);
            if (r.ok) setResult({ rows: r.rows, skipped: r.skipped }); else setError(screenMessage(t, r.message));
          } catch { setError(t("The file could not be sent. Check the internet connection and try again.")); }
          setBusy(false);
        }}>
          <input type="file" name="file" required accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-line file:bg-surface file:px-3" />
          <Button type="submit" variant="secondary" loading={busy} loadingText="Reading…"><Words k="Read file" /></Button>
        </form>
        {error && <Alert tone="danger">{error}</Alert>}
        {result && (
          <div className="space-y-2">
            <Alert tone="success">{t("{n} students found in the file.", { n: result.rows.length })}</Alert>
            {result.skipped.length > 0 && <ul className="list-disc pl-5 text-sm text-warn">{result.skipped.map((s) => <li key={s}>{screenMessage(t, s)}</li>)}</ul>}
            <div className="flex justify-end gap-2 border-t border-line pt-3">
              <Button variant="secondary" onClick={() => { setResult(null); onClose(); }}><Words k="Cancel" /></Button>
              <Button onClick={() => { onFill(result.rows); setResult(null); onClose(); }}><Words k="Fill the grid" /></Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
