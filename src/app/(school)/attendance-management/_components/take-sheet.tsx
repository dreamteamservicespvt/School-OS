"use client";

// Take Attendance (05 §2): everyone starts Present, tap a name's button to
// cycle Present, Absent, Late; "More" (or a long press) opens every status
// and a note. One fixed Save button says what will be saved. Offline, the
// save waits on this phone and is sent when the internet is back.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { saveSheet } from "../actions";
import { toneClass, type StatusView } from "./status";
import { enqueueSave, isNetworkError, newClientId } from "./offline-queue";

export type SheetStatus = StatusView & { counts: string };
export type SheetRow = {
  id: string; roll: number | null; name: string; admissionNo: string; photoUrl: string | null;
  statusKey: string | null; note: string | null;
  leave: { typeName: string; halfDay: boolean } | null;
};

type Props = {
  userId: string;
  sectionId: string; sectionName: string;
  date: string; dateText: string;
  periodNo: number; periodLabel: string | null;
  statuses: SheetStatus[];
  defaultStatus: "present" | "not-marked";
  students: SheetRow[];
  saved: boolean; savedText: string | null;
  locked: boolean; lockText: string; canChangeAfterLock: boolean; correctionHref: string;
  offlineOn: boolean;
};

type Mark = { statusKey: string | null; note: string };
const CYCLE = ["present", "absent", "late"];

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function TakeSheet(p: Props) {
  const router = useRouter();
  const byKey = useMemo(() => new Map(p.statuses.map((s) => [s.key, s])), [p.statuses]);
  const cycle = useMemo(() => CYCLE.filter((k) => byKey.has(k)), [byKey]);
  const start = useCallback((): Record<string, Mark> => {
    const out: Record<string, Mark> = {};
    for (const s of p.students) {
      const onLeave = s.leave && !s.leave.halfDay;
      out[s.id] = { statusKey: s.statusKey ?? (onLeave ? "leave" : p.defaultStatus === "present" ? "present" : null), note: s.note ?? "" };
    }
    return out;
  }, [p.students, p.defaultStatus]);
  // The page gives this sheet a new key when the server's copy changes, so it starts fresh then.
  const [marks, setMarks] = useState<Record<string, Mark>>(start);
  const [dirty, setDirty] = useState(!p.saved && p.defaultStatus === "present");
  const [more, setMore] = useState<string | null>(null);
  const [result, setResult] = useState<{ tone: "success" | "danger" | "info" | "warning"; text: string; link?: { href: string; label: string } } | null>(null);
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

  const fixed = (s: SheetRow) => Boolean(s.leave && !s.leave.halfDay);
  const set = (id: string, change: Partial<Mark>) => {
    setMarks((m) => ({ ...m, [id]: { ...m[id], ...change } }));
    setDirty(true);
    setResult(null);
  };
  const tap = (s: SheetRow) => {
    if (longPressed.current) { longPressed.current = false; return; }
    if (readOnly || fixed(s)) return;
    const now = marks[s.id]?.statusKey;
    const i = now ? cycle.indexOf(now) : -1;
    set(s.id, { statusKey: cycle[(i + 1) % cycle.length] ?? now });
  };
  const allPresent = () => {
    setMarks((m) => {
      const next = { ...m };
      for (const s of p.students) if (!fixed(s)) next[s.id] = { ...next[s.id], statusKey: "present" };
      return next;
    });
    setDirty(true);
    setResult(null);
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
      setResult({ tone: "info", text: "Saved on this phone, will send when online." });
    } else {
      setResult({ tone: "danger", text: "This phone has no room to keep the attendance. Your marks are still on the screen; save again when online." });
    }
  };

  const save = () => {
    const list = entries();
    if (list.length === 0) { setResult({ tone: "danger", text: "Mark at least one student before saving." }); return; }
    if (p.offlineOn && typeof navigator !== "undefined" && navigator.onLine === false) { keepOffline(list); return; }
    startTransition(async () => {
      try {
        const r = await saveSheet({ sectionId: p.sectionId, date: p.date, periodNo: p.periodNo, entries: list, clientId: clientId.current });
        if (r.ok) {
          clientId.current = newClientId();
          setDirty(false);
          setResult({ tone: r.outcome === "correction" ? "warning" : "success", text: r.message, link: r.link });
          router.refresh();
        } else {
          setResult({ tone: "danger", text: r.message, link: r.link });
        }
      } catch (e) {
        if (isNetworkError(e) && p.offlineOn) keepOffline(list);
        else setResult({ tone: "danger", text: isNetworkError(e) ? "No internet. Your marks are still on the screen. Save again when you are online." : "That did not save because of a problem on our side. Your marks are still on the screen. Please try again." });
      }
    });
  };

  const moreRow = p.students.find((s) => s.id === more) ?? null;
  const mainCounts: { key: string; label: string; value: number; tone: string }[] = [
    ...["present", "absent", "late", "leave"].filter((k) => byKey.has(k)).map((k) => ({ key: k, label: byKey.get(k)!.name, value: counts.c[k] ?? 0, tone: byKey.get(k)!.tone })),
    ...p.statuses.filter((s) => !["present", "absent", "late", "leave"].includes(s.key) && counts.c[s.key]).map((s) => ({ key: s.key, label: s.name, value: counts.c[s.key], tone: s.tone })),
    { key: "none", label: "Not marked", value: counts.notMarked, tone: "neutral" },
  ];

  return (
    <div className="pb-28">
      {readOnly && (
        <Alert tone="warning" className="mb-4" title={`Attendance for ${p.dateText} locked at ${p.lockText}.`}
          action={<Link href={p.correctionHref} className={buttonClass("secondary", "sm")}>Request a correction</Link>}>
          A change now needs a correction request. The principal approves it, and the original stays in the audit log.
        </Alert>
      )}
      {p.locked && p.canChangeAfterLock && (
        <Alert tone="info" className="mb-4">Attendance for {p.dateText} locked at {p.lockText}. You may still change it; the change is recorded in the audit log.</Alert>
      )}

      {/* Count bar */}
      <div className="sticky top-0 z-10 -mx-4 mb-3 border-b border-line bg-bg/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-3" aria-live="polite">
        <ul className="flex flex-wrap gap-1.5 text-sm">
          {mainCounts.map((c) => (
            <li key={c.key} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${toneClass(c.tone)}`}>
              <span className="font-semibold tabular-nums">{c.value}</span> {c.label.toLowerCase()}
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-2">
          {p.students.length} students{p.savedText ? ` · ${p.savedText}` : " · Not saved yet"}
        </p>
        {!readOnly && <Button variant="secondary" onClick={allPresent}>Mark all present</Button>}
      </div>

      {result && (
        <Alert tone={result.tone === "warning" ? "warning" : result.tone} className="mb-3"
          action={result.link ? <Link href={result.link.href} className="font-medium underline">{result.link.label}</Link> : undefined}>
          {result.text}
        </Alert>
      )}

      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface" aria-label={`Students of ${p.sectionName}`}>
        {p.students.map((s) => {
          const m = marks[s.id];
          const st = m?.statusKey ? byKey.get(m.statusKey) : undefined;
          const isFixed = fixed(s);
          return (
            <li key={s.id} className={`flex items-center gap-3 px-3 py-2 ${isFixed ? "bg-surface-2 text-ink-2" : ""}`}>
              <span className="w-7 shrink-0 text-right text-sm tabular-nums text-ink-2" aria-label={s.roll ? `Roll ${s.roll}` : "No roll number"}>{s.roll ?? "–"}</span>
              {s.photoUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={s.photoUrl} alt="" className="size-10 shrink-0 rounded-full border border-line object-cover" loading="lazy" />
                : <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand-text">{initials(s.name)}</span>}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.name}</p>
                <p className="truncate text-xs text-ink-2">
                  {s.leave ? `On ${s.leave.typeName.toLowerCase()} leave${s.leave.halfDay ? " (half day)" : ""}` : s.admissionNo}
                  {m?.note ? ` · Note: ${m.note}` : ""}
                </p>
              </div>
              <button type="button" disabled={readOnly || isFixed}
                onClick={() => tap(s)}
                onPointerDown={() => {
                  if (readOnly || isFixed) return;
                  longPressed.current = false;
                  pressTimer.current = setTimeout(() => { longPressed.current = true; setMore(s.id); }, 550);
                }}
                onPointerUp={() => { if (pressTimer.current) clearTimeout(pressTimer.current); }}
                onPointerLeave={() => { if (pressTimer.current) clearTimeout(pressTimer.current); }}
                onContextMenu={(e) => e.preventDefault()}
                aria-label={`${s.name}: ${st?.name ?? "not marked"}.${readOnly || isFixed ? "" : " Tap to change."}`}
                className={`inline-flex min-h-11 w-28 shrink-0 select-none items-center justify-center gap-1.5 rounded-lg border px-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${st ? toneClass(st.tone) : "border-dashed border-line-strong text-ink-2"}`}>
                {st ? <><span aria-hidden="true" className="font-bold">{st.letter}</span>{st.name}</> : "Not marked"}
              </button>
              {!readOnly && !isFixed && (
                <button type="button" onClick={() => setMore(s.id)} aria-label={`More for ${s.name}: every status and a note`}
                  className="grid size-11 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink">
                  <span aria-hidden="true" className="text-xl leading-none">⋯</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {!readOnly && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <Button size="lg" className="w-full" onClick={save} loading={pending} loadingText="Saving…" disabled={pending}>
              Save attendance: {summary}{counts.notMarked ? `, ${counts.notMarked} not marked` : ""}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={Boolean(moreRow)} onClose={() => setMore(null)} title={moreRow ? moreRow.name : "Student"}>
        {moreRow && (
          <div className="space-y-4">
            <fieldset>
              <legend className="mb-2 font-medium">Status</legend>
              <div className="grid grid-cols-2 gap-2">
                {p.statuses.map((s) => {
                  const on = marks[moreRow.id]?.statusKey === s.key;
                  return (
                    <label key={s.key} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 ${on ? toneClass(s.tone) + " ring-2 ring-brand" : "border-line-strong"}`}>
                      <input type="radio" name="status" value={s.key} checked={on} onChange={() => set(moreRow.id, { statusKey: s.key })} className="size-4 accent-[var(--brand)]" />
                      <span className="font-semibold" aria-hidden="true">{s.letter}</span> {s.name}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <label className="block">
              <span className="mb-1 block font-medium">Note <span className="font-normal text-ink-2">(optional)</span></span>
              <textarea rows={3} maxLength={300} value={marks[moreRow.id]?.note ?? ""} onChange={(e) => set(moreRow.id, { note: e.target.value })}
                placeholder="For example: came at 10:15, doctor's visit"
                className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-base" />
            </label>
            <div className="flex justify-end border-t border-line pt-4">
              <Button onClick={() => setMore(null)}>Done</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
