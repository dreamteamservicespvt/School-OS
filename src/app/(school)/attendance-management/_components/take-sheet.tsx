"use client";

// Take Attendance (05 §2, design/ui-prototype/src/attendance.jsx): everyone
// starts Present; tap A or L for the exceptions; a long press (or "Add note")
// opens every status and a note. One fixed Save button says what will be
// saved. Offline, the save waits on this phone and is sent when online.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, CheckCheck, CircleCheck, Info, Lock, Save, Search, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button, buttonClass } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { cx } from "@/components/ui/cx";
import { inputCls } from "@/components/ui/field";
import { saveSheet } from "../actions";
import { enqueueSave, isNetworkError, newClientId } from "./offline-queue";
import { QuickChips } from "./sheet-form";
import { STATUS_ON, STATUS_SOFT, type StatusView } from "./status";

export type SheetStatus = StatusView & { counts: string };
export type SheetRow = {
  id: string; roll: number | null; name: string; admissionNo: string; photoUrl: string | null;
  statusKey: string | null; note: string | null;
  leave: { typeName: string; halfDay: boolean; reason: string | null } | null;
};

type Props = {
  userId: string;
  sectionId: string; sectionName: string;
  date: string; dateText: string;
  periodNo: number; periodLabel: string | null;
  statuses: SheetStatus[];
  defaultStatus: "present" | "not-marked";
  students: SheetRow[];
  saved: boolean; savedAtText: string | null; savedBy: string | null;
  locked: boolean; lockText: string; canChangeAfterLock: boolean; correctionHref: string;
  offlineOn: boolean;
};

type Mark = { statusKey: string | null; note: string };
const QUICK = ["present", "absent", "late"];
const NOTE_CHIPS = ["Came at 9:20", "Doctor visit", "Left early, parent picked up", "No uniform"];

export function TakeSheet(p: Props) {
  const router = useRouter();
  const byKey = useMemo(() => new Map(p.statuses.map((s) => [s.key, s])), [p.statuses]);
  const quick = useMemo(() => QUICK.filter((k) => byKey.has(k)), [byKey]);
  const fixed = useCallback((s: SheetRow) => Boolean(s.leave && !s.leave.halfDay), []);
  const start = useCallback((): Record<string, Mark> => {
    const out: Record<string, Mark> = {};
    for (const s of p.students) {
      out[s.id] = { statusKey: s.statusKey ?? (fixed(s) ? "leave" : p.defaultStatus === "present" ? "present" : null), note: s.note ?? "" };
    }
    return out;
  }, [p.students, p.defaultStatus, fixed]);
  // The page gives this sheet a new key when the server's copy changes, so it starts fresh then.
  const [marks, setMarks] = useState<Record<string, Mark>>(start);
  const [dirty, setDirty] = useState(!p.saved);
  const [q, setQ] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ text: string; link?: { href: string; label: string } } | null>(null);
  const [pending, startTransition] = useTransition();
  const clientId = useRef<string>(newClientId());
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const readOnly = p.locked && !p.canChangeAfterLock;

  // Warn before leaving with unsaved marks.
  useEffect(() => {
    if (!dirty || readOnly) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, readOnly]);

  const set = (id: string, change: Partial<Mark>) => {
    setMarks((m) => ({ ...m, [id]: { ...m[id], ...change } }));
    setDirty(true);
    setProblem(null);
  };
  const changed = p.students.some((s) => !fixed(s) && marks[s.id]?.statusKey !== (p.defaultStatus === "present" ? "present" : null));
  const markAllPresent = () => {
    setMarks((m) => {
      const next = { ...m };
      for (const s of p.students) if (!fixed(s)) next[s.id] = { ...next[s.id], statusKey: "present" };
      return next;
    });
    setDirty(true);
    setProblem(null);
    setConfirmAll(false);
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    let notMarked = 0;
    for (const s of p.students) {
      const k = marks[s.id]?.statusKey;
      if (k) c[k] = (c[k] ?? 0) + 1;
      else notMarked += 1;
    }
    return { c, notMarked };
  }, [marks, p.students]);

  const summary = useMemo(() => {
    const parts = p.statuses.filter((s) => counts.c[s.key]).map((s) => `${counts.c[s.key]} ${s.name.toLowerCase()}`);
    return parts.join(", ") || "nobody marked";
  }, [counts, p.statuses]);

  const entries = () => p.students.flatMap((s) => {
    const m = marks[s.id];
    return m?.statusKey ? [{ studentId: s.id, statusKey: m.statusKey, note: m.note.trim() || null }] : [];
  });

  const keepOffline = (list: ReturnType<typeof entries>) => {
    const ok = enqueueSave(p.userId, {
      clientId: clientId.current, sectionId: p.sectionId, sectionName: p.sectionName, date: p.date, dateText: p.dateText,
      periodNo: p.periodNo, periodLabel: p.periodLabel, entries: list, takenAt: new Date().toISOString(), summary,
    });
    if (ok) {
      clientId.current = newClientId();
      setDirty(false);
    } else {
      setProblem({ text: "This phone has no room to keep the attendance. Your marks are still on the screen; save again when online." });
    }
  };

  const save = () => {
    const list = entries();
    if (list.length === 0) { setProblem({ text: "Mark at least one student before saving." }); return; }
    if (counts.notMarked > 0) { setProblem({ text: `${counts.notMarked} ${counts.notMarked === 1 ? "student is" : "students are"} not marked yet. Tap P, A or L for each one, then save.` }); return; }
    if (p.offlineOn && typeof navigator !== "undefined" && navigator.onLine === false) { keepOffline(list); return; }
    startTransition(async () => {
      try {
        const r = await saveSheet({ sectionId: p.sectionId, date: p.date, periodNo: p.periodNo, entries: list, clientId: clientId.current });
        if (r.ok) {
          clientId.current = newClientId();
          setDirty(false);
          router.refresh();
        } else {
          setProblem({ text: r.message, link: r.link });
        }
      } catch (e) {
        if (isNetworkError(e) && p.offlineOn) keepOffline(list);
        else setProblem({ text: isNetworkError(e) ? "No internet. Your marks are still on the screen. Save again when you are online." : "That did not save because of a problem on our side. Your marks are still on the screen. Please try again." });
      }
    });
  };

  const needle = q.trim().toLowerCase();
  const list = needle ? p.students.filter((s) => s.name.toLowerCase().includes(needle) || String(s.roll ?? "") === needle || s.admissionNo.toLowerCase().includes(needle)) : p.students;
  const noteRow = p.students.find((s) => s.id === noteFor) ?? null;
  const extraStatuses = p.statuses.filter((s) => !quick.includes(s.key));
  const tiles = [
    ...["present", "absent", "late", "leave"].filter((k) => byKey.has(k)).map((k) => ({ key: k, label: byKey.get(k)!.name, value: counts.c[k] ?? 0 })),
    ...(counts.notMarked ? [{ key: "none", label: "Not marked", value: counts.notMarked }] : []),
  ];
  const savedNow = p.saved && !dirty;
  const lateCount = counts.c.late ?? 0;
  const saveLabel = pending ? "Saving…" : savedNow ? "Saved" : `Save attendance: ${counts.c.present ?? 0} present, ${counts.c.absent ?? 0} absent${lateCount ? `, ${lateCount} late` : ""}${counts.notMarked ? `, ${counts.notMarked} not marked` : ""}`;

  return (
    <div className="pb-4 relative">
      {/* Status banner */}
      {readOnly ? (
        <Banner tone="warn" icon={Lock} className="mb-4" title={`Attendance for ${p.dateText} locked at ${p.lockText}.`}
          action={<Link href={p.correctionHref} className={buttonClass("secondary", "sm")}>Request a correction</Link>}>
          A change now needs a correction request. The principal approves it, and the original stays in the audit log.
        </Banner>
      ) : savedNow ? (
        <Banner tone="ok" icon={CircleCheck} className="mb-4" role="status" title={`Saved at ${p.savedAtText}${p.savedBy ? ` by ${p.savedBy}` : ""}.`}>
          {p.locked ? `It locked at ${p.lockText}; your changes are recorded in the audit log.` : `You can change it until ${p.lockText}.`}
        </Banner>
      ) : p.locked ? (
        <Banner tone="info" icon={Info} className="mb-4" title={`Locked at ${p.lockText}.`}>You may still change it; every change is recorded in the audit log.</Banner>
      ) : p.defaultStatus === "present" ? (
        <Banner tone="info" icon={Info} className="mb-4" title="Everyone starts as present.">Tap only the students who are absent or late.</Banner>
      ) : (
        <Banner tone="info" icon={Info} className="mb-4" title="Nobody is marked yet.">Tap P, A or L for each student, or mark everyone present first.</Banner>
      )}

      {/* Counts + tools */}
      <div className="flex flex-col md:flex-row gap-3 md:items-center mb-4">
        <div className={cx("grid gap-2 flex-1", tiles.length === 5 ? "grid-cols-5" : "grid-cols-4")} aria-live="polite">
          {tiles.map((t) => (
            <div key={t.key} className="rounded-xl bg-surface border border-line px-3 py-2.5 min-w-0">
              <p className={cx("font-display text-[22px] font-semibold tnum leading-none", t.key === "none" ? "text-ink3" : STATUS_SOFT[byKey.get(t.key)?.tone ?? "neutral"])}>{t.value}</p>
              <p className="text-[12px] text-ink3 font-semibold mt-1 truncate">{t.label}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 md:w-56">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none" aria-hidden="true" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or roll no." aria-label="Find a student by name or roll number"
              className="h-11 w-full rounded-xl bg-surface border border-line pl-9 pr-9 text-[14.5px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 [&::-webkit-search-cancel-button]:hidden" />
            {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 size-8 grid place-items-center rounded-lg text-ink3 hover:bg-sunken"><X size={15} aria-hidden="true" /></button>}
          </div>
          {!readOnly && <Button variant="secondary" icon={CheckCheck} className="h-11" disabled={!changed} onClick={() => setConfirmAll(true)}>All present</Button>}
        </div>
      </div>

      {problem && (
        <Banner tone="bad" role="alert" className="mb-4"
          action={problem.link ? <Link href={problem.link.href} className={buttonClass("secondary", "sm")}>{problem.link.label}</Link> : undefined}>
          {problem.text}
        </Banner>
      )}

      {/* Students */}
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2" aria-label={`Students of ${p.sectionName}`}>
        {list.map((s) => {
          const m = marks[s.id];
          const v = m?.statusKey ?? null;
          const st = v ? byKey.get(v) : undefined;
          const isFixed = fixed(s);
          const extra = v && !quick.includes(v) && !isFixed ? st : undefined;
          return (
            <li key={s.id} className={cx("min-w-0 flex items-center gap-2.5 md:gap-3 rounded-2xl border bg-surface px-3 py-2.5 transition",
              v === "absent" ? "border-bad/40 bg-bad/[.04]" : v === "late" ? "border-warn/40 bg-warn/[.04]" : isFixed ? "border-line bg-sunken/40" : "border-line")}>
              <span className="w-6 text-center text-[13px] font-semibold text-ink3 tnum shrink-0">{s.roll ?? "–"}</span>
              <Avatar name={s.name} src={s.photoUrl} size={36} className="hidden sm:inline-grid" />
              <div className="min-w-0 flex-1">
                <p className={cx("font-semibold text-[14.5px] truncate", isFixed && "text-ink2")}>{s.name}</p>
                <p className="text-[12px] text-ink3 truncate">
                  {isFixed ? `On approved leave · ${s.leave!.reason || s.leave!.typeName}`
                    : readOnly ? (m?.note || s.admissionNo)
                      : <button type="button" onClick={() => setNoteFor(s.id)} className="hover:text-brand text-left truncate max-w-full">{m?.note ? m.note : s.leave?.halfDay ? "Half-day leave approved · Add note" : "Add note"}</button>}
                </p>
              </div>
              {isFixed ? <Pill tone="info">Leave</Pill> : (
                <div className="flex gap-1 shrink-0" role="radiogroup" aria-label={`Attendance for ${s.name}`}>
                  {extra && (
                    <button type="button" role="radio" aria-checked="true" aria-label={extra.name} title={`${extra.name}. Tap to choose another status.`} disabled={readOnly}
                      onClick={() => setNoteFor(s.id)}
                      className={cx("min-w-10 h-10 md:min-w-11 md:h-11 px-1.5 rounded-xl border text-[13px] font-bold transition", STATUS_ON[extra.tone] ?? STATUS_ON.neutral)}>
                      {extra.letter}
                    </button>
                  )}
                  {quick.map((k) => {
                    const sk = byKey.get(k)!;
                    const on = v === k;
                    return (
                      <button key={k} type="button" role="radio" aria-checked={on} aria-label={sk.name} disabled={readOnly}
                        onClick={() => { if (longPressed.current) { longPressed.current = false; return; } set(s.id, { statusKey: k }); }}
                        onPointerDown={() => { if (readOnly) return; longPressed.current = false; pressTimer.current = setTimeout(() => { longPressed.current = true; setNoteFor(s.id); }, 550); }}
                        onPointerUp={() => { if (pressTimer.current) clearTimeout(pressTimer.current); }}
                        onPointerLeave={() => { if (pressTimer.current) clearTimeout(pressTimer.current); }}
                        onContextMenu={(e) => { e.preventDefault(); if (!readOnly) setNoteFor(s.id); }}
                        className={cx("w-10 h-10 md:w-11 md:h-11 rounded-xl border text-[14px] font-bold transition select-none disabled:cursor-not-allowed",
                          on ? STATUS_ON[sk.tone] ?? STATUS_ON.neutral : "border-line text-ink3 hover:border-ink3/60 hover:text-ink")}>
                        {sk.letter}
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {list.length === 0 && <p className="text-center text-ink3 py-10">No student called “{q}” in {p.sectionName}.</p>}

      {/* Save bar */}
      {!readOnly && (
        <div className="sticky bottom-[calc(68px+env(safe-area-inset-bottom))] md:bottom-0 z-20 mt-4 -mx-4 md:mx-0 px-4 md:px-0 pb-3 pt-3 bg-gradient-to-t from-bg via-bg to-bg/0">
          <Button variant="primary" size="lg" className="w-full !h-14 !text-[16px] shadow-pop" icon={savedNow ? Check : Save} loading={pending} onClick={save} disabled={savedNow}>
            {saveLabel}
          </Button>
        </div>
      )}

      <Dialog open={confirmAll} onClose={() => setConfirmAll(false)} title="Mark everyone present again?" sub="The absent and late marks you made will be cleared. Students on leave stay on leave."
        footer={<><Button variant="ghost" onClick={() => setConfirmAll(false)}>Keep my marks</Button><Button variant="primary" onClick={markAllPresent}>Mark all present</Button></>}>
        <div />
      </Dialog>

      <NoteSheet row={noteRow} mark={noteRow ? marks[noteRow.id] : undefined} statuses={p.statuses} extra={extraStatuses}
        onClose={() => setNoteFor(null)}
        onSave={(statusKey, note) => { if (noteRow) set(noteRow.id, { statusKey, note }); setNoteFor(null); }} />
    </div>
  );
}

function NoteSheet({ row, mark, statuses, extra, onClose, onSave }: {
  row: SheetRow | null; mark: Mark | undefined; statuses: SheetStatus[]; extra: SheetStatus[];
  onClose: () => void; onSave: (statusKey: string | null, note: string) => void;
}) {
  const [t, setT] = useState("");
  const [st, setSt] = useState<string | null>(null);
  const [forId, setForId] = useState<string | null>(null);
  if (row && row.id !== forId) { setForId(row.id); setT(mark?.note ?? ""); setSt(mark?.statusKey ?? null); }
  return (
    <Dialog open={Boolean(row)} onClose={onClose} title={row ? `Note for ${row.name}` : "Note"} sub="Only staff can see this"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onSave(st, t.trim().slice(0, 300))}>Save note</Button></>}>
      {row && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-[13px] font-semibold text-ink2 mb-2">Status</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`Status for ${row.name}`}>
              {statuses.map((s) => {
                const on = st === s.key;
                return (
                  <button key={s.key} type="button" role="radio" aria-checked={on} onClick={() => setSt(s.key)}
                    className={cx("h-10 px-3 rounded-xl border text-[13.5px] font-semibold inline-flex items-center gap-2 transition", on ? STATUS_ON[s.tone] ?? STATUS_ON.neutral : "border-line text-ink2 hover:border-ink3/60")}>
                    <span className="font-bold">{s.letter}</span>{s.name}
                  </button>
                );
              })}
            </div>
            {extra.length > 0 && <p className="text-[12.5px] text-ink3 mt-2">P, A and L are on the list. The others are here.</p>}
          </div>
          <QuickChips items={NOTE_CHIPS} onPick={setT} />
          <label className="flex flex-col gap-1.5">
            <span className="sr-only">Note</span>
            <textarea value={t} onChange={(e) => setT(e.target.value)} rows={3} maxLength={300} placeholder="Type a short note"
              className={cx(inputCls(false), "p-3 text-[15px]")} />
          </label>
        </div>
      )}
    </Dialog>
  );
}
