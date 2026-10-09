"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { checkStaffFile, importStaffFile, undoStaffImport, uploadStaffFile, Upload, Checked } from "./actions";

type Column = { key: string; label: string; required?: boolean; help?: string };

/** The five import steps (P10): template, upload, match columns, preview, import (with undo). */
export function ImportSteps({ columns, upload, check, run, undo }: {
  columns: Column[]; upload: typeof uploadStaffFile; check: typeof checkStaffFile; run: typeof importStaffFile; undo: typeof undoStaffImport;
}) {
  const [file, setFile] = useState<Upload | null>(null);
  const [match, setMatch] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Checked | null>(null);
  const [done, setDone] = useState<{ batchId: string; added: number; skipped: number; undone?: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const matchForm = () => {
    const fd = new FormData();
    fd.set("fileId", file!.fileId);
    for (const [k, v] of Object.entries(match)) fd.set(`col:${k}`, v);
    return fd;
  };

  function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      setProblem(null); setChecked(null); setDone(null);
      const r = await upload(fd);
      if (!r.ok) { setProblem(r.message); return; }
      setFile(r.data);
      setMatch(Object.fromEntries(Object.entries(r.data.match).map(([k, v]) => [k, String(v)])));
    });
  }
  const onCheck = () => start(async () => {
    setProblem(null);
    const r = await check(matchForm());
    if (!r.ok) setProblem(r.message); else setChecked(r.data);
  });
  const onImport = () => start(async () => {
    setProblem(null);
    const r = await run(matchForm());
    if (!r.ok) setProblem(r.message); else setDone(r.data);
  });
  const onUndo = () => start(async () => {
    const fd = new FormData();
    fd.set("batchId", done!.batchId);
    const r = await undo(fd);
    if (!r.ok) setProblem(r.message); else setDone({ ...done!, undone: r.data.archived });
  });

  const badCsv = checked && checked.bad.length > 0
    ? `data:text/csv;charset=utf-8,${encodeURIComponent(["Line,Name,Problems", ...checked.bad.map((b) => [b.line, `"${b.name.replace(/"/g, '""')}"`, `"${b.problems.join(" ").replace(/"/g, '""')}"`].join(","))].join("\r\n"))}`
    : null;

  return (
    <div className="space-y-5">
      {problem && <Alert tone="danger">{problem}</Alert>}

      <section aria-labelledby="step1" className="rounded-2xl border border-line bg-surface p-5">
        <h2 id="step1" className="text-lg font-semibold">1. Get the template</h2>
        <p className="mt-1 text-ink-2">Fill one row per staff member. Columns with * are needed. Dates like 01-06-2026. Designations and departments must already be in HR Settings.</p>
        <a href="/staff-hr-management/import/template" className={`${buttonClass("secondary", "sm")} mt-3`} download>Download template</a>
      </section>

      <section aria-labelledby="step2" className="rounded-2xl border border-line bg-surface p-5">
        <h2 id="step2" className="text-lg font-semibold">2. Upload the file</h2>
        <form onSubmit={onUpload} className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="import-file" className="mb-1 block text-sm font-medium">CSV or Excel file</label>
            <input id="import-file" name="file" type="file" required accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="block rounded-lg border border-line-strong bg-surface p-2 text-sm" />
          </div>
          <Button type="submit" loading={pending && !file} loadingText="Reading…">Upload</Button>
        </form>
        {file && <p className="mt-2 text-sm text-ink-2">{file.fileName}: {file.rows} rows.</p>}
      </section>

      {file && (
        <section aria-labelledby="step3" className="rounded-2xl border border-line bg-surface p-5">
          <h2 id="step3" className="text-lg font-semibold">3. Match the columns</h2>
          <p className="mt-1 text-ink-2">We matched what we could by name. Check each one.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {columns.map((c) => (
              <div key={c.key}>
                <label htmlFor={`col-${c.key}`} className="mb-1 block text-sm font-medium">{c.label}{c.required && <span className="text-danger" aria-hidden="true"> *</span>}</label>
                <select id={`col-${c.key}`} value={match[c.key] ?? ""} onChange={(e) => { setMatch({ ...match, [c.key]: e.target.value }); setChecked(null); }}
                  className="min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3" required={c.required}>
                  <option value="">Not in the file</option>
                  {file.headers.map((h, i) => <option key={i} value={String(i)}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </div>
            ))}
          </div>
          <Button className="mt-4" onClick={onCheck} loading={pending && !checked} loadingText="Checking every row…">Check rows</Button>
        </section>
      )}

      {checked && !done && (
        <section aria-labelledby="step4" className="rounded-2xl border border-line bg-surface p-5">
          <h2 id="step4" className="text-lg font-semibold">4. Preview</h2>
          <p className="mt-1"><Badge tone="success">{checked.good} ready</Badge> <Badge tone={checked.bad.length ? "danger" : "neutral"}>{checked.bad.length} with problems</Badge></p>
          {checked.sample.length > 0 && (
            <ul className="mt-3 text-sm">
              {checked.sample.map((s) => <li key={s.line}>Row {s.line}: {s.name}, {s.designation}{s.login ? ", with login" : ""}</li>)}
              {checked.good > checked.sample.length && <li className="text-ink-2">and {checked.good - checked.sample.length} more</li>}
            </ul>
          )}
          {checked.bad.length > 0 && (
            <div className="mt-3">
              <p className="font-medium">Rows with problems are skipped:</p>
              <ul className="mt-1 max-h-72 space-y-1 overflow-y-auto text-sm">
                {checked.bad.map((b) => <li key={b.line}><span className="font-medium">Row {b.line} ({b.name}):</span> {b.problems.join(" ")}</li>)}
              </ul>
              {badCsv && <a href={badCsv} download="staff-import-problems.csv" className="mt-2 inline-block text-brand-text underline">Download these rows</a>}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={onImport} disabled={checked.good === 0} loading={pending} loadingText="Importing…">Import {checked.good} staff</Button>
          </div>
        </section>
      )}

      {done && (
        <section aria-labelledby="step5" className="rounded-2xl border border-line bg-surface p-5">
          <h2 id="step5" className="text-lg font-semibold">5. Done</h2>
          {done.undone !== undefined ? <p className="mt-1">Import undone. {done.undone} staff archived.</p> : (
            <>
              <p className="mt-1">{done.added} staff added{done.skipped ? `, ${done.skipped} rows skipped` : ""}. Logins made here start as invited: share each invite link from the staff profile.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/staff-hr-management" className={buttonClass("primary", "sm")}>Open Staff List</Link>
                {done.skipped > 0 && <a href={`/staff-hr-management/import/errors/${done.batchId}`} className={buttonClass("secondary", "sm")} download>Download skipped rows</a>}
                <Button size="sm" variant="danger-outline" onClick={onUndo} loading={pending} loadingText="Undoing…">Undo this import</Button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
