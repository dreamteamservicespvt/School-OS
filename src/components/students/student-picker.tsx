"use client";

// Choose one or more students: search by name or admission number, or open a
// section and tick (phone first: section, tick, done). Only students the
// person may see are offered; the server checks again on save.

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useFormResult } from "./action-form";
import { Spinner } from "@/components/ui/button";
import { searchStudents, studentsInSection, type PickedStudent } from "@/app/(school)/student-management/_actions/lookup";
import { KeepCheck, KeepSelect } from "@/components/ui/keep-select";

export function StudentPicker({ name, label, multiple = false, sections = [], initial = [], anyStatus = false, required = true, help }: {
  name: string; label: string; multiple?: boolean; sections?: { value: string; label: string }[];
  initial?: PickedStudent[]; anyStatus?: boolean; required?: boolean; help?: string;
}) {
  const state = useFormResult();
  const error = state?.errors?.[name];
  const [chosen, setChosen] = useState<PickedStudent[]>(initial);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<PickedStudent[]>([]);
  const [section, setSection] = useState("");
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const toggle = (s: PickedStudent) => setChosen((c) => c.some((x) => x.id === s.id) ? c.filter((x) => x.id !== s.id) : multiple ? [...c, s] : [s]);
  const has = (s: PickedStudent) => chosen.some((x) => x.id === s.id);

  return (
    <fieldset aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="mb-1 text-[13px] font-semibold text-ink2">{label}{required && <span className="text-bad" aria-hidden="true"> *</span>}</legend>
      {chosen.map((s) => <input key={s.id} type="hidden" name={name} value={s.id} />)}
      {chosen.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2" aria-label="Chosen students">
          {chosen.map((s) => (
            <li key={s.id} className="inline-flex items-center gap-1 rounded-full bg-brand/8 py-1 pl-3 pr-1 text-brand">
              {s.name}{s.cls ? ` (${s.cls})` : ""}
              <button type="button" onClick={() => toggle(s)} aria-label={`Remove ${s.name}`} className="grid size-8 place-items-center rounded-full hover:bg-surface">×</button>
            </li>
          ))}
        </ul>
      )}
      {(multiple || chosen.length === 0) && (
        <div className="space-y-2 rounded-xl border border-line p-3">
          <div className="flex flex-wrap gap-2">
            <label className="relative min-w-0 flex-1 basis-52">
              <span className="sr-only">Search students</span>
              <input type="search" value={q} placeholder="Search by name or admission number" autoComplete="off"
                onChange={(e) => {
                  const v = e.target.value; setQ(v); setSection("");
                  if (timer.current) clearTimeout(timer.current);
                  timer.current = setTimeout(() => start(async () => setFound(await searchStudents(v, { anyStatus }))), 250);
                }}
                className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-base" />
              {pending && <Spinner className="absolute right-3 top-3.5 size-4 text-ink2" />}
            </label>
            {sections.length > 0 && (
              <label>
                <span className="sr-only">Or open a section</span>
                <KeepSelect value={section} onChange={(e) => { const v = e.target.value; setSection(v); setQ(""); if (v) start(async () => setFound(await studentsInSection(v))); else setFound([]); }}
                  className="h-11 rounded-xl border border-line bg-surface px-3 text-base">
                  <option value="">Or open a section</option>
                  {sections.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </KeepSelect>
              </label>
            )}
          </div>
          {found.length > 0 ? (
            <ul className="max-h-72 divide-y divide-line overflow-y-auto">
              {multiple && section && (
                <li><button type="button" className="min-h-11 w-full px-1 text-left font-medium text-brand" onClick={() => setChosen((c) => [...c, ...found.filter((f) => !c.some((x) => x.id === f.id))])}>Choose all {found.length}</button></li>
              )}
              {found.map((s) => (
                <li key={s.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 px-1">
                    <KeepCheck type={multiple ? "checkbox" : "radio"} checked={has(s)} onChange={() => toggle(s)} className="size-5 accent-brand" />
                    <span>{s.name} <span className="text-[13.5px] text-ink2">{s.cls} · {s.admissionNo}</span></span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (q.trim().length >= 2 && !pending) ? <p className="text-[13.5px] text-ink2">No student found. Try the admission number.</p> : null}
        </div>
      )}
      {error ? <p id={`${id}-err`} className="mt-1 text-[13.5px] text-bad">{error}</p> : help ? <p className="mt-1 text-[13.5px] text-ink2">{help}</p> : null}
    </fieldset>
  );
}
