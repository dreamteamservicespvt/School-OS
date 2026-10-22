"use client";

// Add or change a datesheet (08 §2, approved design AddDatesheetSheet):
// 1 · which classes (Single class or Multiple classes), 2 · the exam details,
// 3 · one row per subject with date, start time, duration, room,
// invigilator, maximum marks and pattern. Bulk apply fills one column for
// every subject. Subjects with no date are left out. Problems show on their
// row as you save; every check is made again on the server.

import { Fragment, useActionState, useMemo, useRef, useState } from "react";
import { Check, CircleAlert, User, Users } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/controls";
import { Banner } from "@/components/ui/kit";
import { FieldShell, TextField, SelectField, inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import { saveDatesheet } from "./actions";
import type { FormData as Data, FormRow } from "./form-data";
import { KeepSelect } from "@/components/ui/keep-select";
import { Words } from "@/lib/i18n/client";

const PATTERNS = [{ value: "PERCENTAGE", label: "Percentage" }, { value: "GRADING", label: "Grading" }, { value: "CGPA", label: "CGPA" }];
const DURATIONS = [30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240].map((m) => ({ value: String(m), label: m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` }));
const TIMES = Array.from({ length: 45 }, (_, i) => { const m = 7 * 60 + i * 15; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; });

const key = (classId: string, subjectId: string) => `${classId}|${subjectId}`;
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const time12 = (t: string) => { if (!/^\d{2}:\d{2}$/.test(t)) return ""; const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
const endOf = (t: string, d: number) => { if (!/^\d{2}:\d{2}$/.test(t)) return ""; const e = mins(t) + d; return `${String(Math.floor(e / 60) % 24).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}`; };
const showDay = (iso: string) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : "");
const cell = (bad?: unknown) => cx(inputCls(bad), "!h-10 !text-[14px] !px-2.5");

export function DatesheetForm({ data }: { data: Data }) {
  const exam = data.exam;
  const locked = Boolean(exam?.locked);
  const [state, formAction] = useActionState<FormState, globalThis.FormData>(saveDatesheet, null);
  const [mode, setMode] = useState<"single" | "multi">(exam && exam.classIds.length > 1 ? "multi" : "single");
  const [classIds, setClassIds] = useState<string[]>(exam?.classIds ?? []);
  const currentTerm = data.terms.find((t) => t.start <= data.today && t.end >= data.today) ?? data.terms[0];
  const startDefault = data.today < data.yearStart ? data.yearStart : data.today > data.yearEnd ? data.yearEnd : data.today;
  const [d, setD] = useState({
    title: exam?.title ?? "", examTypeId: exam?.examTypeId ?? "", pattern: exam?.pattern ?? "", termId: exam?.termId ?? currentTerm?.id ?? "",
    startDate: exam?.startDate ?? startDefault, endDate: exam?.endDate ?? addDays(startDefault, 15), gradeScaleId: exam?.gradeScaleId ?? "",
  });
  const [bulk, setBulk] = useState({ startTime: "09:30", durationMin: "180", room: "", maxMarks: "80" });
  const [rows, setRows] = useState<Record<string, FormRow>>(() => Object.fromEntries((exam?.rows ?? []).map((r) => [key(r.classId, r.subjectId), r])));
  const [tried, setTried] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const chosen = data.classes.filter((c) => classIds.includes(c.id));
  // Every subject row, made with defaults when a class is first chosen.
  const allRows = useMemo(() => {
    const out: FormRow[] = [];
    for (const c of chosen) for (const s of c.subjects) {
      out.push(rows[key(c.id, s.id)] ?? { classId: c.id, subjectId: s.id, date: "", startTime: bulk.startTime, durationMin: Number(bulk.durationMin), room: c.name, invigilatorId: s.teacherId ?? "", maxMarks: s.gradeOnly ? 0 : Number(bulk.maxMarks), pattern: "" });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classIds, rows]);

  const subjectOf = (classId: string, subjectId: string) => data.classes.find((c) => c.id === classId)?.subjects.find((s) => s.id === subjectId);
  // In Multiple classes, one row per subject sets the date, time, duration and marks for every chosen class that has it.
  const subjectRows = useMemo(() => {
    const seen = new Map<string, { subjectId: string; name: string; gradeOnly: boolean; classIds: string[] }>();
    for (const c of chosen) for (const s of c.subjects) {
      const x = seen.get(s.id) ?? { subjectId: s.id, name: s.name, gradeOnly: s.gradeOnly, classIds: [] };
      x.classIds.push(c.id);
      seen.set(s.id, x);
    }
    return [...seen.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classIds]);

  function update(target: { classId?: string; subjectId: string }, change: Partial<FormRow>) {
    setRows((prev) => {
      const next = { ...prev };
      for (const r of allRows) {
        if (r.subjectId !== target.subjectId || (target.classId && r.classId !== target.classId)) continue;
        next[key(r.classId, r.subjectId)] = { ...(prev[key(r.classId, r.subjectId)] ?? r), ...change };
      }
      return next;
    });
  }

  function applyColumn(col: "startTime" | "durationMin" | "room" | "maxMarks") {
    setRows((prev) => {
      const next = { ...prev };
      for (const r of allRows) {
        const cur = prev[key(r.classId, r.subjectId)] ?? r;
        if (col === "maxMarks" && subjectOf(r.classId, r.subjectId)?.gradeOnly) continue;
        next[key(r.classId, r.subjectId)] = { ...cur, [col]: col === "startTime" || col === "room" ? bulk[col] : Number(bulk[col]) };
      }
      return next;
    });
  }

  function pickMode(m: "single" | "multi") {
    setMode(m);
    if (m === "single" && classIds.length > 1) setClassIds(classIds.slice(0, 1));
  }

  function toggleClass(id: string) {
    const ids = mode === "single" ? [id] : classIds.includes(id) ? classIds.filter((x) => x !== id) : [...classIds, id];
    setClassIds(ids);
    const first = data.classes.find((c) => c.id === ids[0]);
    if (first && !d.pattern) setD((x) => ({ ...x, pattern: first.pattern }));
  }

  /** The same checks the server makes, so mistakes show on their row before saving. */
  const problems = useMemo(() => {
    const general: string[] = [];
    const byRow: Record<string, string> = {};
    const add = (r: FormRow, m: string) => { const k = key(r.classId, r.subjectId); if (!byRow[k]) byRow[k] = m; };
    if (!d.title.trim()) general.push("Give the exam a title, such as Half Yearly.");
    if (!d.examTypeId) general.push("Choose the exam type.");
    if (!d.pattern) general.push("Choose the exam pattern.");
    if (!d.termId) general.push("Choose the term.");
    if (d.endDate < d.startDate) general.push(`The end date ${showDay(d.endDate)} is before the start date ${showDay(d.startDate)}.`);
    if (classIds.length === 0) general.push("Choose at least one class.");
    const dated = allRows.filter((r) => r.date);
    if (classIds.length && dated.length === 0) general.push("Give a date to at least one subject. Subjects with no date are left out.");
    const overlap = (a: FormRow, b: FormRow) => /^\d{2}:\d{2}$/.test(a.startTime) && /^\d{2}:\d{2}$/.test(b.startTime) && a.date === b.date && mins(a.startTime) < mins(b.startTime) + b.durationMin && mins(b.startTime) < mins(a.startTime) + a.durationMin;
    for (const r of dated) {
      const c = data.classes.find((x) => x.id === r.classId);
      const name = subjectOf(r.classId, r.subjectId)?.name ?? "";
      const h = data.holidays.find((x) => x.from <= r.date && x.to >= r.date);
      if (r.date > d.endDate) add(r, `This date is after the end date (${showDay(d.endDate)}).`);
      else if (r.date < d.startDate) add(r, `This date is before the start date (${showDay(d.startDate)}).`);
      else if (new Date(`${r.date}T00:00:00Z`).getUTCDay() === 0) add(r, `${showDay(r.date)} is a Sunday. Choose a school day.`);
      else if (h) add(r, `${showDay(r.date)} is ${h.title} on the School Calendar.`);
      if (!/^\d{2}:\d{2}$/.test(r.startTime)) add(r, "Choose a start time.");
      if (!subjectOf(r.classId, r.subjectId)?.gradeOnly && (!Number.isInteger(r.maxMarks) || r.maxMarks < 1 || r.maxMarks > 1000)) add(r, "Maximum marks must be a whole number from 1 to 1000.");
      const clash = dated.find((o) => o !== r && o.classId === r.classId && overlap(r, o));
      if (clash && allRows.indexOf(clash) < allRows.indexOf(r)) add(r, `${mode === "multi" ? c?.name : "This class"} already has ${subjectOf(clash.classId, clash.subjectId)?.name} at ${time12(clash.startTime)} on ${showDay(clash.date)}. Change the date or time of ${name}.`);
      const inv = r.invigilatorId && dated.find((o) => o !== r && o.invigilatorId === r.invigilatorId && overlap(r, o));
      if (inv && allRows.indexOf(inv) < allRows.indexOf(r)) add(r, `${data.staff.find((s) => s.id === r.invigilatorId)?.name ?? "A teacher"} already invigilates ${subjectOf(inv.classId, inv.subjectId)?.name} at that time. Choose another invigilator.`);
      const room = r.room.trim().toLowerCase() && dated.find((o) => o !== r && o.room.trim().toLowerCase() === r.room.trim().toLowerCase() && overlap(r, o));
      if (room && allRows.indexOf(room) < allRows.indexOf(r)) add(r, `${r.room} is used by ${data.classes.find((x) => x.id === room.classId)?.name} at that time. Choose another room.`);
    }
    return { general, byRow };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, classIds, allRows, mode]);

  const dis = locked;
  const datedCount = allRows.filter((r) => r.date).length;
  const typeName = (id: string) => data.types.find((t) => t.id === id)?.name ?? "";
  const rowErrors = Object.entries(problems.byRow);
  const issueCount = problems.general.length + rowErrors.length;
  const rowError = (r: FormRow) => (tried ? problems.byRow[key(r.classId, r.subjectId)] ?? null : null);
  // In Multiple classes the shared row shows the first problem of any class.
  const sharedError = (subjectId: string) => (tried ? Object.entries(problems.byRow).find(([k]) => k.endsWith(`|${subjectId}`))?.[1] ?? null : null);

  return (
    <form action={formAction} noValidate
      onSubmit={(e) => {
        setTried(true);
        const bad = locked ? !d.title.trim() : issueCount > 0;
        if (bad) { e.preventDefault(); requestAnimationFrame(() => summaryRef.current?.focus()); }
      }}>
      {exam && <input type="hidden" name="examId" value={exam.id} />}
      <input type="hidden" name="yearId" value={data.yearId} />
      {classIds.map((id) => <input key={id} type="hidden" name="classIds" value={id} />)}
      <input type="hidden" name="rows" value={JSON.stringify(allRows)} />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-6 p-4 md:p-6">
          {locked && <Banner tone="warn" title="Results exist for this datesheet."><Words k="Only the title can change. Ask the Exam In-charge or the Principal if a date or mark needs changing." /></Banner>}
          <div ref={summaryRef} tabIndex={-1} className="outline-none empty:hidden">
            {tried && !locked && issueCount > 0 && (
              <Banner tone="bad" title={issueCount === 1 ? "Please fix this before saving:" : `Please fix ${issueCount} things before saving:`}>
                {[...problems.general, ...rowErrors.map(([k, m]) => { const [c, s] = k.split("|"); return `${mode === "multi" ? `${data.classes.find((x) => x.id === c)?.name} ` : ""}${subjectOf(c, s)?.name}: ${m}`; })].slice(0, 4).join(" ")}{issueCount > 4 ? ` And ${issueCount - 4} more, shown on their rows.` : ""}
              </Banner>
            )}
            {!(tried && issueCount) && <FormMessage state={state} />}
          </div>

          {/* 1 · Which classes */}
          <section className="flex flex-col gap-3" aria-labelledby="ds-1">
            <p id="ds-1" className="eyebrow text-ink3"><Words k="1 · Which classes" /></p>
            {!exam && (
              <div className="grid grid-cols-2 gap-2 max-w-2xl" role="radiogroup" aria-label="Which classes">
                {([["single", "Single class", "Pick one class and fill the schedule", User], ["multi", "Multiple classes", "Same schedule for several classes at once", Users]] as const).map(([v, t, s, Ic]) => (
                  <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => pickMode(v)}
                    className={cx("rounded-2xl border p-3.5 text-left transition", mode === v ? "border-brand ring-1 ring-brand bg-brand/5" : "border-line hover:border-ink3/40")}>
                    <Ic size={18} className={mode === v ? "text-brand" : "text-ink3"} aria-hidden="true" />
                    <span className="block font-semibold text-[14.5px] mt-1.5">{t}</span>
                    <span className="block text-[12.5px] text-ink3">{s}</span>
                  </button>
                ))}
              </div>
            )}
            <FieldShell label={mode === "single" ? "Class" : "Classes"} id="ds-classes" required error={tried && classIds.length === 0 ? "Choose at least one class." : undefined}>
              <div id="ds-classes" className="flex flex-wrap gap-1.5" role="group" aria-label={mode === "single" ? "Class" : "Classes"}>
                {data.classes.map((c) => (
                  <button key={c.id} type="button" disabled={dis} onClick={() => toggleClass(c.id)} aria-pressed={classIds.includes(c.id)}
                    className={cx("h-9 px-3 rounded-xl text-[13.5px] font-semibold border transition disabled:opacity-60", classIds.includes(c.id) ? "bg-ink text-bg border-ink" : "bg-surface border-line text-ink2 hover:border-ink3/50")}>{c.name.replace(/^Class /, "")}</button>
                ))}
              </div>
            </FieldShell>
          </section>

          {/* 2 · Exam details */}
          <section className="flex flex-col gap-3" aria-labelledby="ds-2">
            <p id="ds-2" className="eyebrow text-ink3"><Words k="2 · Exam details" /></p>
            <div className="grid md:grid-cols-2 gap-3 max-w-4xl">
              <TextField label="Title" name="title" required maxLength={60} value={d.title} placeholder="For example Half Yearly" error={state?.errors?.title ?? (tried && !d.title.trim() ? "Give the exam a title, like Half Yearly." : undefined)}
                help="For example FA 1 or Half Yearly" onChange={(e) => setD({ ...d, title: e.target.value })} />
              <SelectField label="Exam type" name="examTypeId" required disabled={dis} value={d.examTypeId} placeholder="Choose" error={state?.errors?.examTypeId ?? (tried && !d.examTypeId ? "Choose the exam type." : undefined)}
                options={data.types.map((t) => ({ value: t.id, label: t.name }))} help="Exam types are set in Exam Settings."
                onChange={(e) => setD({ ...d, examTypeId: e.target.value, title: d.title || typeName(e.target.value) })} />
              <FieldShell label="Exam pattern" id="ds-pattern" required help="Starts as the class's default pattern" error={state?.errors?.pattern ?? (tried && !d.pattern ? "Choose the exam pattern." : undefined)}>
                <Segmented value={d.pattern} onChange={(v) => !dis && setD({ ...d, pattern: v })} options={PATTERNS} className="w-full" label="Exam pattern" />
                <input type="hidden" name="pattern" value={d.pattern} />
              </FieldShell>
              <SelectField label="Term" name="termId" required disabled={dis} value={d.termId} placeholder="Choose" options={data.terms.map((t) => ({ value: t.id, label: t.name }))} error={state?.errors?.termId}
                onChange={(e) => setD({ ...d, termId: e.target.value })} />
              <TextField label="Start date" name="startDate" type="date" required disabled={dis} value={d.startDate} min={data.yearStart} max={data.yearEnd} error={state?.errors?.startDate}
                onChange={(e) => setD({ ...d, startDate: e.target.value, endDate: d.endDate < e.target.value || !exam ? addDays(e.target.value, 15) : d.endDate })} />
              <TextField label="End date" name="endDate" type="date" required disabled={dis} value={d.endDate} min={d.startDate} max={data.yearEnd} error={state?.errors?.endDate ?? (tried && d.endDate < d.startDate ? "The end date is before the start date." : undefined)}
                onChange={(e) => setD({ ...d, endDate: e.target.value })} help="15 days after the start unless you change it" />
              <SelectField label="Grade scale" name="gradeScaleId" disabled={dis} value={d.gradeScaleId} placeholder="The class's board scale (usual)" options={data.scales.map((s) => ({ value: s.id, label: s.name }))}
                onChange={(e) => setD({ ...d, gradeScaleId: e.target.value })} help="Leave this unless this exam uses a different scale." />
            </div>
            {dis && (<>
              <input type="hidden" name="examTypeId" value={d.examTypeId} /><input type="hidden" name="termId" value={d.termId} />
              <input type="hidden" name="startDate" value={d.startDate} /><input type="hidden" name="endDate" value={d.endDate} /><input type="hidden" name="gradeScaleId" value={d.gradeScaleId} />
            </>)}
          </section>

          {/* 3 · Subject schedule */}
          <section className="flex flex-col gap-3" aria-labelledby="ds-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p id="ds-3" className="eyebrow text-ink3"><Words k="3 · Subject schedule" /></p>
              {chosen.length > 0 && <p className="text-[12.5px] text-ink3" aria-live="polite">{datedCount} <Words k="of" /> {allRows.length} {mode === "multi" ? "papers" : "subjects"} <Words k="dated" /></p>}
            </div>
            {state?.errors?.schedule && <p role="alert" className="text-[12.5px] text-bad flex items-center gap-1.5"><CircleAlert size={14} aria-hidden="true" />{state.errors.schedule}</p>}
            {chosen.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-[14px] text-ink3"><Words k="Choose" /> {mode === "single" ? "a class" : "the classes"} <Words k="above to list their subjects." /></p>
            ) : (
              <>
                {!dis && (
                  <div className="rounded-2xl bg-sunken/60 p-3 flex flex-col gap-2.5">
                    <p className="text-[13px] font-semibold text-ink2"><Words k="Bulk apply · each Apply changes only its own column" /></p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      <BulkBox label="Start time" onApply={() => applyColumn("startTime")}>
                        <KeepSelect aria-label="Start time for all" value={bulk.startTime} onChange={(e) => setBulk({ ...bulk, startTime: e.target.value })} className={cx(inputCls(), "h-11")}>
                          {TIMES.map((t) => <option key={t} value={t}>{time12(t)}</option>)}
                        </KeepSelect>
                      </BulkBox>
                      <BulkBox label="Duration" onApply={() => applyColumn("durationMin")}>
                        <KeepSelect aria-label="Duration for all" value={bulk.durationMin} onChange={(e) => setBulk({ ...bulk, durationMin: e.target.value })} className={cx(inputCls(), "h-11")}>
                          {DURATIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </KeepSelect>
                      </BulkBox>
                      {mode === "single" && (
                        <BulkBox label="Location" onApply={() => applyColumn("room")}>
                          <input aria-label="Location for all" value={bulk.room} maxLength={40} placeholder="Class room" onChange={(e) => setBulk({ ...bulk, room: e.target.value })} className={cx(inputCls(), "h-11")} />
                        </BulkBox>
                      )}
                      <BulkBox label="Max marks" onApply={() => applyColumn("maxMarks")}>
                        <input inputMode="numeric" aria-label="Maximum marks for all" value={bulk.maxMarks} onChange={(e) => setBulk({ ...bulk, maxMarks: e.target.value.replace(/\D/g, "") })} className={cx(inputCls(), "h-11 tnum")} />
                      </BulkBox>
                    </div>
                  </div>
                )}

                {mode === "single" ? (
                  <ScheduleRows dis={dis} rows={allRows} label={(r) => subjectOf(r.classId, r.subjectId)?.name ?? ""} gradeOnly={(r) => Boolean(subjectOf(r.classId, r.subjectId)?.gradeOnly)}
                    staff={data.staff} onChange={(r, c) => update({ classId: r.classId, subjectId: r.subjectId }, c)} showRoom error={rowError} roomHint={chosen[0]?.name ?? "Class room"} />
                ) : (
                  <>
                    <ScheduleRows dis={dis} rows={subjectRows.map((s) => allRows.find((r) => r.subjectId === s.subjectId && r.classId === s.classIds[0])!)}
                      label={(r) => { const s = subjectRows.find((x) => x.subjectId === r.subjectId)!; return `${s.name}${s.classIds.length < chosen.length ? ` (${s.classIds.length} of ${chosen.length})` : ""}`; }}
                      gradeOnly={(r) => Boolean(subjectRows.find((x) => x.subjectId === r.subjectId)?.gradeOnly)}
                      staff={data.staff} onChange={(r, c) => update({ subjectId: r.subjectId }, c)} showRoom={false} error={(r) => sharedError(r.subjectId)} roomHint="" />
                    <details className="rounded-2xl border border-line">
                      <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold text-[14px]"><Words k="Rooms and invigilators for each class" /></summary>
                      <div className="flex flex-col gap-4 border-t border-line p-4">
                        <p className="text-[13px] text-ink3"><Words k="Each class starts in its own room with its subject teacher invigilating. Two classes cannot share a room or an invigilator at the same time." /></p>
                        {chosen.map((c) => (
                          <div key={c.id}>
                            <p className="font-semibold text-[14px] mb-1.5">{c.name}</p>
                            <ul className="flex flex-col divide-y divide-line/70 border-y border-line/70">
                              {allRows.filter((r) => r.classId === c.id && r.date).map((r) => (
                                <li key={r.subjectId} className="py-2.5 flex flex-col gap-1.5">
                                  <div className="grid gap-2 sm:grid-cols-[1fr_11rem_14rem] sm:items-center">
                                    <span className="text-[14px]">{subjectOf(r.classId, r.subjectId)?.name} <span className="text-[12.5px] text-ink3">{showDay(r.date)}, {time12(r.startTime)}</span></span>
                                    <input aria-label={`${c.name} ${subjectOf(r.classId, r.subjectId)?.name} room`} disabled={dis} value={r.room} maxLength={40} onChange={(e) => update({ classId: r.classId, subjectId: r.subjectId }, { room: e.target.value })} className={cell()} />
                                    <KeepSelect aria-label={`${c.name} ${subjectOf(r.classId, r.subjectId)?.name} invigilator`} disabled={dis} value={r.invigilatorId} onChange={(e) => update({ classId: r.classId, subjectId: r.subjectId }, { invigilatorId: e.target.value })} className={cell()}>
                                      <option value="">No invigilator</option>
                                      {data.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </KeepSelect>
                                  </div>
                                  {rowError(r) && <p className="text-[12.5px] text-bad flex items-center gap-1.5"><CircleAlert size={14} aria-hidden="true" />{rowError(r)}</p>}
                                </li>
                              ))}
                              {!allRows.some((r) => r.classId === c.id && r.date) && <li className="py-2.5 text-[13px] text-ink3"><Words k="Give dates above first." /></li>}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </details>
                  </>
                )}
                {tried && datedCount === 0 && <p className="text-[12.5px] text-bad flex items-center gap-1.5"><CircleAlert size={14} aria-hidden="true" /><Words k="Give at least one subject an exam date." /></p>}
              </>
            )}
            <div className="rounded-2xl border border-line p-3.5 text-[13px] text-ink2">
              <p className="font-semibold text-ink mb-1.5"><Words k="Before you save" /></p>
              <ul className="flex flex-col gap-1 list-disc pl-4">
                <li><Words k="Subjects are listed by date and time. An empty exam date leaves the subject out." /></li>
                <li><Words k="The pattern can be changed for one subject. Mark categories (for example Theory 80, Internal 20) are set after saving." /></li>
                <li><Words k="Once results are uploaded, only the title can change." /></li>
              </ul>
            </div>
          </section>
        </div>
        <div className="sticky bottom-16 md:bottom-0 z-10 flex flex-col-reverse gap-2 border-t border-line bg-surface px-4 md:px-6 py-3.5 sm:flex-row sm:justify-end">
          <ButtonLink href={exam ? `/examination-results/datesheet/${exam.id}` : "/examination-results/datesheet"} variant="ghost"><Words k="Cancel" /></ButtonLink>
          <SubmitButton pendingText="Saving…"><Check size={17} aria-hidden="true" />{exam ? "Save changes" : "Save as draft"}</SubmitButton>
        </div>
      </Card>
    </form>
  );
}

function BulkBox({ label, children, onApply }: { label: string; children: React.ReactNode; onApply: () => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] text-ink3 font-semibold">{label}</span>
      <div className="flex gap-1.5">
        <div className="min-w-0 flex-1">{children}</div>
        <Button size="sm" variant="secondary" className="!h-11" onClick={onApply} aria-label={`Apply ${label.toLowerCase()} to all subjects`}><Words k="Apply" /></Button>
      </div>
    </div>
  );
}

function ScheduleRows({ rows, label, gradeOnly, staff, onChange, dis, showRoom, error, roomHint }: {
  rows: FormRow[]; label: (r: FormRow) => string; gradeOnly: (r: FormRow) => boolean; staff: { id: string; name: string }[];
  onChange: (r: FormRow, c: Partial<FormRow>) => void; dis: boolean; showRoom: boolean; error: (r: FormRow) => string | null; roomHint: string;
}) {
  const heads = ["Subject", "Exam date", "Start time", "Duration", "Ends", ...(showRoom ? ["Location", "Invigilator"] : []), "Max marks", "Pattern"];
  const timeOptions = (v: string) => (TIMES.includes(v) || !v ? TIMES : [v, ...TIMES]);
  return (
    <>
      {/* Computers: a table */}
      <div className="hidden lg:block overflow-x-auto scroll-thin">
        <table className="text-[13.5px] w-full min-w-[900px]">
          <thead><tr className="text-[12px] text-ink3 text-left border-b border-line">
            {heads.map((h) => <th key={h} scope="col" className="font-semibold px-1 py-2 first:pl-0 whitespace-nowrap">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const e = error(r);
              return (
                <Fragment key={`${r.classId}-${r.subjectId}`}>
                  <tr className={cx(!e && "border-b border-line/70")}>
                    <th scope="row" className={cx("pr-2 py-2 text-left font-semibold whitespace-nowrap", !r.date && "text-ink3")}>{label(r)}</th>
                    <td className="px-1 py-2"><input type="date" aria-label={`${label(r)} exam date`} aria-invalid={e ? true : undefined} disabled={dis} value={r.date} onChange={(ev) => onChange(r, { date: ev.target.value })} className={cx(cell(e), "!w-[138px] tnum")} /></td>
                    <td className="px-1 py-2">
                      <KeepSelect aria-label={`${label(r)} start time`} disabled={dis} value={r.startTime} onChange={(ev) => onChange(r, { startTime: ev.target.value })} className={cx(cell(), "!w-[104px]")}>
                        {timeOptions(r.startTime).map((t) => <option key={t} value={t}>{time12(t)}</option>)}
                      </KeepSelect>
                    </td>
                    <td className="px-1 py-2">
                      <KeepSelect aria-label={`${label(r)} duration`} disabled={dis} value={String(r.durationMin)} onChange={(ev) => onChange(r, { durationMin: Number(ev.target.value) })} className={cx(cell(), "!w-[96px]")}>
                        {!DURATIONS.some((x) => x.value === String(r.durationMin)) && <option value={r.durationMin}>{r.durationMin} min</option>}
                        {DURATIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </KeepSelect>
                    </td>
                    <td className="px-1 py-2 tnum text-ink2 whitespace-nowrap">{r.date && r.startTime ? time12(endOf(r.startTime, r.durationMin)) : "—"}</td>
                    {showRoom && <td className="px-1 py-2"><input aria-label={`${label(r)} location`} disabled={dis} maxLength={40} value={r.room} placeholder={roomHint} onChange={(ev) => onChange(r, { room: ev.target.value })} className={cx(cell(), "!w-[96px]")} /></td>}
                    {showRoom && (
                      <td className="px-1 py-2">
                        <KeepSelect aria-label={`${label(r)} invigilator`} disabled={dis} value={r.invigilatorId} onChange={(ev) => onChange(r, { invigilatorId: ev.target.value })} className={cx(cell(), "!w-[148px]")}>
                          <option value="">None</option>
                          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </KeepSelect>
                      </td>
                    )}
                    <td className="px-1 py-2">
                      {gradeOnly(r) ? <span className="text-[13px] text-ink3"><Words k="Graded" /></span> : <input inputMode="numeric" aria-label={`${label(r)} maximum marks`} disabled={dis} value={r.maxMarks || ""} onChange={(ev) => onChange(r, { maxMarks: Number(ev.target.value.replace(/\D/g, "")) })} className={cx(cell(), "!w-[64px] tnum text-center")} />}
                    </td>
                    <td className="px-1 py-2">
                      <KeepSelect aria-label={`${label(r)} pattern`} disabled={dis} value={r.pattern} onChange={(ev) => onChange(r, { pattern: ev.target.value })} className={cx(cell(), "!w-[120px]")}>
                        <option value="">Exam&apos;s pattern</option>
                        {PATTERNS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </KeepSelect>
                    </td>
                  </tr>
                  {e && <tr className="border-b border-line/70"><td /><td colSpan={heads.length - 1} className="pb-2 px-1.5"><p className="text-[12.5px] text-bad flex items-center gap-1.5" role="alert"><CircleAlert size={14} aria-hidden="true" />{e}</p></td></tr>}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Phones and tablets: one card per subject */}
      <ul className="flex flex-col gap-2.5 lg:hidden">
        {rows.map((r) => {
          const e = error(r);
          return (
            <li key={`${r.classId}-${r.subjectId}`} className={cx("rounded-2xl border p-3", e ? "border-bad/50" : "border-line")}>
              <p className="mb-2 font-semibold text-[14.5px]">{label(r)} {!r.date && <span className="text-[12.5px] font-normal text-ink3"><Words k="· left out until dated" /></span>}</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="col-span-2 flex flex-col gap-1 text-[12px] font-semibold text-ink3"><Words k="Exam date" /><input type="date" disabled={dis} value={r.date} onChange={(ev) => onChange(r, { date: ev.target.value })} className={cx(cell(e), "!h-11")} /></label>
                <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink3"><Words k="Start time" />
                  <KeepSelect disabled={dis} value={r.startTime} onChange={(ev) => onChange(r, { startTime: ev.target.value })} className={cx(cell(), "!h-11")}>{timeOptions(r.startTime).map((t) => <option key={t} value={t}>{time12(t)}</option>)}</KeepSelect>
                </label>
                <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink3"><Words k="Duration" />
                  <KeepSelect disabled={dis} value={String(r.durationMin)} onChange={(ev) => onChange(r, { durationMin: Number(ev.target.value) })} className={cx(cell(), "!h-11")}>
                    {!DURATIONS.some((x) => x.value === String(r.durationMin)) && <option value={r.durationMin}>{r.durationMin} min</option>}
                    {DURATIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </KeepSelect>
                </label>
                {showRoom && <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink3"><Words k="Location" /><input disabled={dis} maxLength={40} value={r.room} placeholder={roomHint} onChange={(ev) => onChange(r, { room: ev.target.value })} className={cx(cell(), "!h-11")} /></label>}
                {showRoom && (
                  <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink3"><Words k="Invigilator" />
                    <KeepSelect disabled={dis} value={r.invigilatorId} onChange={(ev) => onChange(r, { invigilatorId: ev.target.value })} className={cx(cell(), "!h-11")}>
                      <option value="">None</option>
                      {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </KeepSelect>
                  </label>
                )}
                <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink3"><Words k="Max marks" />
                  {gradeOnly(r) ? <span className="flex h-11 items-center text-[14px] font-normal text-ink3"><Words k="Graded" /></span> : <input inputMode="numeric" disabled={dis} value={r.maxMarks || ""} onChange={(ev) => onChange(r, { maxMarks: Number(ev.target.value.replace(/\D/g, "")) })} className={cx(cell(), "!h-11 tnum")} />}
                </label>
                <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink3"><Words k="Pattern" />
                  <KeepSelect disabled={dis} value={r.pattern} onChange={(ev) => onChange(r, { pattern: ev.target.value })} className={cx(cell(), "!h-11")}>
                    <option value="">Exam&apos;s pattern</option>
                    {PATTERNS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </KeepSelect>
                </label>
              </div>
              {r.startTime && r.date && <p className="mt-1.5 text-[12.5px] text-ink3">{time12(r.startTime)} <Words k="to" /> {time12(endOf(r.startTime, r.durationMin))}</p>}
              {e && <p className="mt-1.5 text-[12.5px] text-bad flex items-center gap-1.5" role="alert"><CircleAlert size={14} aria-hidden="true" />{e}</p>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
