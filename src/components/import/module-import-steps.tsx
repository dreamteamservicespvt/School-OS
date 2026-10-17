"use client";

// The import steps on a module's own page (P10): get the ready sheet, upload,
// match the columns, see every row's problems, import the good rows, undo.
// Used for old dues and past receipts (Fee Management), past expenses
// (Finance Management) and the holiday list (Events & Calendar).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/ui/confirm";
import { inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import type { checkModuleImport, runModuleImport, undoModuleImportAction, uploadModuleImport } from "@/app/(school)/_imports/actions";

type Column = { key: string; label: string; required?: boolean; help?: string };
export type ImportKindView = { key: string; label: string; about: string; columns: Column[]; templateHref: string; one: string; many: string };
type Actions = { upload: typeof uploadModuleImport; check: typeof checkModuleImport; run: typeof runModuleImport; undo: typeof undoModuleImportAction };
type Upload = { fileId: string; fileName: string; headers: string[]; match: Record<string, number>; rows: number };
type Checked = { good: number; bad: { line: number; name: string; problems: string[] }[]; sample: { line: number; text: string }[] };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function ModuleImportSteps({ kinds, initial, doneHref, doneLabel, errorsBase, actions }: {
  kinds: ImportKindView[]; initial: string; doneHref: string; doneLabel: string; errorsBase: string; actions: Actions;
}) {
  const [kindKey, setKindKey] = useState(kinds.some((k) => k.key === initial) ? initial : kinds[0].key);
  const kind = kinds.find((k) => k.key === kindKey) ?? kinds[0];
  const [file, setFile] = useState<Upload | null>(null);
  const [match, setMatch] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Checked | null>(null);
  const [done, setDone] = useState<{ batchId: string; added: number; skipped: number; undone?: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const reset = () => { setFile(null); setMatch({}); setChecked(null); setDone(null); setProblem(null); };
  const form = () => {
    const fd = new FormData();
    fd.set("kind", kind.key);
    fd.set("fileId", file!.fileId);
    for (const [k, v] of Object.entries(match)) fd.set(`col:${k}`, v);
    return fd;
  };
  function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("kind", kind.key);
    start(async () => {
      setProblem(null); setChecked(null); setDone(null);
      const r = await actions.upload(fd);
      if (!r.ok) { setProblem(r.message); return; }
      setFile(r.data);
      setMatch(Object.fromEntries(Object.entries(r.data.match).map(([k, v]) => [k, String(v)])));
    });
  }
  const onCheck = () => start(async () => {
    setProblem(null);
    const r = await actions.check(form());
    if (!r.ok) setProblem(r.message); else setChecked(r.data);
  });
  const onImport = () => start(async () => {
    setProblem(null);
    const r = await actions.run(form());
    if (!r.ok) setProblem(r.message); else { setDone(r.data); router.refresh(); }
  });
  const onUndo = async () => {
    const fd = new FormData();
    fd.set("kind", kind.key);
    fd.set("batchId", done!.batchId);
    const r = await actions.undo(fd);
    if (!r.ok) return r.message;
    setDone({ ...done!, undone: r.data.archived });
    router.refresh();
  };

  const box = "rounded-2xl border border-line bg-surface p-5";
  return (
    <div className="flex flex-col gap-5">
      {problem && <Alert tone="danger">{problem}</Alert>}

      {kinds.length > 1 && (
        <fieldset className={box}>
          <legend className="sr-only">What are you bringing in?</legend>
          <p className="text-[16px] font-semibold">What are you bringing in?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {kinds.map((k) => (
              <label key={k.key} className={cx("flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-[14px]", k.key === kind.key ? "border-brand bg-brand-soft font-semibold" : "border-line")}>
                <input type="radio" name="import-kind" value={k.key} checked={k.key === kind.key} onChange={() => { setKindKey(k.key); reset(); }} className="size-4 accent-[rgb(var(--brand))]" />
                {k.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <section aria-labelledby="mi-step1" className={box}>
        <h2 id="mi-step1" className="text-[16px] font-semibold">1. Get the ready sheet</h2>
        <p className="mt-1 text-[14px] text-ink2">{kind.about} Columns with * are needed.</p>
        <a href={kind.templateHref} className={cx(buttonClass("secondary", "sm"), "mt-3")} download>Download the ready Excel sheet</a>
      </section>

      <section aria-labelledby="mi-step2" className={box}>
        <h2 id="mi-step2" className="text-[16px] font-semibold">2. Upload the file</h2>
        <form onSubmit={onUpload} className="mt-3 flex flex-wrap items-end gap-3" key={kind.key}>
          <div className="min-w-0">
            <label htmlFor="module-import-file" className="mb-1.5 block text-[13px] font-semibold text-ink2">CSV or Excel file</label>
            <input id="module-import-file" name="file" type="file" required accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="block max-w-full rounded-xl border border-line bg-surface p-2 text-[14px]" />
          </div>
          <Button type="submit" loading={pending && !file} loadingText="Reading…">Upload</Button>
        </form>
        {file && <p className="mt-2 text-[13.5px] text-ink2">{file.fileName}: {plural(file.rows, "row", "rows")}.</p>}
      </section>

      {file && (
        <section aria-labelledby="mi-step3" className={box}>
          <h2 id="mi-step3" className="text-[16px] font-semibold">3. Match the columns</h2>
          <p className="mt-1 text-[14px] text-ink2">We matched what we could by the headings, also when they are written another way. Check each one.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {kind.columns.map((c) => (
              <div key={c.key}>
                <label htmlFor={`mi-col-${c.key}`} className="mb-1.5 block text-[13px] font-semibold text-ink2">{c.label}{c.required && <span className="text-bad" aria-hidden="true"> *</span>}</label>
                <select id={`mi-col-${c.key}`} value={match[c.key] ?? ""} onChange={(e) => { setMatch({ ...match, [c.key]: e.target.value }); setChecked(null); }} className={cx(inputCls(false), "h-11")} required={c.required}>
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
        <section aria-labelledby="mi-step4" className={box}>
          <h2 id="mi-step4" className="text-[16px] font-semibold">4. Check</h2>
          <p className="mt-2 flex flex-wrap gap-2"><Pill tone="ok">{checked.good} ready</Pill> <Pill tone={checked.bad.length ? "bad" : "neutral"}>{checked.bad.length} with problems</Pill></p>
          {checked.sample.length > 0 && (
            <ul className="mt-3 flex flex-col gap-0.5 text-[14px]">
              {checked.sample.map((s) => <li key={s.line}>Row {s.line}: {s.text}</li>)}
              {checked.good > checked.sample.length && <li className="text-ink3">and {checked.good - checked.sample.length} more</li>}
            </ul>
          )}
          {checked.bad.length > 0 && (
            <div className="mt-3">
              <p className="text-[14px] font-semibold">Rows with problems are left out:</p>
              <ul className="mt-1 flex max-h-72 flex-col gap-1 overflow-y-auto text-[13.5px]">
                {checked.bad.map((b) => <li key={b.line}><span className="font-semibold">Row {b.line} ({b.name}):</span> <span className="text-bad">{b.problems.join(" ")}</span></li>)}
              </ul>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={onImport} disabled={checked.good === 0} loading={pending} loadingText="Importing…">Import {plural(checked.good, kind.one, kind.many)}</Button>
          </div>
        </section>
      )}

      {done && (
        <section aria-labelledby="mi-step5" className={box}>
          <h2 id="mi-step5" className="text-[16px] font-semibold">5. Done</h2>
          {done.undone !== undefined ? <p className="mt-1 text-[14px]">Import undone: {plural(done.undone, kind.one, kind.many)} taken back.</p> : (
            <>
              <p className="mt-1 text-[14px]">{plural(done.added, kind.one, kind.many)} brought in{done.skipped ? `, ${plural(done.skipped, "row", "rows")} left out with problems` : ""}.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={doneHref} className={buttonClass("primary", "sm")}>{doneLabel}</Link>
                {done.skipped > 0 && <a href={`${errorsBase}/${done.batchId}?kind=${kind.key}`} className={buttonClass("secondary", "sm")} download>Download the rows with problems</a>}
                <ModuleUndoButton label={kind.label} added={done.added} one={kind.one} many={kind.many} run={onUndo} />
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function ModuleUndoButton({ label, added, one, many, run }: { label: string; added: number; one: string; many: string; run: () => Promise<string | void> }) {
  return (
    <ConfirmButton trigger="Undo this import" triggerVariant="danger-outline" title={`Undo this import of ${label.toLowerCase()}?`} confirmLabel={`Undo import of ${plural(added, one, many)}`} confirmVariant="danger" onConfirm={run}>
      The {plural(added, one, many)} it brought in are taken back as a whole and the import stays in the history. This is written to the audit log.
    </ConfirmButton>
  );
}

/** Undo for an earlier import in the page's history. */
export function UndoEarlierImport({ kind, batchId, label, added, one, many, undo }: { kind: string; batchId: string; label: string; added: number; one: string; many: string; undo: typeof undoModuleImportAction }) {
  const router = useRouter();
  return (
    <ModuleUndoButton label={label} added={added} one={one} many={many} run={async () => {
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("batchId", batchId);
      const r = await undo(fd);
      if (!r.ok) return r.message;
      router.refresh();
    }} />
  );
}
