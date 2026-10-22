"use client";

// Staff Attendance for one day (05 §2): mark all present, then the
// exceptions; in and out times; late arrivals highlighted with minutes late.
// Marks from devices, QR and mobile show their source and can be corrected.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchIcon } from "@/components/icons";
import { saveStaffDay } from "../staff/actions";
import { toneClass, type StatusView } from "./status";
import { Words } from "@/lib/i18n/client";

export type StaffSheetRow = {
  id: string; name: string; code: string; designation: string; department: string | null; shift: string | null; start: string;
  onLeave: boolean; statusKey: string | null; inTime: string; outTime: string; method: string | null; methodText: string | null;
  lateMinutes: number | null; note: string; overtime: string | null;
};

type Props = {
  date: string; dateText: string; rows: StaffSheetRow[]; statuses: StatusView[];
  canEdit: boolean; locked: boolean; lockText: string; override: boolean; correctionHref: string;
};

type Edit = { statusKey: string | null; inTime: string; outTime: string; note: string };
const CYCLE = ["present", "absent", "late", "half-day"];

export function StaffSheet(p: Props) {
  const router = useRouter();
  const byKey = useMemo(() => new Map(p.statuses.map((s) => [s.key, s])), [p.statuses]);
  const cycle = CYCLE.filter((k) => byKey.has(k));
  const [edits, setEdits] = useState<Record<string, Edit>>(() => Object.fromEntries(p.rows.map((r) => [r.id, {
    statusKey: r.statusKey ?? (r.onLeave ? "leave" : null), inTime: r.inTime, outTime: r.outTime, note: r.note,
  }])));
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string; link?: { href: string; label: string } } | null>(null);
  const [pending, start] = useTransition();
  const frozen = (r: StaffSheetRow) => !p.canEdit || (p.locked && !p.override && r.statusKey !== null);

  const change = (id: string, c: Partial<Edit>) => {
    setEdits((e) => ({ ...e, [id]: { ...e[id], ...c } }));
    setDirty((d) => new Set(d).add(id));
    setResult(null);
  };
  const allPresent = () => {
    const next = { ...edits };
    const d = new Set(dirty);
    for (const r of p.rows) {
      if (frozen(r) || r.onLeave || next[r.id].statusKey) continue;
      next[r.id] = { ...next[r.id], statusKey: "present" };
      d.add(r.id);
    }
    setEdits(next);
    setDirty(d);
    setResult(null);
  };
  const shown = q.trim() ? p.rows.filter((r) => `${r.name} ${r.code} ${r.designation} ${r.department ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())) : p.rows;
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    let none = 0;
    for (const r of p.rows) { const k = edits[r.id]?.statusKey; if (k) c[k] = (c[k] ?? 0) + 1; else none++; }
    return { c, none };
  }, [edits, p.rows]);

  const save = () => {
    const entries = [...dirty].flatMap((id) => {
      const e = edits[id];
      return e?.statusKey ? [{ staffId: id, statusKey: e.statusKey, inTime: e.inTime || null, outTime: e.outTime || null, note: e.note.trim() || null }] : [];
    });
    if (entries.length === 0) { setResult({ ok: false, text: "Nothing to save. Mark someone first." }); return; }
    start(async () => {
      try {
        const r = await saveStaffDay({ date: p.date, entries });
        setResult({ ok: r.ok, text: r.message, link: r.link });
        if (r.ok) { setDirty(new Set()); router.refresh(); }
      } catch {
        setResult({ ok: false, text: "No internet or a problem on our side. Your marks are still on the screen. Please try again." });
      }
    });
  };

  return (
    <div className={p.canEdit ? "pb-28" : ""}>
      {p.locked && !p.override && p.canEdit && (
        <Alert tone="warning" className="mb-3" title={`Attendance for ${p.dateText} locked at ${p.lockText}.`}
          action={<Link href={p.correctionHref} className={buttonClass("secondary", "sm")}><Words k="Request a correction" /></Link>}>
          <Words k="Staff not yet marked can still be marked. A change to a saved mark needs a correction request." />
        </Alert>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-60">
          <SearchIcon className="pointer-events-none absolute left-3 top-3 size-5 text-ink-2" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, staff ID or department" aria-label="Search staff"
            className="h-11 w-full rounded-lg border border-line-strong bg-surface pl-10 pr-3 text-base" />
        </div>
        {p.canEdit && <Button variant="secondary" onClick={allPresent}><Words k="Mark all present" /></Button>}
      </div>
      <ul className="mb-3 flex flex-wrap gap-1.5 text-sm" aria-live="polite" aria-label="Counts">
        {p.statuses.filter((s) => counts.c[s.key]).map((s) => (
          <li key={s.key} className={`rounded-full border px-2.5 py-1 ${toneClass(s.tone)}`}><span className="font-semibold tabular-nums">{counts.c[s.key]}</span> {s.name.toLowerCase()}</li>
        ))}
        <li className="rounded-full border border-line-strong px-2.5 py-1 text-ink-2"><span className="font-semibold tabular-nums">{counts.none}</span> <Words k="not marked" /></li>
      </ul>
      {result && (
        <Alert tone={result.ok ? "success" : "danger"} className="mb-3" action={result.link ? <Link href={result.link.href} className="font-medium underline">{result.link.label}</Link> : undefined}>{result.text}</Alert>
      )}
      {shown.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-ink-2"><Words k="No staff match “" />{q}”.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {shown.map((r) => {
            const e = edits[r.id];
            const st = e?.statusKey ? byKey.get(e.statusKey) : undefined;
            const lock = frozen(r);
            const late = r.lateMinutes && r.lateMinutes > 0 && (e?.statusKey === "late" || e?.statusKey === "half-day");
            return (
              <li key={r.id} className={`grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${late ? "bg-warn-bg/40" : ""}`}>
                <div className="min-w-0">
                  <p className="font-medium">{r.name} <span className="text-sm font-normal text-ink-2">· {r.code}</span></p>
                  <p className="text-sm text-ink-2">{[r.designation, r.department, r.shift ? `${r.shift} shift` : `Starts ${r.start}`].filter(Boolean).join(" · ")}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {r.onLeave && <Badge tone="brand"><Words k="On approved leave" /></Badge>}
                    {late && <Badge tone="warning">{r.lateMinutes} <Words k="min late" /></Badge>}
                    {r.methodText && <Badge>{r.methodText}</Badge>}
                    {r.overtime && <Badge tone="success"><Words k="Overtime" /> {r.overtime}</Badge>}
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <button type="button" disabled={lock} onClick={() => {
                    const now = e?.statusKey ?? null;
                    const i = now ? cycle.indexOf(now) : -1;
                    change(r.id, { statusKey: cycle[(i + 1) % cycle.length] });
                  }} aria-label={`${r.name}: ${st?.name ?? "not marked"}.${lock ? "" : " Tap to change."}`}
                    className={`inline-flex min-h-11 w-28 items-center justify-center gap-1.5 rounded-lg border px-2 text-sm font-medium disabled:cursor-not-allowed ${st ? toneClass(st.tone) : "border-dashed border-line-strong text-ink-2"}`}>
                    {st ? <><span aria-hidden="true" className="font-bold">{st.letter}</span>{st.name}</> : "Not marked"}
                  </button>
                  {!lock && (
                    <select id={`st-${r.id}`} value={e?.statusKey ?? ""} onChange={(ev) => change(r.id, { statusKey: ev.target.value || null })}
                      className="h-11 rounded-lg border border-line-strong bg-surface px-2 text-sm" aria-label={`All statuses for ${r.name}`}>
                      <option value="">More…</option>
                      {p.statuses.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
                    </select>
                  )}
                  <label className="text-xs text-ink-2"><Words k="In" />
                    <input type="time" value={e?.inTime ?? ""} disabled={lock} onChange={(ev) => change(r.id, { inTime: ev.target.value })}
                      className="mt-0.5 block h-11 w-28 rounded-lg border border-line-strong bg-surface px-2 text-sm text-ink" />
                  </label>
                  <label className="text-xs text-ink-2"><Words k="Out" />
                    <input type="time" value={e?.outTime ?? ""} disabled={lock} onChange={(ev) => change(r.id, { outTime: ev.target.value })}
                      className="mt-0.5 block h-11 w-28 rounded-lg border border-line-strong bg-surface px-2 text-sm text-ink" />
                  </label>
                  {lock && p.canEdit && r.statusKey && (
                    <Link href={`${p.correctionHref}&staff=${r.id}`} className="min-h-11 content-center text-sm font-medium text-brand-text hover:underline"><Words k="Correct" /><span className="sr-only"> {r.name}</span></Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {p.canEdit && (
        <div className="fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] md:bottom-0 md:left-[76px] lg:left-[268px] z-20 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-3xl">
            <Button size="lg" className="w-full" onClick={save} loading={pending} loadingText="Saving…" disabled={pending || dirty.size === 0}>
              {dirty.size ? `Save staff attendance: ${dirty.size} ${dirty.size === 1 ? "change" : "changes"}` : "No changes to save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
