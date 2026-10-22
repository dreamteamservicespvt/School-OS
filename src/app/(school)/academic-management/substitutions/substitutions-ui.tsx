"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { SelectField, TextField } from "@/components/ui/field";
import { FormDialog, err, v } from "../_components/form-dialog";
import { assignAction, endCoverAction, markAbsentAction, removeSubstituteAction, suggestAction, temporaryTeacherAction, unmarkAbsentAction } from "./actions";
import { KeepCheck } from "@/components/ui/keep-select";
import { Words } from "@/lib/i18n/client";

export type Need = {
  periodId: string; periodNo: number; startTime: string; endTime: string; sectionLabel: string; subjectName: string | null;
  absentStaffId: string; absentName: string; reason: string;
  substitution: { id: string; status: string; substituteId: string | null; substituteName: string | null; note: string | null } | null;
};
type Suggestion = { id: string; name: string; designation: string; sameSubject: boolean; sameClass: boolean; thisWeek: number; why: string };

const REASON: Record<string, string> = { leave: "Leave", absent: "Absent", temporary: "Temporary teacher" };
const t12 = (t: string) => { const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };

export function NeedsList({ rows, date, canArrange }: { rows: Need[]; date: string; canArrange: boolean }) {
  const router = useRouter();
  const [assign, setAssign] = useState<{ teacher: string; periods: Need[]; chosen: string[] } | null>(null);
  const groups = new Map<string, Need[]>();
  for (const r of rows) groups.set(r.absentStaffId, [...(groups.get(r.absentStaffId) ?? []), r]);

  return (
    <>
      <div className="space-y-4">
        {[...groups.entries()].map(([staffId, list]) => {
          const open = list.filter((r) => r.substitution?.status !== "ARRANGED");
          return (
            <section key={staffId} aria-label={list[0].absentName} className="overflow-hidden rounded-2xl border border-line bg-surface">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-4 py-2">
                <h2 className="font-semibold">{list[0].absentName} <span className="font-normal text-ink-2">· {REASON[list[0].reason] ?? list[0].reason} · {list.length} {list.length === 1 ? "period" : "periods"}</span></h2>
                {canArrange && open.length > 1 && (
                  <Button size="sm" onClick={() => setAssign({ teacher: list[0].absentName, periods: open, chosen: open.map((p) => p.periodId) })}><Words k="Arrange all" /> {open.length}</Button>
                )}
              </header>
              <ul className="divide-y divide-line">
                {list.map((r) => {
                  const arranged = r.substitution?.status === "ARRANGED";
                  return (
                    <li key={r.periodId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                      <div className="w-24 shrink-0 text-sm"><span className="block font-semibold"><Words k="Period" /> {r.periodNo}</span><span className="text-ink-2">{t12(r.startTime)}</span></div>
                      <div className="min-w-40 flex-1">
                        <p className="font-medium">{r.sectionLabel} · {r.subjectName ?? "Period"}</p>
                        {arranged ? <p className="text-sm"><Words k="Substitute:" /> <strong>{r.substitution!.substituteName}</strong>{r.substitution!.note ? ` · ${r.substitution!.note}` : ""}</p> : <p><Badge tone="danger"><Words k="Needed" /></Badge></p>}
                      </div>
                      {canArrange && (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant={arranged ? "secondary" : "primary"} onClick={() => setAssign({ teacher: r.absentName, periods: list.filter((x) => x.substitution?.status !== "ARRANGED" || x.periodId === r.periodId), chosen: [r.periodId] })}>
                            {arranged ? "Change" : "Assign substitute"}
                          </Button>
                          {arranged && (
                            <ConfirmButton trigger="Remove" triggerVariant="ghost" triggerClassName="text-danger" title="Remove this substitute?" confirmLabel="Remove substitute" confirmVariant="danger"
                              onConfirm={async () => { const p = await removeSubstituteAction(r.substitution!.id); if (!p) router.refresh(); return p; }}>
                              {r.substitution!.substituteName} <Words k="is told they no longer cover" /> {r.sectionLabel}<Words k=", period" /> {r.periodNo}<Words k=". The period shows as Needed again." />
                            </ConfirmButton>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      {assign && <AssignDialog key={assign.chosen.join(",")} teacher={assign.teacher} periods={assign.periods} initial={assign.chosen} date={date} onClose={() => setAssign(null)} />}
    </>
  );
}

function AssignDialog({ teacher, periods, initial, date, onClose }: { teacher: string; periods: Need[]; initial: string[]; date: string; onClose: () => void }) {
  const [chosen, setChosen] = useState<string[]>(initial);
  const [result, setResult] = useState<{ key: string; list: Suggestion[]; error: string | null }>({ key: "", list: [], error: null });
  const [pick, setPick] = useState("");
  const key = chosen.join(",");

  useEffect(() => {
    if (!key) return;
    let live = true;
    suggestAction(key.split(","), date).then((r) => {
      if (!live) return;
      setResult({ key, list: r.suggestions, error: r.error ?? null });
      setPick((p) => (r.suggestions.some((s) => s.id === p) ? p : r.suggestions[0]?.id ?? ""));
    }).catch(() => { if (live) setResult({ key, list: [], error: "Could not load free teachers. Try again." }); });
    return () => { live = false; };
  }, [key, date]);
  const list: Suggestion[] | null = !key ? [] : result.key === key ? result.list : null;
  const error = result.key === key ? result.error : null;

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <FormDialog open onClose={onClose} title={`Substitute for ${teacher}`} action={assignAction} submitLabel={chosen.length > 1 ? `Assign for ${chosen.length} periods` : "Assign substitute"} hidden={{ date }} wide>
      {(state) => (
        <>
          <fieldset>
            <legend className="mb-1 text-sm font-medium"><Words k="Periods" /></legend>
            <div className="flex flex-wrap gap-2">
              {periods.map((p) => (
                <label key={p.periodId} className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm ${chosen.includes(p.periodId) ? "border-brand bg-brand-soft" : "border-line"}`}>
                  <KeepCheck type="checkbox" name="periodIds" value={p.periodId} className="size-5" checked={chosen.includes(p.periodId)} onChange={() => toggle(p.periodId)} />
                  <Words k="Period" /> {p.periodNo}, {p.sectionLabel}
                </label>
              ))}
            </div>
            {periods.length > 1 && <p className="mt-1 text-xs text-ink-2"><Words k="Choose several to give them all to one teacher. Only teachers free in all of them are listed." /></p>}
            {err(state, "periodIds") && <p className="mt-1 text-sm text-danger">{err(state, "periodIds")}</p>}
          </fieldset>
          <fieldset aria-describedby="sub-help">
            <legend className="mb-1 text-sm font-medium"><Words k="Substitute" /> <span className="text-danger">*</span></legend>
            <p id="sub-help" className="mb-2 text-xs text-ink-2"><Words k="Only free teachers are shown, best match first: teaches the same subject, teaches the class, fewest substitutions this week." /></p>
            {error && <p className="text-sm text-danger" role="alert">{error}</p>}
            {list === null ? <p className="text-sm text-ink-2" aria-live="polite"><Words k="Finding free teachers…" /></p> : list.length === 0 ? (
              <p className="rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn-text">{chosen.length === 0 ? "Choose a period first." : "No teacher is free in all the chosen periods. Choose fewer periods."}</p>
            ) : (
              <ul className="max-h-[40vh] space-y-1 overflow-y-auto">
                {list.map((s, i) => (
                  <li key={s.id}>
                    <label className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 ${pick === s.id ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2"}`}>
                      <KeepCheck type="radio" name="substituteId" value={s.id} className="mt-1 size-5" checked={pick === s.id} onChange={() => setPick(s.id)} />
                      <span>
                        <span className="font-medium">{s.name}</span>{i === 0 && <Badge tone="success" className="ml-2"><Words k="Best match" /></Badge>}
                        <span className="block text-sm text-ink-2">{[s.designation, s.why].filter(Boolean).join(" · ")}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {err(state, "substituteId") && <p className="mt-1 text-sm text-danger">{err(state, "substituteId")}</p>}
          </fieldset>
          <TextField label="Note" name="note" defaultValue={v(state, "note")} placeholder="Revise chapter 4 with them" error={err(state, "note")} />
        </>
      )}
    </FormDialog>
  );
}

export function MarkAbsentButton({ teachers, date }: { teachers: { id: string; name: string }[]; date: string }) {
  return (
    <FormDialog trigger="Mark a teacher absent" title="Mark a teacher absent" action={markAbsentAction} submitLabel="Mark absent">
      {(state) => (
        <>
          <SelectField label="Teacher" name="staffId" required defaultValue={v(state, "staffId")} placeholder="Choose a teacher" options={teachers.map((t) => ({ value: t.id, label: t.name }))} error={err(state, "staffId")} />
          <TextField label="Date" name="date" type="date" required defaultValue={v(state, "date", date)} error={err(state, "date")} />
          <TextField label="Note" name="note" defaultValue={v(state, "note")} placeholder="Unwell, called at 7:30" error={err(state, "note")} />
          <p className="text-sm text-ink-2"><Words k={"Their periods that day are listed as needing a substitute. For leave, approve it in Staff & HR instead; it shows here by itself."} /></p>
        </>
      )}
    </FormDialog>
  );
}

export function TemporaryTeacherButton({ teachers, today }: { teachers: { id: string; name: string }[]; today: string }) {
  return (
    <FormDialog trigger="Temporary teacher" title="Temporary teacher for a longer absence" action={temporaryTeacherAction} submitLabel="Name temporary teacher">
      {(state) => (
        <>
          <SelectField label="Absent teacher" name="absentStaffId" required defaultValue={v(state, "absentStaffId")} placeholder="Choose a teacher" options={teachers.map((t) => ({ value: t.id, label: t.name }))} error={err(state, "absentStaffId")} />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="From" name="fromDate" type="date" required min={today} defaultValue={v(state, "fromDate", today)} error={err(state, "fromDate")} />
            <TextField label="To" name="toDate" type="date" required min={today} defaultValue={v(state, "toDate")} error={err(state, "toDate")} />
          </div>
          <SelectField label="Temporary teacher" name="tempStaffId" required defaultValue={v(state, "tempStaffId")} placeholder="Choose a teacher" options={teachers.map((t) => ({ value: t.id, label: t.name }))} error={err(state, "tempStaffId")}
            help="A newly hired temporary teacher is added in Staff & HR first." />
          <TextField label="Note" name="note" defaultValue={v(state, "note")} error={err(state, "note")} />
          <p className="text-sm text-ink-2"><Words k="They take the absent teacher's periods on every school day in between. Periods that clash with their own classes stay Needed." /></p>
        </>
      )}
    </FormDialog>
  );
}

export function UnmarkAbsent({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger="Remove" triggerVariant="ghost" triggerClassName="text-danger" title={`Remove ${name}'s absence?`} confirmLabel="Remove absence" confirmVariant="danger"
      onConfirm={async () => { const p = await unmarkAbsentAction(id); if (!p) router.refresh(); return p; }}>
      <Words k="Substitutions arranged for it are cancelled and the substitutes are told." />
    </ConfirmButton>
  );
}

export function EndCover({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger="End" triggerVariant="ghost" triggerClassName="text-danger" title={`End ${name}'s temporary cover?`} confirmLabel="End temporary teacher" confirmVariant="danger"
      onConfirm={async () => { const p = await endCoverAction(id); if (!p) router.refresh(); return p; }}>
      <Words k="From today, the periods go back to the regular teacher. Past substitutions stay in the history." />
    </ConfirmButton>
  );
}
