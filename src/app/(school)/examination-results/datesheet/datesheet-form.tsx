"use client";

// Add or change a datesheet (08 §2): Single class or Multiple classes, the
// exam details, and one row per subject with date, start time, duration,
// room, invigilator, maximum marks and pattern. Bulk apply fills one column
// for every subject. Subjects with no date are left out. Every check here
// is made again on the server.

import { useActionState, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage, Alert } from "@/components/ui/alert";
import { TextField, SelectField } from "@/components/ui/field";
import type { FormState } from "@/lib/forms";
import { saveDatesheet } from "./actions";
import type { FormData as Data, FormRow } from "./form-data";

const PATTERN_OPTIONS = [
  { value: "PERCENTAGE", label: "Percentage" },
  { value: "GRADING", label: "Grading" },
  { value: "CGPA", label: "CGPA" },
];
const DURATIONS = [30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240].map((m) => ({ value: String(m), label: m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` }));

const key = (classId: string, subjectId: string) => `${classId}|${subjectId}`;
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const time12 = (t: string) => { if (!/^\d{2}:\d{2}$/.test(t)) return ""; const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
const endOf = (t: string, d: number) => { if (!/^\d{2}:\d{2}$/.test(t)) return ""; const e = mins(t) + d; return `${String(Math.floor(e / 60) % 24).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}`; };
const showDay = (iso: string) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : "");

export function DatesheetForm({ data }: { data: Data }) {
  const exam = data.exam;
  const locked = Boolean(exam?.locked);
  const [state, formAction] = useActionState<FormState, globalThis.FormData>(saveDatesheet, null);
  const [mode, setMode] = useState<"single" | "multi" | null>(exam ? (exam.classIds.length > 1 ? "multi" : "single") : null);
  const [classIds, setClassIds] = useState<string[]>(exam?.classIds ?? []);
  const currentTerm = data.terms.find((t) => t.start <= data.today && t.end >= data.today) ?? data.terms[0];
  const startDefault = data.today < data.yearStart ? data.yearStart : data.today > data.yearEnd ? data.yearEnd : data.today;
  const [d, setD] = useState({
    title: exam?.title ?? "", examTypeId: exam?.examTypeId ?? "", pattern: exam?.pattern ?? "", termId: exam?.termId ?? currentTerm?.id ?? "",
    startDate: exam?.startDate ?? startDefault, endDate: exam?.endDate ?? addDays(startDefault, 15), gradeScaleId: exam?.gradeScaleId ?? "",
  });
  const [bulk, setBulk] = useState({ startTime: "09:30", durationMin: "180", room: "", maxMarks: "80" });
  const [rows, setRows] = useState<Record<string, FormRow>>(() => Object.fromEntries((exam?.rows ?? []).map((r) => [key(r.classId, r.subjectId), r])));
  const [checks, setChecks] = useState<string[]>([]);
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
    setChecks([]);
  }

  function applyColumn(col: "startTime" | "durationMin" | "room" | "maxMarks") {
    setRows((prev) => {
      const next = { ...prev };
      for (const r of allRows) {
        const cur = prev[key(r.classId, r.subjectId)] ?? r;
        const gradeOnly = subjectOf(r.classId, r.subjectId)?.gradeOnly;
        if (col === "maxMarks" && gradeOnly) continue;
        next[key(r.classId, r.subjectId)] = { ...cur, [col]: col === "startTime" || col === "room" ? bulk[col] : Number(bulk[col]) };
      }
      return next;
    });
    setChecks([]);
  }

  function pickMode(m: "single" | "multi") {
    setMode(m);
    if (m === "single" && classIds.length > 1) setClassIds(classIds.slice(0, 1));
  }

  function chooseClasses(ids: string[]) {
    setClassIds(ids);
    const first = data.classes.find((c) => c.id === ids[0]);
    if (first && !d.pattern) setD((x) => ({ ...x, pattern: first.pattern }));
  }

  /** The same checks the server makes, so mistakes show before saving. */
  function check(): string[] {
    const problems: string[] = [];
    if (!d.title.trim()) problems.push("Give the exam a title, such as Half Yearly.");
    if (!d.examTypeId) problems.push("Choose the exam type.");
    if (!d.pattern) problems.push("Choose the exam pattern.");
    if (!d.termId) problems.push("Choose the term.");
    if (d.endDate < d.startDate) problems.push(`The end date ${showDay(d.endDate)} is before the start date ${showDay(d.startDate)}.`);
    if (classIds.length === 0) problems.push("Choose at least one class.");
    const dated = allRows.filter((r) => r.date);
    if (classIds.length && dated.length === 0) problems.push("Give a date to at least one subject. Subjects with no date are left out.");
    for (const r of dated) {
      const c = data.classes.find((x) => x.id === r.classId);
      const label = `${c?.name ?? ""} ${subjectOf(r.classId, r.subjectId)?.name ?? ""}`;
      if (r.date < d.startDate || r.date > d.endDate) problems.push(`${label} is on ${showDay(r.date)}, outside the exam dates.`);
      if (new Date(`${r.date}T00:00:00Z`).getUTCDay() === 0) problems.push(`${label} is on a Sunday (${showDay(r.date)}). Choose a school day.`);
      const h = data.holidays.find((x) => x.from <= r.date && x.to >= r.date);
      if (h) problems.push(`${label} is on ${showDay(r.date)}, which is ${h.title} on the School Calendar.`);
      if (!/^\d{2}:\d{2}$/.test(r.startTime)) problems.push(`${label}: give a start time.`);
      if (!subjectOf(r.classId, r.subjectId)?.gradeOnly && (!Number.isInteger(r.maxMarks) || r.maxMarks < 1 || r.maxMarks > 1000)) problems.push(`${label}: maximum marks must be a whole number from 1 to 1000.`);
      const clash = dated.find((o) => o !== r && o.classId === r.classId && o.date === r.date && /^\d{2}:\d{2}$/.test(o.startTime) && mins(r.startTime) < mins(o.startTime) + o.durationMin && mins(o.startTime) < mins(r.startTime) + r.durationMin);
      if (clash && allRows.indexOf(clash) > allRows.indexOf(r)) problems.push(`${c?.name} already has ${subjectOf(clash.classId, clash.subjectId)?.name} at ${time12(clash.startTime)} on ${showDay(clash.date)}. Change the time of ${subjectOf(r.classId, r.subjectId)?.name}.`);
      const inv = r.invigilatorId && dated.find((o) => o !== r && o.invigilatorId === r.invigilatorId && o.date === r.date && mins(r.startTime) < mins(o.startTime) + o.durationMin && mins(o.startTime) < mins(r.startTime) + r.durationMin);
      if (inv && allRows.indexOf(inv) > allRows.indexOf(r)) problems.push(`${data.staff.find((s) => s.id === r.invigilatorId)?.name ?? "A teacher"} is invigilating two papers at once on ${showDay(r.date)}. Choose another invigilator.`);
      const room = r.room.trim().toLowerCase() && dated.find((o) => o !== r && o.room.trim().toLowerCase() === r.room.trim().toLowerCase() && o.date === r.date && mins(r.startTime) < mins(o.startTime) + o.durationMin && mins(o.startTime) < mins(r.startTime) + r.durationMin);
      if (room && allRows.indexOf(room) > allRows.indexOf(r)) problems.push(`${r.room} is used by two papers at once on ${showDay(r.date)}. Choose another room.`);
    }
    return problems;
  }

  if (!mode) {
    return (
      <fieldset className="max-w-2xl">
        <legend className="mb-3 text-lg font-semibold">Who is this datesheet for?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {([["single", "Single class", "Pick one class and fill the schedule."], ["multi", "Multiple classes", "Same schedule for several classes at once."]] as const).map(([m, title, help]) => (
            <button key={m} type="button" onClick={() => pickMode(m)} className="rounded-2xl border border-line bg-surface p-5 text-left shadow-card hover:border-brand/60 focus-visible:outline-2">
              <span className="block text-lg font-semibold">{title}</span>
              <span className="mt-1 block text-ink-2">{help}</span>
            </button>
          ))}
        </div>
      </fieldset>
    );
  }

  const dis = locked;
  const datedCount = allRows.filter((r) => r.date).length;
  const typeName = (id: string) => data.types.find((t) => t.id === id)?.name ?? "";

  return (
    <form action={formAction} noValidate className="space-y-6"
      onSubmit={(e) => {
        const p = locked ? (d.title.trim() ? [] : ["Give the exam a title."]) : check();
        setChecks(p);
        if (p.length) { e.preventDefault(); requestAnimationFrame(() => summaryRef.current?.focus()); }
      }}>
      {exam && <input type="hidden" name="examId" value={exam.id} />}
      <input type="hidden" name="yearId" value={data.yearId} />
      {classIds.map((id) => <input key={id} type="hidden" name="classIds" value={id} />)}
      <input type="hidden" name="rows" value={JSON.stringify(allRows)} />

      {locked && <Alert tone="warning" title="Results exist for this datesheet">Only the title can change. Ask the Exam In-charge or the Principal if a date or mark needs changing.</Alert>}
      <div ref={summaryRef} tabIndex={-1} className="outline-none">
        {checks.length > 0 && (
          <Alert tone="danger" title={checks.length === 1 ? "Please fix this before saving" : `Please fix ${checks.length} things before saving`}>
            <ul className="list-disc pl-5">{checks.slice(0, 8).map((c) => <li key={c}>{c}</li>)}</ul>
            {checks.length > 8 && <p className="mt-1">And {checks.length - 8} more.</p>}
          </Alert>
        )}
        {checks.length === 0 && <FormMessage state={state} />}
      </div>

      {/* Classes */}
      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{mode === "single" ? "Class" : "Classes"}</h2>
          {!exam && <button type="button" className="min-h-11 text-sm font-medium text-brand-text hover:underline" onClick={() => pickMode(mode === "single" ? "multi" : "single")}>Switch to {mode === "single" ? "Multiple classes" : "Single class"}</button>}
        </div>
        {mode === "single" ? (
          <SelectField label="Class" name="classPick" required disabled={dis} value={classIds[0] ?? ""} placeholder="Choose a class"
            options={data.classes.map((c) => ({ value: c.id, label: c.name }))} onChange={(e) => chooseClasses(e.target.value ? [e.target.value] : [])} className="max-w-sm" />
        ) : (
          <fieldset disabled={dis}>
            <legend className="sr-only">Classes</legend>
            <div className="flex flex-wrap gap-2">
              {data.classes.map((c) => {
                const on = classIds.includes(c.id);
                return (
                  <label key={c.id} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 ${on ? "border-brand bg-brand-soft text-brand-text" : "border-line-strong"}`}>
                    <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={on} onChange={(e) => chooseClasses(e.target.checked ? [...classIds, c.id] : classIds.filter((x) => x !== c.id))} />
                    {c.name}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
      </section>

      {/* Exam details */}
      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <h2 className="mb-3 text-lg font-semibold">Exam details</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField label="Title" name="title" required maxLength={60} value={d.title} placeholder="For example Half Yearly" error={state?.errors?.title}
            onChange={(e) => setD({ ...d, title: e.target.value })} />
          <SelectField label="Exam type" name="examTypeId" required disabled={dis} value={d.examTypeId} placeholder="Choose" error={state?.errors?.examTypeId}
            options={data.types.map((t) => ({ value: t.id, label: t.name }))}
            onChange={(e) => setD({ ...d, examTypeId: e.target.value, title: d.title || typeName(e.target.value) })} help="Exam types are set in Exam Settings." />
          <SelectField label="Exam pattern" name="pattern" required disabled={dis} value={d.pattern} placeholder="Choose" options={PATTERN_OPTIONS} error={state?.errors?.pattern}
            onChange={(e) => setD({ ...d, pattern: e.target.value })} help="Starts as the class's default pattern." />
          <SelectField label="Term" name="termId" required disabled={dis} value={d.termId} placeholder="Choose" options={data.terms.map((t) => ({ value: t.id, label: t.name }))} error={state?.errors?.termId}
            onChange={(e) => setD({ ...d, termId: e.target.value })} />
          <TextField label="Start date" name="startDate" type="date" required disabled={dis} value={d.startDate} min={data.yearStart} max={data.yearEnd} error={state?.errors?.startDate}
            onChange={(e) => setD({ ...d, startDate: e.target.value, endDate: d.endDate < e.target.value || !exam ? addDays(e.target.value, 15) : d.endDate })} />
          <TextField label="End date" name="endDate" type="date" required disabled={dis} value={d.endDate} min={d.startDate} max={data.yearEnd} error={state?.errors?.endDate}
            onChange={(e) => setD({ ...d, endDate: e.target.value })} help="15 days after the start, unless you change it." />
          <SelectField label="Grade scale" name="gradeScaleId" disabled={dis} value={d.gradeScaleId} placeholder="The class's board scale (usual)" options={data.scales.map((s) => ({ value: s.id, label: s.name }))}
            onChange={(e) => setD({ ...d, gradeScaleId: e.target.value })} help="Leave this as it is unless this exam uses a different scale." />
        </div>
        {/* Hidden copies keep disabled values in the form when the schedule is locked. */}
        {dis && (<>
          <input type="hidden" name="examTypeId" value={d.examTypeId} /><input type="hidden" name="pattern" value={d.pattern} /><input type="hidden" name="termId" value={d.termId} />
          <input type="hidden" name="startDate" value={d.startDate} /><input type="hidden" name="endDate" value={d.endDate} /><input type="hidden" name="gradeScaleId" value={d.gradeScaleId} />
        </>)}
      </section>

      {chosen.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-labelledby="schedule-h">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="schedule-h" className="text-lg font-semibold">Subject schedule</h2>
            <p className="text-sm text-ink-2" aria-live="polite">{datedCount} of {mode === "multi" ? `${allRows.length} papers` : `${allRows.length} subjects`} dated</p>
          </div>
          {state?.errors?.schedule && <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.errors.schedule}</p>}

          {!dis && (
            <div className="mb-4 rounded-xl bg-surface-2 p-3">
              <p className="mb-2 text-sm font-medium">Bulk apply: sets one value for every subject. Each Apply changes only its own column.</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <BulkBox label="Start time" onApply={() => applyColumn("startTime")}>
                  <input type="time" aria-label="Start time for all" value={bulk.startTime} onChange={(e) => setBulk({ ...bulk, startTime: e.target.value })} className="h-11 w-full rounded-lg border border-line-strong bg-surface px-2" />
                </BulkBox>
                <BulkBox label="Duration" onApply={() => applyColumn("durationMin")}>
                  <select aria-label="Duration for all" value={bulk.durationMin} onChange={(e) => setBulk({ ...bulk, durationMin: e.target.value })} className="h-11 w-full rounded-lg border border-line-strong bg-surface px-2">
                    {DURATIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </BulkBox>
                {mode === "single" && (
                  <BulkBox label="Location" onApply={() => applyColumn("room")}>
                    <input aria-label="Location for all" value={bulk.room} maxLength={40} placeholder="Room 12" onChange={(e) => setBulk({ ...bulk, room: e.target.value })} className="h-11 w-full rounded-lg border border-line-strong bg-surface px-2" />
                  </BulkBox>
                )}
                <BulkBox label="Maximum marks" onApply={() => applyColumn("maxMarks")}>
                  <input type="number" inputMode="numeric" min={1} max={1000} aria-label="Maximum marks for all" value={bulk.maxMarks} onChange={(e) => setBulk({ ...bulk, maxMarks: e.target.value })} className="h-11 w-full rounded-lg border border-line-strong bg-surface px-2" />
                </BulkBox>
              </div>
            </div>
          )}

          {mode === "single" ? (
            <ScheduleRows dis={dis} rows={allRows} label={(r) => subjectOf(r.classId, r.subjectId)?.name ?? ""} gradeOnly={(r) => Boolean(subjectOf(r.classId, r.subjectId)?.gradeOnly)}
              staff={data.staff} onChange={(r, c) => update({ classId: r.classId, subjectId: r.subjectId }, c)} showRoom />
          ) : (
            <>
              <ScheduleRows dis={dis} rows={subjectRows.map((s) => allRows.find((r) => r.subjectId === s.subjectId && r.classId === s.classIds[0])!)}
                label={(r) => { const s = subjectRows.find((x) => x.subjectId === r.subjectId)!; return `${s.name}${s.classIds.length < chosen.length ? ` (${s.classIds.length} of ${chosen.length} classes)` : ""}`; }}
                gradeOnly={(r) => Boolean(subjectRows.find((x) => x.subjectId === r.subjectId)?.gradeOnly)}
                staff={data.staff} onChange={(r, c) => update({ subjectId: r.subjectId }, c)} showRoom={false} />
              <details className="mt-4 rounded-xl border border-line">
                <summary className="flex min-h-11 cursor-pointer items-center px-4 font-medium">Rooms and invigilators for each class</summary>
                <div className="space-y-4 border-t border-line p-4">
                  <p className="text-sm text-ink-2">Each class starts in its own room with its subject teacher invigilating. Two classes cannot share a room or an invigilator at the same time.</p>
                  {chosen.map((c) => (
                    <div key={c.id}>
                      <h3 className="mb-2 font-medium">{c.name}</h3>
                      <ul className="divide-y divide-line rounded-lg border border-line">
                        {allRows.filter((r) => r.classId === c.id && r.date).map((r) => (
                          <li key={r.subjectId} className="grid gap-2 p-3 sm:grid-cols-[1fr_12rem_14rem] sm:items-center">
                            <span>{subjectOf(r.classId, r.subjectId)?.name} <span className="text-sm text-ink-2">{showDay(r.date)}, {time12(r.startTime)}</span></span>
                            <input aria-label={`${c.name} ${subjectOf(r.classId, r.subjectId)?.name} room`} disabled={dis} value={r.room} maxLength={40} onChange={(e) => update({ classId: r.classId, subjectId: r.subjectId }, { room: e.target.value })} className="h-11 rounded-lg border border-line-strong bg-surface px-2" />
                            <select aria-label={`${c.name} ${subjectOf(r.classId, r.subjectId)?.name} invigilator`} disabled={dis} value={r.invigilatorId} onChange={(e) => update({ classId: r.classId, subjectId: r.subjectId }, { invigilatorId: e.target.value })} className="h-11 rounded-lg border border-line-strong bg-surface px-2">
                              <option value="">No invigilator</option>
                              {data.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </li>
                        ))}
                        {!allRows.some((r) => r.classId === c.id && r.date) && <li className="p-3 text-sm text-ink-2">Give dates above first.</li>}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            </>
          )}

          <div className="mt-4 rounded-xl border border-line bg-surface-2 p-3 text-sm">
            <p className="font-medium">Before you save</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-2">
              <li>Subjects are listed by date and time on the saved datesheet.</li>
              <li>An empty exam date leaves the subject out.</li>
              <li>The pattern can be changed for one subject.</li>
              <li>Mark categories (for example Theory 80, Internal 20) are set after saving.</li>
              <li>Once results are uploaded, only the title can change.</li>
            </ul>
          </div>
        </section>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        <Link href={exam ? `/examination-results/datesheet/${exam.id}` : "/examination-results/datesheet"} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line-strong px-4 font-medium hover:bg-surface-2">Cancel</Link>
        <SubmitButton pendingText="Saving…">{exam ? "Save changes" : "Save as draft"}</SubmitButton>
      </div>
    </form>
  );
}

function BulkBox({ label, children, onApply }: { label: string; children: React.ReactNode; onApply: () => void }) {
  return (
    <div>
      <span className="mb-1 block text-sm">{label}</span>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        <Button size="md" variant="secondary" onClick={onApply} aria-label={`Apply ${label.toLowerCase()} to all subjects`}>Apply</Button>
      </div>
    </div>
  );
}

function ScheduleRows({ rows, label, gradeOnly, staff, onChange, dis, showRoom }: {
  rows: FormRow[]; label: (r: FormRow) => string; gradeOnly: (r: FormRow) => boolean; staff: { id: string; name: string }[];
  onChange: (r: FormRow, c: Partial<FormRow>) => void; dis: boolean; showRoom: boolean;
}) {
  const input = "h-11 w-full rounded-lg border border-line-strong bg-surface px-2 text-[15px] disabled:bg-surface-2";
  return (
    <>
      {/* Computers: a table */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-left text-[15px]">
          <thead className="text-sm text-ink-2">
            <tr>
              <th className="py-2 pr-2 font-medium">Subject</th><th className="px-1 py-2 font-medium">Exam date</th><th className="px-1 py-2 font-medium">Start time</th>
              <th className="px-1 py-2 font-medium">Duration</th>{showRoom && <th className="px-1 py-2 font-medium">Location</th>}
              {showRoom && <th className="px-1 py-2 font-medium">Invigilator</th>}<th className="px-1 py-2 font-medium">Max marks</th><th className="px-1 py-2 font-medium">Pattern</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={`${r.classId}-${r.subjectId}`} className={r.date ? "" : "text-ink-2"}>
                <th scope="row" className="py-2 pr-2 font-medium">{label(r)}</th>
                <td className="px-1 py-2"><input type="date" aria-label={`${label(r)} exam date`} disabled={dis} value={r.date} onChange={(e) => onChange(r, { date: e.target.value })} className={input} /></td>
                <td className="px-1 py-2 w-36">
                  <input type="time" aria-label={`${label(r)} start time`} disabled={dis} value={r.startTime} onChange={(e) => onChange(r, { startTime: e.target.value })} className={input} />
                </td>
                <td className="px-1 py-2 w-40">
                  <select aria-label={`${label(r)} duration`} disabled={dis} value={String(r.durationMin)} onChange={(e) => onChange(r, { durationMin: Number(e.target.value) })} className={input}>
                    {!DURATIONS.some((x) => x.value === String(r.durationMin)) && <option value={r.durationMin}>{r.durationMin} min</option>}
                    {DURATIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {r.startTime && <span className="mt-0.5 block text-xs text-ink-2">Ends {time12(endOf(r.startTime, r.durationMin))}</span>}
                </td>
                {showRoom && <td className="px-1 py-2 w-32"><input aria-label={`${label(r)} location`} disabled={dis} maxLength={40} value={r.room} onChange={(e) => onChange(r, { room: e.target.value })} className={input} /></td>}
                {showRoom && (
                  <td className="px-1 py-2 w-48">
                    <select aria-label={`${label(r)} invigilator`} disabled={dis} value={r.invigilatorId} onChange={(e) => onChange(r, { invigilatorId: e.target.value })} className={input}>
                      <option value="">None</option>
                      {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                )}
                <td className="px-1 py-2 w-24">
                  {gradeOnly(r) ? <span className="text-sm text-ink-2">Graded</span> : <input type="number" inputMode="numeric" min={1} max={1000} aria-label={`${label(r)} maximum marks`} disabled={dis} value={r.maxMarks || ""} onChange={(e) => onChange(r, { maxMarks: Number(e.target.value) })} className={input} />}
                </td>
                <td className="px-1 py-2 w-36">
                  <select aria-label={`${label(r)} pattern`} disabled={dis} value={r.pattern} onChange={(e) => onChange(r, { pattern: e.target.value })} className={input}>
                    <option value="">Exam&apos;s pattern</option>
                    {PATTERN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Phones and tablets: one card per subject */}
      <ul className="space-y-3 lg:hidden">
        {rows.map((r) => (
          <li key={`${r.classId}-${r.subjectId}`} className="rounded-xl border border-line p-3">
            <p className="mb-2 font-medium">{label(r)} {!r.date && <span className="text-sm font-normal text-ink-2">· left out until dated</span>}</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-2 text-sm">Exam date<input type="date" disabled={dis} value={r.date} onChange={(e) => onChange(r, { date: e.target.value })} className={input} /></label>
              <label className="text-sm">Start time<input type="time" disabled={dis} value={r.startTime} onChange={(e) => onChange(r, { startTime: e.target.value })} className={input} /></label>
              <label className="text-sm">Duration
                <select disabled={dis} value={String(r.durationMin)} onChange={(e) => onChange(r, { durationMin: Number(e.target.value) })} className={input}>
                  {!DURATIONS.some((x) => x.value === String(r.durationMin)) && <option value={r.durationMin}>{r.durationMin} min</option>}
                  {DURATIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              {showRoom && <label className="text-sm">Location<input disabled={dis} maxLength={40} value={r.room} onChange={(e) => onChange(r, { room: e.target.value })} className={input} /></label>}
              {showRoom && (
                <label className="text-sm">Invigilator
                  <select disabled={dis} value={r.invigilatorId} onChange={(e) => onChange(r, { invigilatorId: e.target.value })} className={input}>
                    <option value="">None</option>
                    {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              )}
              <label className="text-sm">Max marks
                {gradeOnly(r) ? <span className="flex h-11 items-center text-ink-2">Graded</span> : <input type="number" inputMode="numeric" disabled={dis} value={r.maxMarks || ""} onChange={(e) => onChange(r, { maxMarks: Number(e.target.value) })} className={input} />}
              </label>
              <label className="text-sm">Pattern
                <select disabled={dis} value={r.pattern} onChange={(e) => onChange(r, { pattern: e.target.value })} className={input}>
                  <option value="">Exam&apos;s pattern</option>
                  {PATTERN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>
            {r.startTime && r.date && <p className="mt-1 text-xs text-ink-2">{time12(r.startTime)} to {time12(endOf(r.startTime, r.durationMin))}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}
