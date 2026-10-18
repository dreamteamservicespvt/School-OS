"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ConfirmButton } from "@/components/ui/confirm";
import { draftRemarksAction, makePdfAction, markCardsAction, saveCoScholasticAction, saveCompetencyAction, saveRemarksAction } from "./actions";

const STATUS_WORDS: Record<string, string> = { NOT_READY: "Not ready", READY: "Ready", PRINTED: "Printed", SENT: "Sent" };
const STATUS_TONE: Record<string, "neutral" | "brand" | "success" | "warning"> = { NOT_READY: "warning", READY: "brand", PRINTED: "success", SENT: "success" };

function useLeaveWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
}

function SaveBar({ dirty, saving, onSave, message }: { dirty: number; saving: boolean; onSave: () => void; message: { ok: boolean; text: string } | null }) {
  return (
    <div className="sticky bottom-20 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 shadow-pop md:bottom-4">
      <p role="status" aria-live="polite" className={message && !message.ok ? "text-danger" : "text-ink-2"}>
        {message ? message.text : dirty ? `${dirty} change${dirty === 1 ? "" : "s"} not saved yet` : "Everything is saved."}
      </p>
      <Button onClick={onSave} disabled={!dirty} loading={saving} loadingText="Saving">Save</Button>
    </div>
  );
}

// ---------- Status board ----------

export type BoardRow = { studentId: string; name: string; rollNo: string | null; admissionNo: string; status: string; missing: string[]; published: boolean };

export function StatusBoard({ rows, sectionId, period, periodLabel, canWrite, directLimit }: { rows: BoardRow[]; sectionId: string; period: string; periodLabel: string; canWrite: boolean; directLimit: number }) {
  const router = useRouter();
  const ready = rows.filter((r) => r.status !== "NOT_READY");
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, startBusy] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const picked = chosen.filter((id) => ready.some((r) => r.studentId === id));
  const pdf = (ids: string[]) => `/examination-results/report-cards/pdf?${new URLSearchParams([["section", sectionId], ["period", period], ...ids.map((id) => ["student", id])])}`;
  const toggleAll = () => setChosen(picked.length === ready.length ? [] : ready.map((r) => r.studentId));

  return (
    <>
      {canWrite && ready.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {ready.length <= directLimit ? (
            <a href={pdf([])} target="_blank" rel="noopener" className={buttonClass("primary")}>Print all ready ({ready.length})</a>
          ) : (
            <Button disabled={busy} loading={busy} onClick={() => startBusy(async () => { const e = await makePdfAction(sectionId, period); setNote(e ?? null); if (!e) router.refresh(); })}>Make PDF of all ready ({ready.length})</Button>
          )}
          {picked.length > 0 && (
            <>
              {picked.length <= directLimit && <a href={pdf(picked)} target="_blank" rel="noopener" className={buttonClass("secondary")}>Print chosen ({picked.length})</a>}
              <ConfirmButton trigger={`Mark ${picked.length} as printed`} title="Mark as printed?" confirmLabel="Mark as printed"
                onConfirm={async () => { const e = await markCardsAction(sectionId, period, picked, "PRINTED"); if (!e) { setChosen([]); router.refresh(); } return e; }}>
                <p>{picked.length} report card{picked.length === 1 ? "" : "s"} of {periodLabel} will show as Printed, for example after a parent-teacher meeting.</p>
              </ConfirmButton>
              <ConfirmButton trigger={`Mark ${picked.length} as sent`} title="Mark as sent?" confirmLabel="Mark as sent"
                onConfirm={async () => { const e = await markCardsAction(sectionId, period, picked, "SENT"); if (!e) { setChosen([]); router.refresh(); } return e; }}>
                <p>Use this when the report cards were handed or sent to parents. Published report cards are on Parent Link already.</p>
              </ConfirmButton>
            </>
          )}
        </div>
      )}
      {note && <Alert tone="danger" className="mb-3">{note}</Alert>}
      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface md:block">
        <table className="w-full text-left text-[15px]">
          <caption className="sr-only">Report card status</caption>
          <thead className="border-b border-line bg-surface-2 text-sm text-ink-2">
            <tr>
              {canWrite && <th scope="col" className="w-12 px-3 py-2"><input type="checkbox" aria-label="Choose every ready report card" checked={ready.length > 0 && picked.length === ready.length} onChange={toggleAll} disabled={ready.length === 0} className="size-5 accent-[var(--brand)]" /></th>}
              <th scope="col" className="px-3 py-2 font-medium">Roll</th>
              <th scope="col" className="px-3 py-2 font-medium">Student</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-3 py-2 font-medium">Not filled in</th>
              <th scope="col" className="px-3 py-2 font-medium"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.studentId}>
                {canWrite && <td className="px-3 py-2"><input type="checkbox" aria-label={`Choose ${r.name}`} disabled={r.status === "NOT_READY"} checked={picked.includes(r.studentId)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, r.studentId] : c.filter((x) => x !== r.studentId)))} className="size-5 accent-[var(--brand)]" /></td>}
                <td className="px-3 py-2 tabular-nums text-ink-2">{r.rollNo ?? ""}</td>
                <th scope="row" className="px-3 py-2 font-medium">{r.name}<span className="block text-sm font-normal text-ink-2">{r.admissionNo}</span></th>
                <td className="px-3 py-2"><Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{STATUS_WORDS[r.status] ?? r.status}</Badge></td>
                <td className="px-3 py-2 text-sm">{r.missing.length ? <span className="text-warn-text">{r.missing.join(", ")}</span> : <span className="text-success">All filled in</span>}</td>
                <td className="px-3 py-2 text-right">{r.status !== "NOT_READY" && <a href={pdf([r.studentId])} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center font-medium text-brand-text hover:underline">View PDF</a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden" aria-label="Report card status">
        {rows.map((r) => (
          <li key={r.studentId} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-start gap-3">
              {canWrite && <input type="checkbox" aria-label={`Choose ${r.name}`} disabled={r.status === "NOT_READY"} checked={picked.includes(r.studentId)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, r.studentId] : c.filter((x) => x !== r.studentId)))} className="mt-1 size-5 accent-[var(--brand)]" />}
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2"><span className="font-medium">{r.rollNo ? `${r.rollNo}. ` : ""}{r.name}</span><Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{STATUS_WORDS[r.status] ?? r.status}</Badge></div>
                {r.missing.length > 0 && <p className="text-sm text-warn-text">Not filled in: {r.missing.join(", ")}</p>}
                {r.status !== "NOT_READY" && <a href={pdf([r.studentId])} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center font-medium text-brand-text">View PDF</a>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------- Remarks ----------

export type RemarkGridRow = { studentId: string; name: string; rollNo: string | null; classTeacherRemark: string; principalRemark: string; attendancePresent: number | null; attendanceWorking: number | null; attendanceFromRegister: boolean };

type RemarkDraft = { ct: string; pr: string; ap: string; aw: string };

export function RemarksGrid({ rows, sectionId, period, classTeacher, principal, suggestions }: { rows: RemarkGridRow[]; sectionId: string; period: string; classTeacher: boolean; principal: boolean; suggestions: boolean }) {
  const router = useRouter();
  const start = useMemo(() => Object.fromEntries(rows.map((r) => [r.studentId, { ct: r.classTeacherRemark, pr: r.principalRemark, ap: r.attendancePresent?.toString() ?? "", aw: r.attendanceWorking?.toString() ?? "" }])) as Record<string, RemarkDraft>, [rows]);
  const [vals, setVals] = useState(start);
  const [hints, setHints] = useState<Record<string, { text: string | null; why: string }>>({});
  // Remarks the teacher started from a suggestion: saved with "prepared by AI, confirmed by <teacher>" in the change history.
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [saving, startSave] = useTransition();
  const [drafting, startDraft] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = rows.filter((r) => JSON.stringify(vals[r.studentId]) !== JSON.stringify(start[r.studentId]));
  useLeaveWarning(changed.length > 0);
  const set = (id: string, k: keyof RemarkDraft, v: string) => { setMessage(null); setVals((x) => ({ ...x, [id]: { ...x[id], [k]: v } })); };
  const typedAttendance = rows.some((r) => !r.attendanceFromRegister);

  const save = () => startSave(async () => {
    const out = changed.map((r) => {
      const v = vals[r.studentId];
      const row: { studentId: string; classTeacherRemark?: string | null; principalRemark?: string | null; attendancePresent?: number | null; attendanceWorking?: number | null; fromSuggestion?: boolean } = { studentId: r.studentId };
      if (classTeacher && v.ct !== start[r.studentId].ct) { row.classTeacherRemark = v.ct; if (kept.has(r.studentId)) row.fromSuggestion = true; }
      if (principal && v.pr !== start[r.studentId].pr) row.principalRemark = v.pr;
      if (classTeacher && !r.attendanceFromRegister && (v.ap !== start[r.studentId].ap || v.aw !== start[r.studentId].aw)) {
        row.attendancePresent = v.ap === "" ? null : Number(v.ap);
        row.attendanceWorking = v.aw === "" ? null : Number(v.aw);
      }
      return row;
    });
    const r = await saveRemarksAction(sectionId, period, out);
    setMessage({ ok: r.ok, text: r.message });
    if (r.ok) router.refresh();
  });

  return (
    <>
      {suggestions && classTeacher && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Button variant="secondary" loading={drafting} loadingText="Drafting" onClick={() => startDraft(async () => {
            const r = await draftRemarksAction(sectionId, period);
            if (!r.ok) { setMessage({ ok: false, text: r.message }); return; }
            setHints(Object.fromEntries(r.drafts.map((d) => [d.studentId, { text: d.text, why: d.why }])));
          })}>Suggest remarks</Button>
          <p className="text-sm text-ink-2">Drafts from each student&apos;s marks and attendance. Nothing is saved until you keep it and press Save.</p>
        </div>
      )}
      <ul className="space-y-3">
        {rows.map((r) => {
          const v = vals[r.studentId];
          const hint = hints[r.studentId];
          return (
            <li key={r.studentId} className="rounded-xl border border-line bg-surface p-4">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{r.rollNo ? `${r.rollNo}. ` : ""}{r.name}</span>
                {r.attendanceFromRegister ? (
                  <span className="text-sm text-ink-2">Attendance {r.attendancePresent}/{r.attendanceWorking} days (from the register)</span>
                ) : (
                  <span className="flex items-center gap-2 text-sm">
                    <label className="flex items-center gap-1">Present <input inputMode="numeric" aria-label={`Days present, ${r.name}`} value={v.ap} disabled={!classTeacher} onChange={(e) => set(r.studentId, "ap", e.target.value.replace(/\D/g, "").slice(0, 3))} className="h-11 w-16 rounded-lg border border-line-strong bg-surface px-2 tabular-nums" /></label>
                    <label className="flex items-center gap-1">of <input inputMode="numeric" aria-label={`Working days, ${r.name}`} value={v.aw} disabled={!classTeacher} onChange={(e) => set(r.studentId, "aw", e.target.value.replace(/\D/g, "").slice(0, 3))} className="h-11 w-16 rounded-lg border border-line-strong bg-surface px-2 tabular-nums" /></label>
                  </span>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Class teacher remark</span>
                  <textarea rows={2} maxLength={500} value={v.ct} disabled={!classTeacher} onChange={(e) => set(r.studentId, "ct", e.target.value)} className="w-full rounded-lg border border-line-strong bg-surface p-2 disabled:bg-surface-2" />
                  {hint && (
                    <span className="mt-1 block rounded-lg border border-dashed border-line-strong bg-surface-2 p-2 text-sm">
                      <Badge tone="brand">Suggestion</Badge>{" "}
                      {hint.text ?? hint.why}
                      {hint.text && <><span className="block text-xs text-ink-2">{hint.why}</span><button type="button" className="mt-1 min-h-9 font-medium text-brand-text hover:underline" onClick={() => { set(r.studentId, "ct", hint.text!); setKept((k) => new Set(k).add(r.studentId)); }}>Use this</button></>}
                    </span>
                  )}
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Principal remark</span>
                  <textarea rows={2} maxLength={500} value={v.pr} disabled={!principal} onChange={(e) => set(r.studentId, "pr", e.target.value)} className="w-full rounded-lg border border-line-strong bg-surface p-2 disabled:bg-surface-2" />
                  {!principal && <span className="text-xs text-ink-2">Written by the Principal.</span>}
                </label>
              </div>
            </li>
          );
        })}
      </ul>
      {typedAttendance && <p className="mt-2 text-sm text-ink-2">Attendance is typed here because no attendance register covers these days.</p>}
      {(classTeacher || principal) && <SaveBar dirty={changed.length} saving={saving} onSave={save} message={message} />}
    </>
  );
}

// ---------- Grade grids: co-scholastic and competencies ----------

export type GradeColumn = { id: string; name: string; options: string[]; group?: string };

export function GradeGrid({ kind, rows, columns, values, sectionId, period, canWrite }: { kind: "co-scholastic" | "competency"; rows: { studentId: string; name: string; rollNo: string | null }[]; columns: GradeColumn[]; values: Record<string, string>; sectionId: string; period: string; canWrite: boolean }) {
  const router = useRouter();
  const [vals, setVals] = useState(values);
  const [saving, startSave] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const keys = Object.keys({ ...values, ...vals }).filter((k) => (vals[k] ?? "") !== (values[k] ?? ""));
  useLeaveWarning(keys.length > 0);
  const key = (s: string, c: string) => `${s}:${c}`;
  const fillColumn = (c: GradeColumn, v: string) => { setMessage(null); setVals((x) => ({ ...x, ...Object.fromEntries(rows.map((r) => [key(r.studentId, c.id), x[key(r.studentId, c.id)] || v])) })); };

  const save = () => startSave(async () => {
    const changes = keys.map((k) => { const [studentId, id] = k.split(":"); return { studentId, id, value: vals[k] || null }; });
    const r = kind === "co-scholastic"
      ? await saveCoScholasticAction(sectionId, period, changes.map((c) => ({ studentId: c.studentId, areaId: c.id, grade: c.value })))
      : await saveCompetencyAction(sectionId, period, changes.map((c) => ({ studentId: c.studentId, competencyId: c.id, level: c.value })));
    setMessage({ ok: r.ok, text: r.message });
    if (r.ok) router.refresh();
  });

  if (columns.length === 0) return null;
  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-left text-[15px]">
          <caption className="sr-only">{kind === "co-scholastic" ? "Co-scholastic grades" : "Competency levels"}</caption>
          <thead className="border-b border-line bg-surface-2 text-sm text-ink-2">
            <tr>
              <th scope="col" className="sticky left-0 bg-surface-2 px-3 py-2 font-medium">Student</th>
              {columns.map((c) => (
                <th key={c.id} scope="col" className="min-w-36 px-3 py-2 align-bottom font-medium">
                  {c.group && <span className="block text-xs font-normal">{c.group}</span>}
                  {c.name}
                  {canWrite && <select aria-label={`Fill empty ${c.name} cells`} value="" onChange={(e) => e.target.value && fillColumn(c, e.target.value)} className="mt-1 block h-9 w-full rounded-lg border border-line bg-surface px-1 text-xs">
                    <option value="">Fill empty…</option>
                    {c.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.studentId}>
                <th scope="row" className="sticky left-0 bg-surface px-3 py-2 font-medium">{r.rollNo ? `${r.rollNo}. ` : ""}{r.name}</th>
                {columns.map((c) => (
                  <td key={c.id} className="px-3 py-1">
                    <select aria-label={`${c.name}, ${r.name}`} value={vals[key(r.studentId, c.id)] ?? ""} disabled={!canWrite} onChange={(e) => { setMessage(null); setVals((x) => ({ ...x, [key(r.studentId, c.id)]: e.target.value })); }}
                      className={`h-11 w-full rounded-lg border px-2 ${(vals[key(r.studentId, c.id)] ?? "") !== (values[key(r.studentId, c.id)] ?? "") ? "border-brand" : "border-line-strong"} bg-surface`}>
                      <option value="">-</option>
                      {c.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canWrite && <SaveBar dirty={keys.length} saving={saving} onSave={save} message={message} />}
    </>
  );
}
