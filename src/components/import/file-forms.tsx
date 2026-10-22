"use client";

// The forms for a file being brought in (00-global.md P10), used on every
// import page: Settings, Switching to School OS, and each module's own
// Import page. Each keeps what was typed when a check fails and shows the
// result in place (P7, P15). "place" says which page the person is on.

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { CheckboxField, SelectField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/forms";
import { columnsAction, fixRowAction, sheetAction, uploadAction, uploadPhotosAction, valuesAction } from "@/app/(school)/_imports/file-actions";
import { KeepSelect } from "@/components/ui/keep-select";

type Opt = { value: string; label: string };

/** Student Management's own choices with the upload: the section for rows with no class, and the class fee plan. */
export type StudentChoices = { sections: Opt[]; sectionId?: string };

export function UploadForm({ place, kinds, kind, guess = true, help, students }: { place: string; kinds: Opt[]; kind?: string; guess?: boolean; help?: string; students?: StudentChoices }) {
  const [state, action] = useActionState<FormState, FormData>(uploadAction, null);
  const refused = Boolean(state && !state.ok);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="place" value={place} />
      <div>
        <label htmlFor="move-in-file" className="mb-1 block text-sm font-medium">File<span className="text-danger" aria-hidden="true"> *</span></label>
        <input id="move-in-file" name="file" type="file" required accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-describedby="move-in-file-help" aria-invalid={Boolean(state?.errors?.file)}
          className="block w-full rounded-lg border border-line-strong bg-surface p-2 text-base file:mr-3 file:min-h-10 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:text-ink" />
        {state?.errors?.file ? <p className="mt-1 text-sm text-danger">{state.errors.file}</p> : (
          <p id="move-in-file-help" className="mt-1 text-sm text-ink-2">{help ?? "Excel (.xlsx) or CSV, up to 10 MB: an export from your old software, a UDISE+ download, your own sheet or our ready sheet. A workbook with several sheets is fine."}</p>
        )}
      </div>
      {kinds.length === 1 && !guess ? <input type="hidden" name="kind" value={kinds[0].value} /> : (
        <SelectField label="What is in it?" name="kind" options={guess ? [{ value: "", label: "Let School OS work it out" }, ...kinds] : kinds} defaultValue={state?.values?.kind ?? kind ?? (guess ? "" : kinds[0]?.value)} error={state?.errors?.kind} />
      )}
      {students && (
        <>
          <SelectField key={`s${refused}`} label="Class and section" name="sectionId" options={[{ value: "", label: "From the file's Class and Section columns" }, ...students.sections]}
            defaultValue={(refused ? state?.values?.sectionId : undefined) ?? students.sectionId ?? ""} error={state?.errors?.sectionId} help="Used for new students on rows with no class in the file." />
          <CheckboxField key={`f${refused}`} name="applyFeePlan" label="Apply the class fee plan" help="Each new student gets the fee plan of their class (Fee Management)."
            defaultChecked={refused ? state?.values?.applyFeePlan === "on" : true} />
        </>
      )}
      <SubmitButton pendingText="Reading the file…">Upload and check</SubmitButton>
    </form>
  );
}

/** Most photos at once, and their size together (the server takes at most 25 MB a request). */
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 24 * 1024 * 1024;

/**
 * Photos or scans of paper register pages (gap list G43), read by the AI
 * assistant into rows that open in the same review as a sheet. With the AI
 * assistant off for this person, it says so plainly and points to the ready sheet.
 */
export function PhotoUploadForm({ place, kinds, kind, guess = true, students, refusal, sheetHref }: { place: string; kinds: Opt[]; kind?: string; guess?: boolean; students?: StudentChoices; refusal: string | null; sheetHref?: string }) {
  const [state, action] = useActionState<FormState, FormData>(uploadPhotosAction, null);
  const [tooMuch, setTooMuch] = useState<string | null>(null);
  if (refusal) {
    return (
      <div className="space-y-2 text-sm">
        <p role="note">{refusal}</p>
        {sheetHref && <a href={sheetHref} download className="inline-flex min-h-11 items-center font-medium text-brand-text hover:underline">Download the ready Excel sheet</a>}
      </div>
    );
  }
  const refused = Boolean(state && !state.ok);
  const fileError = tooMuch ?? state?.errors?.photos;
  return (
    <form action={action} className="space-y-4" noValidate onSubmit={(e) => { if (tooMuch) e.preventDefault(); }}>
      <FormMessage state={state} />
      <input type="hidden" name="place" value={place} />
      <p className="text-sm text-ink-2">Take a clear photo of each register page, straight from above in good light, or upload a PDF scan. The AI assistant copies each page into rows; you then match the columns and check every row against the photo before anything is saved.</p>
      <div>
        <label htmlFor="move-in-photos" className="mb-1 block text-sm font-medium">Photos of the pages<span className="text-danger" aria-hidden="true"> *</span></label>
        <input id="move-in-photos" name="photos" type="file" multiple required accept="image/jpeg,image/png,image/webp,application/pdf"
          aria-describedby="move-in-photos-help" aria-invalid={Boolean(fileError)}
          onChange={(e) => {
            const list = Array.from(e.currentTarget.files ?? []);
            const bytes = list.reduce((n, f) => n + f.size, 0);
            setTooMuch(list.length > MAX_PHOTOS ? `Choose at most ${MAX_PHOTOS} pages at a time.` : bytes > MAX_PHOTO_BYTES ? "These photos are more than 24 MB together. Upload fewer pages at a time." : null);
          }}
          className="block w-full rounded-lg border border-line-strong bg-surface p-2 text-base file:mr-3 file:min-h-10 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:text-ink" />
        {fileError ? <p className="mt-1 text-sm text-danger">{fileError}</p> : (
          <p id="move-in-photos-help" className="mt-1 text-sm text-ink-2">JPG, PNG or PDF, up to {MAX_PHOTOS} pages at a time, 24 MB together. Only these pictures are sent to the AI service, for reading them, and each request is logged.</p>
        )}
      </div>
      {kinds.length === 1 && !guess ? <input type="hidden" name="kind" value={kinds[0].value} /> : (
        <SelectField label="What is on the pages?" name="kind" options={guess ? [{ value: "", label: "Let School OS work it out" }, ...kinds] : kinds} defaultValue={state?.values?.kind ?? kind ?? (guess ? "" : kinds[0]?.value)} error={state?.errors?.kind} />
      )}
      {students && (
        <>
          <SelectField key={`s${refused}`} label="Class and section" name="sectionId" options={[{ value: "", label: "From the register's Class and Section columns" }, ...students.sections]}
            defaultValue={(refused ? state?.values?.sectionId : undefined) ?? students.sectionId ?? ""} error={state?.errors?.sectionId} help="Used for new students on rows with no class." />
          <CheckboxField key={`f${refused}`} name="applyFeePlan" label="Apply the class fee plan" help="Each new student gets the fee plan of their class (Fee Management)."
            defaultChecked={refused ? state?.values?.applyFeePlan === "on" : true} />
        </>
      )}
      <div>
        <CheckboxField key={`p${refused}`} name="privateCovered" label="Aadhaar, bank and other private numbers are covered or cut out on these pages"
          help="They are never sent to the AI service. Add them by hand after the records are in." defaultChecked={refused ? state?.values?.privateCovered === "on" : false} aria-invalid={Boolean(state?.errors?.privateCovered)} />
        {state?.errors?.privateCovered && <p className="mt-1 text-sm text-danger">{state.errors.privateCovered}</p>}
      </div>
      <SubmitButton pendingText="Reading the pages… this can take a minute">Read the pages and check</SubmitButton>
    </form>
  );
}

export function SheetForm({ place, id, sheets, sheetIndex, headerRow, headerChoices, kinds, kind }: { place: string; id: string; sheets: Opt[]; sheetIndex: number; headerRow: number; headerChoices: Opt[]; kinds: Opt[]; kind: string }) {
  const [state, action] = useActionState<FormState, FormData>(sheetAction, null);
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="place" value={place} />
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 md:grid-cols-3">
        <SelectField label="Sheet" name="sheetIndex" options={sheets} defaultValue={String(sheetIndex)} disabled={sheets.length < 2} />
        {sheets.length < 2 && <input type="hidden" name="sheetIndex" value={sheetIndex} />}
        <SelectField label="Headings are in" name="headerRow" options={headerChoices} defaultValue={String(headerRow)} />
        {kinds.length > 1 ? <SelectField label="It holds" name="kind" options={kinds} defaultValue={kind} /> : <input type="hidden" name="kind" value={kind} />}
      </div>
      <SubmitButton variant="secondary" pendingText="Reading again…">Use these</SubmitButton>
    </form>
  );
}

export function ValuesForm({ place, id, column, rows, children }: { place: string; id: string; column: string; rows: { word: string; label: string; count: number; lines: number[]; options: Opt[]; chosen: string }[]; children?: React.ReactNode }) {
  const [state, action] = useActionState<FormState, FormData>(valuesAction, null);
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="place" value={place} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="column" value={column} />
      <ul className="divide-y divide-line rounded-xl border border-line">
        {rows.map((r, i) => (
          <li key={r.word} className="grid gap-2 px-3 py-3 md:grid-cols-[minmax(0,1fr)_18rem] md:items-center">
            <input type="hidden" name={`w_${i}`} value={r.word} />
            <div>
              <p className="font-medium break-words">&ldquo;{r.label}&rdquo;</p>
              <p className="text-sm text-ink-2">{r.count} {r.count === 1 ? "row" : "rows"} · row {r.lines.slice(0, 6).join(", ")}{r.lines.length > 6 || r.count > r.lines.length ? "…" : ""}</p>
            </div>
            <label className="block">
              <span className="sr-only">Match &ldquo;{r.label}&rdquo; to</span>
              <select name={`v_${i}`} defaultValue={r.chosen} className="h-11 w-full rounded-lg border border-line-strong bg-surface px-2">
                {r.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingText="Saving…">Save matches</SubmitButton>
        {children}
      </div>
    </form>
  );
}

export function FixRowForm({ place, id, line, fields }: { place: string; id: string; line: number; fields: { key: string; label: string; value: string; required?: boolean; options?: Opt[] }[] }) {
  const [state, action] = useActionState<FormState, FormData>(fixRowAction, null);
  return (
    <form action={action} className="space-y-3 pt-3">
      <FormMessage state={state} />
      <input type="hidden" name="place" value={place} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="line" value={line} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {fields.map((f) => f.options ? (
          <SelectField key={f.key} label={f.label} name={`f_${f.key}`} options={f.options} defaultValue={f.value} required={f.required} />
        ) : (
          <TextField key={f.key} label={f.label} name={`f_${f.key}`} defaultValue={f.value} required={f.required} />
        ))}
      </div>
      <SubmitButton pendingText="Checking…">Save and check row {String(line)}</SubmitButton>
    </form>
  );
}

type ColumnRow = { key: string; label: string; required: boolean; help?: string; cols: number[]; joinable: boolean };

/** Step 1: which column of the file is which. Each choice shows the first values of that column, so a wrong match is easy to see. */
export function ColumnsForm({ place, id, rows, headers, samples }: { place: string; id: string; rows: ColumnRow[]; headers: string[]; samples: string[][] }) {
  const [state, action] = useActionState<FormState, FormData>(columnsAction, null);
  const [chosen, setChosen] = useState<Record<string, number[]>>(() => Object.fromEntries(rows.map((r) => [r.key, r.cols])));
  const used = new Map<number, string>();
  for (const r of rows) for (const c of chosen[r.key] ?? []) if (!used.has(c)) used.set(c, r.label);
  const pick = (key: string, slot: number, v: string) => setChosen((old) => {
    const list = [...(old[key] ?? [])];
    if (v === "") list.splice(slot); else list[slot] = Number(v);
    return { ...old, [key]: list.filter((x) => x !== undefined) };
  });
  const missing = rows.filter((r) => r.required && !(chosen[r.key] ?? []).length);
  const options = headers.map((h, i) => ({ value: String(i), label: h }));
  // Columns not found and not needed wait in "More columns", so the list stays short.
  const main = rows.filter((r) => r.required || r.cols.length);
  const extra = rows.filter((r) => !r.required && !r.cols.length);
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="place" value={place} />
      <input type="hidden" name="id" value={id} />
      {missing.length > 0 && <p role="status" className="rounded-xl border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn-text">Not found in the file yet: {missing.map((m) => m.label).join(", ")}. Choose the column for each, or the rows will show a problem.</p>}
      {[main, extra].map((group, gi) => group.length === 0 ? null : gi === 1 ? (
        <details key="extra" className="rounded-xl border border-line">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 font-medium">More columns School OS can keep ({extra.length} not in the file)</summary>
          <ul className="divide-y divide-line border-t border-line">{group.map(renderRow)}</ul>
        </details>
      ) : <ul key="main" className="divide-y divide-line rounded-xl border border-line">{group.map(renderRow)}</ul>)}
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText="Saving…" name="next" value="values">Save and continue</SubmitButton>
      </div>
    </form>
  );

  function renderRow(r: ColumnRow) {
          const cols = chosen[r.key] ?? [];
          const slots = r.joinable ? Math.min(3, cols.length + 1) : 1;
          const sample = cols.length ? samples.map((row) => cols.map((c) => row[c] ?? "").filter(Boolean).join(" ")).filter(Boolean).slice(0, 3) : [];
          return (
            <li key={r.key} className="grid gap-2 px-3 py-3 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:items-start">
              <div>
                <p className="font-medium">{r.label}{r.required && <span className="text-danger" aria-hidden="true"> *</span>}</p>
                {r.help && <p className="text-sm text-ink-2">{r.help}</p>}
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: slots }, (_, slot) => (
                    <label key={slot} className="min-w-0 flex-1 basis-48">
                      <span className="sr-only">{slot === 0 ? `Column for ${r.label}` : `Joined with`}</span>
                      <KeepSelect name={`col_${r.key}${slot ? `_${slot}` : ""}`} value={cols[slot] !== undefined ? String(cols[slot]) : ""} onChange={(e) => pick(r.key, slot, e.target.value)}
                        className={`h-11 w-full rounded-lg border bg-surface px-2 ${r.required && !cols.length ? "border-danger" : "border-line-strong"}`}>
                        <option value="">{slot === 0 ? "Not in the file" : "Join another column…"}</option>
                        {options.map((o) => <option key={o.value} value={o.value}>{o.label}{used.has(Number(o.value)) && !cols.includes(Number(o.value)) ? ` (also ${used.get(Number(o.value))})` : ""}</option>)}
                      </KeepSelect>
                    </label>
                  ))}
                </div>
                <p className="text-sm text-ink-2 break-words">{sample.length ? <>For example: {sample.map((v, i) => <span key={i}>{i ? ", " : ""}<span className="text-ink">{v}</span></span>)}</> : cols.length ? "This column is empty in the first rows." : "\u00a0"}</p>
              </div>
            </li>
          );
  }
}
