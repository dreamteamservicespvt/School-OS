"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import type { checkInventoryFile, importInventoryFile, undoInventoryImport, uploadInventoryFile, Upload, Checked } from "../import/actions";

type Column = { key: string; label: string; required?: boolean; help?: string };
const BASE = "/inventory-management";

type Words = { one: string; many: string; templateHelp: string; doneHelp: string; listHref: string; listLabel: string; undone: string };

/** The five import steps (P10): template, upload, match columns, preview, import (with undo). */
export function ImportSteps({ kind, words, columns, upload, check, run, undo }: {
  kind: "items" | "assets"; words: Words; columns: Column[]; upload: typeof uploadInventoryFile; check: typeof checkInventoryFile; run: typeof importInventoryFile; undo: typeof undoInventoryImport;
}) {
  const n = (k: number) => `${k} ${k === 1 ? words.one : words.many}`;
  const [file, setFile] = useState<Upload | null>(null);
  const [match, setMatch] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Checked | null>(null);
  const [done, setDone] = useState<{ batchId: string; added: number; skipped: number; undone?: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const matchForm = () => {
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("fileId", file!.fileId);
    for (const [k, v] of Object.entries(match)) fd.set(`col:${k}`, v);
    return fd;
  };
  function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("kind", kind);
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
    fd.set("kind", kind);
    fd.set("batchId", done!.batchId);
    const r = await undo(fd);
    if (!r.ok) setProblem(r.message); else setDone({ ...done!, undone: r.data.archived });
  });

  const box = "rounded-2xl border border-line bg-surface p-5";
  return (
    <div className="flex flex-col gap-5">
      {problem && <Alert tone="danger">{problem}</Alert>}

      <section aria-labelledby="step1" className={box}>
        <h2 id="step1" className="text-[16px] font-semibold">1. Get the template</h2>
        <p className="mt-1 text-[14px] text-ink2">{words.templateHelp}</p>
        <a href={`${BASE}/import/template?kind=${kind}`} className={cx(buttonClass("secondary", "sm"), "mt-3")} download>Download template</a>
      </section>

      <section aria-labelledby="step2" className={box}>
        <h2 id="step2" className="text-[16px] font-semibold">2. Upload the file</h2>
        <form onSubmit={onUpload} className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-0">
            <label htmlFor="import-file" className="mb-1.5 block text-[13px] font-semibold text-ink2">CSV or Excel file</label>
            <input id="import-file" name="file" type="file" required accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="block max-w-full rounded-xl border border-line bg-surface p-2 text-[14px]" />
          </div>
          <Button type="submit" loading={pending && !file} loadingText="Reading…">Upload</Button>
        </form>
        {file && <p className="mt-2 text-[13.5px] text-ink2">{file.fileName}: {file.rows} rows.</p>}
      </section>

      {file && (
        <section aria-labelledby="step3" className={box}>
          <h2 id="step3" className="text-[16px] font-semibold">3. Match the columns</h2>
          <p className="mt-1 text-[14px] text-ink2">We matched what we could by name. Check each one.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {columns.map((c) => (
              <div key={c.key}>
                <label htmlFor={`col-${c.key}`} className="mb-1.5 block text-[13px] font-semibold text-ink2">{c.label}{c.required && <span className="text-bad" aria-hidden="true"> *</span>}</label>
                <select id={`col-${c.key}`} value={match[c.key] ?? ""} onChange={(e) => { setMatch({ ...match, [c.key]: e.target.value }); setChecked(null); }} className={cx(inputCls(false), "h-11")} required={c.required}>
                  <option value="">Not in the file</option>
                  {file.headers.map((h, i) => <option key={i} value={String(i)}>{h || `Column ${i + 1}`}</option>)}
                </select>
                {c.help && <p className="mt-1 text-[12px] text-ink3">{c.help}</p>}
              </div>
            ))}
          </div>
          <Button className="mt-4" onClick={onCheck} loading={pending && !checked} loadingText="Checking every row…">Check rows</Button>
        </section>
      )}

      {checked && !done && (
        <section aria-labelledby="step4" className={box}>
          <h2 id="step4" className="text-[16px] font-semibold">4. Preview</h2>
          <p className="mt-2 flex gap-2 flex-wrap"><Pill tone="ok">{checked.good} ready</Pill> <Pill tone={checked.bad.length ? "bad" : "neutral"}>{checked.bad.length} with problems</Pill></p>
          {checked.sample.length > 0 && (
            <ul className="mt-3 text-[14px] flex flex-col gap-0.5">
              {checked.sample.map((s) => <li key={s.line}>Row {s.line}: <b className="font-semibold">{s.name}</b>{s.detail ? ` · ${s.detail}` : ""}</li>)}
              {checked.good > checked.sample.length && <li className="text-ink3">and {checked.good - checked.sample.length} more</li>}
            </ul>
          )}
          {checked.bad.length > 0 && (
            <div className="mt-3">
              <p className="font-semibold text-[14px]">Rows with problems are skipped:</p>
              <ul className="mt-1 max-h-72 flex flex-col gap-1 overflow-y-auto text-[13.5px]">
                {checked.bad.map((b) => <li key={b.line}><span className="font-semibold">Row {b.line} ({b.name}):</span> {b.problems.join(" ")}</li>)}
              </ul>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={onImport} disabled={checked.good === 0} loading={pending} loadingText="Importing…">Import {n(checked.good)}</Button>
          </div>
        </section>
      )}

      {done && (
        <section aria-labelledby="step5" className={box}>
          <h2 id="step5" className="text-[16px] font-semibold">5. Done</h2>
          {done.undone !== undefined ? <p className="mt-1 text-[14px]">Import undone. {n(done.undone)} {words.undone}</p> : (
            <>
              <p className="mt-1 text-[14px]">{n(done.added)} added{done.skipped ? `, ${done.skipped} rows skipped` : ""}. {words.doneHelp}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={words.listHref} className={buttonClass("primary", "sm")}>{words.listLabel}</Link>
                {done.skipped > 0 && <a href={`${BASE}/import/errors/${done.batchId}?kind=${kind}`} className={buttonClass("secondary", "sm")} download>Download skipped rows</a>}
                <Button size="sm" variant="danger-outline" onClick={onUndo} loading={pending} loadingText="Undoing…">Undo this import</Button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
