// One file being brought in (00-global.md P10, workflow 15), the same on
// every import page: Settings, Switching to School OS, and each module's own
// Import page. Match columns, match words, then check every row: fix a row,
// leave it out, choose for a row that may already be on record, and bring in
// the ready rows; afterwards the result and Undo. The page that shows it
// checks who may open it; every action checks again on the server.
import Link from "next/link";
import type { Current } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { formatDate, formatDateTime } from "@/lib/format";
import { PARTS } from "@/lib/move-in/match";
import { sectionLabel } from "@/lib/move-in/lookups";
import { kindInfo, kindModule, lastFailure, moveInKinds, MoveInProblem, settleImports, workOn } from "@/lib/move-in/service";
import { placeHolds, errorsHref, fileHref, HOME, problemsHref, wordsFor, type ImportPlace } from "@/lib/imports/places";
import { placeRefusal } from "@/lib/imports/place-access";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { AutoRefresh } from "@/app/(school)/settings/data-security/parts";
import { ColumnsForm, FixRowForm, SheetForm, ValuesForm } from "./file-forms";
import { AddClassesButton, AddOptionsButton, ClearChoiceButton, ImportButton, LeaveOutButton, RemoveFileButton, RowChoices, TidySwitch, UndoFixButton, UndoImportButton } from "./file-buttons";
import { acceptAiColumnsAction, aiColumnsAction } from "@/app/(school)/_imports/file-actions";
import { aiReady } from "@/lib/ai";
import { AiColumnSuggestions } from "./ai-column-suggestions";

const STEPS = [
  { key: "columns", label: "Match columns" },
  { key: "values", label: "Match words" },
  { key: "check", label: "Check and bring in" },
] as const;
type Step = (typeof STEPS)[number]["key"];

type Props = { current: Current; place: ImportPlace; id: string; sp: Record<string, string | string[] | undefined> };

export async function FileReview({ current, place, id, sp }: Props) {
  const step: Step = STEPS.some((s) => s.key === sp.step) ? (sp.step as Step) : "columns";
  const tz = current.school.timeZone;
  const BASE = place.base;
  const here = fileHref(place, id);

  const result = await withSchool(current.ctx, async (tx) => {
    await settleImports(tx);
    try {
      const f = /^[0-9a-f-]{36}$/i.test(id) ? await tx.moveInFile.findFirst({ where: { id, archivedAt: null }, select: { kind: true } }) : null;
      // A module's page shows only the files it brings in.
      if (f && !placeHolds(place, f.kind)) throw new MoveInProblem("This file was not found. It may have been removed.");
      // Its rows only for people who may see those records in their own module (salary details, for example).
      if (f && !can(current.permissions, kindModule(f.kind), "view")) throw new MoveInProblem("Your role cannot see these records.");
      const w = await workOn(tx, current.ctx, id, { check: step === "check" });
      const batch = w.file.batchId ? await tx.importBatch.findUnique({ where: { id: w.file.batchId } }) : null;
      const failure = w.file.status === "open" ? await lastFailure(tx, w.file.importFileId) : null;
      return { ok: true as const, w, batch, failure };
    } catch (e) {
      if (e instanceof MoveInProblem) return { ok: false as const, message: e.message };
      throw e;
    }
  }, { timeout: 120_000 });

  if (!result.ok) {
    return <Alert tone="danger" action={<Link className="font-medium underline" href={BASE}>Back to {place.name}</Link>}>{result.message}</Alert>;
  }
  const { w, batch, failure } = result;
  const { file, kind, prepared, lookups, checked } = w;
  const info = kindInfo(kind.key);
  const label = info?.label ?? kind.label;
  const words = wordsFor(kind.key, label);
  const [bringRefused, undoRefused] = await Promise.all([placeRefusal(current, place, kind.key, "create"), placeRefusal(current, place, kind.key, "archive")]);
  const mayBring = bringRefused === null;
  const mayEdit = file.status === "open" && mayBring;
  const sheetList = file.sheets as { name: string; rows: number }[];
  const sheetName = sheetList.length > 1 ? sheetList[file.sheetIndex]?.name : null;
  const headers = prepared.headers;

  const header = (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <Link href={BASE} className="text-sm font-medium text-brand-text hover:underline">← {place.name}</Link>
        <h2 className="mt-1 text-xl font-semibold break-all">{file.fileName}{sheetName ? ` · ${sheetName}` : ""}</h2>
        <p className="text-sm text-ink-2">{label} · {prepared.rows.length} {prepared.rows.length === 1 ? "row" : "rows"} · uploaded {formatDateTime(file.createdAt, tz)}</p>
      </div>
      {file.status !== "importing" && mayBring && <RemoveFileButton place={place.key} id={file.id} imported={file.status === "imported"} back={BASE} />}
    </div>
  );

  // ── After the import has started ──
  if (file.status !== "open") {
    return (
      <>
        {header}
        {file.status === "importing" ? (
          <Card><CardBody className="space-y-2" >
            <AutoRefresh seconds={4} />
            <p className="font-medium" role="status">Bringing in {words.many} now…</p>
            <p className="text-ink-2">This page updates by itself. You can leave it; you will get a notification when it is done.</p>
          </CardBody></Card>
        ) : batch ? (
          <Card>
            <CardHeader title={batch.undoneAt ? "This import was undone" : "Brought in"} description={`${formatDateTime(batch.createdAt, tz)}${batch.undoneAt ? ` · undone ${formatDateTime(batch.undoneAt, tz)}` : ""}`} />
            <CardBody className="space-y-4">
              <dl className="grid grid-cols-3 gap-3">
                <Num label="Added" value={batch.added} tone="success" />
                <Num label="Updated" value={batch.updated} />
                <Num label="Left out with problems" value={batch.skipped} tone={batch.skipped ? "warning" : undefined} />
                {(batch.leftOut as { reason: string; count: number }[]).map((l) => <Num key={l.reason} label={`${l.reason} (nothing to bring in)`} value={l.count} />)}
              </dl>
              <div className="flex flex-wrap gap-2">
                {HOME[kind.key] && !batch.undoneAt && <ButtonLink href={HOME[kind.key].href} variant="primary">{HOME[kind.key].label}</ButtonLink>}
                {batch.skipped > 0 && <a href={errorsHref(place, batch.id, kind.key)} className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-brand-text hover:bg-surface-2" download>Download rows with problems</a>}
                {!batch.undoneAt && (batch.added > 0 || batch.updated > 0) && undoRefused === null && <UndoImportButton place={place.key} id={file.id} added={batch.added} one={words.one} many={words.many} />}
              </div>
              {batch.skipped > 0 && <p className="text-sm text-ink-2">Some rows changed between the check and the import (for example a section filled up). Fix them in the downloaded file and bring that file in.</p>}
            </CardBody>
          </Card>
        ) : <Alert>This file was imported.</Alert>}
      </>
    );
  }

  // What else the sheet could hold: kinds this page brings in that the person may add here, and its own.
  const kinds: { key: string; label: string }[] = [];
  for (const k of moveInKinds(current.modulesOn)) {
    if (k.key === kind.key || (placeHolds(place, k.key) && (await placeRefusal(current, place, k.key, "create")) === null)) kinds.push(k);
  }
  if (!kinds.some((k) => k.key === kind.key)) kinds.push({ key: kind.key, label });
  const sample = w.sheet.rows.slice(file.headerRow, file.headerRow + 12);
  const columnRows = kind.columns.map((c) => ({
    key: c.key, label: c.label, required: Boolean(c.required),
    help: c.key === "className" ? "A column with class and section together, like 5-A, fills both." : c.key === "fullName" && PARTS.fullName ? "First, middle and last name in their own columns? Choose them one after another." : c.help,
    cols: w.choices.columnMatch[c.key] ?? [], joinable: c.key === "fullName" || c.key === "address",
  }));
  const missingRequired = kind.columns.filter((c) => c.required && !(w.choices.columnMatch[c.key] ?? []).length);
  // Smart Import's AI suggestions: only for the person it is on for, with the AI service connected, once one heading is matched.
  const matchedKeys = kind.columns.filter((c) => (w.choices.columnMatch[c.key] ?? []).length);
  const usedCols = new Set(Object.values(w.choices.columnMatch).flat());
  const aiOffer = mayEdit && aiReady(current, "ai-smart-import") && matchedKeys.length > 0 && matchedKeys.length < kind.columns.length && headers.some((_, i) => !usedCols.has(i));

  return (
    <>
      {header}
      {failure && <Alert tone="danger" className="mb-4" title="The last import did not finish, and nothing was saved.">{failure} Fix the rows below and bring them in again.</Alert>}
      <details className="mb-4 rounded-2xl border border-line bg-surface px-5 py-3" open={sp.sheet === "1"}>
        <summary className="min-h-11 cursor-pointer py-2 font-medium">Sheet, heading row and what it holds <span className="font-normal text-ink-2">· {label}, headings in row {file.headerRow}</span></summary>
        <div className="pb-2 pt-1">
          {mayEdit ? (
            <SheetForm place={place.key} id={file.id} sheetIndex={file.sheetIndex} headerRow={file.headerRow} kind={kind.key}
              sheets={sheetList.map((s, i) => ({ value: String(i), label: `${s.name} (${s.rows} rows)` }))}
              headerChoices={w.sheet.rows.slice(0, 20).map((r, i) => ({ value: String(i + 1), label: `Row ${i + 1}: ${r.filter(Boolean).slice(0, 4).join(", ").slice(0, 60) || "empty"}` }))}
              kinds={kinds.map((k) => ({ value: k.key, label: k.label }))} />
          ) : <p className="text-ink-2">Your role can look at this file but not change it.</p>}
        </div>
      </details>

      <nav aria-label="Steps" className="mb-4">
        <ol className="flex flex-wrap gap-2 text-sm">
          {STEPS.map((s, i) => (
            <li key={s.key}>
              <Link href={`${here}?step=${s.key}`} aria-current={s.key === step ? "step" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full px-4 ${s.key === step ? "bg-brand-soft font-semibold text-brand-text" : "bg-surface-2 text-ink-2 hover:text-ink"}`}>
                {i + 1}. {s.label}{s.key === "values" && prepared.unmatched.length ? ` (${prepared.unmatched.length})` : ""}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      {step === "columns" && (
        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader title="1. Match columns" description="School OS matched the headings it recognised, and found some columns by what they hold. Check each one against the examples." />
            <CardBody className="space-y-4">
              {w.remembered && (
                <Alert title="Matched as last time.">
                  {w.remembered.keys.length} {w.remembered.keys.length === 1 ? "column is" : "columns are"} matched the way you confirmed for {w.remembered.source ? `${w.remembered.source} files` : `“${w.remembered.fileName}”`} ({formatDate(w.remembered.updatedAt, tz)}). Check each one; change any that is wrong.
                </Alert>
              )}
              {aiOffer && <AiColumnSuggestions ask={aiColumnsAction.bind(null, place.key, file.id)} accept={acceptAiColumnsAction.bind(null, place.key, file.id)} />}
              {mayEdit ? <ColumnsForm key={JSON.stringify(w.choices.columnMatch)} place={place.key} id={file.id} rows={columnRows} headers={headers} samples={sample} /> : <p className="text-ink-2">Your role cannot change this file.</p>}
            </CardBody>
          </Card>
          <Card className="self-start">
            <CardHeader title="Your file" description={`The first rows after the headings (row ${file.headerRow}).`} />
            <div className="max-h-[32rem] overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-surface-2"><tr>{headers.map((h, i) => <th key={i} scope="col" className="whitespace-nowrap px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-line">
                  {sample.slice(0, 8).map((r, i) => <tr key={i}>{headers.map((_, j) => <td key={j} className="whitespace-nowrap px-3 py-2">{r[j]}</td>)}</tr>)}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {step === "values" && (
        <div className="space-y-5">
          <Card>
            <CardHeader title="Tidy-ups" description={file.tidy ? "Small fixes made for you, so the rows match School OS. The file itself is not changed." : "Tidy-ups are off: values are used exactly as the file has them."}
              action={mayEdit ? <TidySwitch place={place.key} id={file.id} on={file.tidy} /> : undefined} />
            <CardBody>
              {prepared.tidied.length === 0 ? <p className="text-ink-2">{file.tidy ? "Nothing needed tidying." : "Switch them on to fix dates, phone numbers, capital letters and class names."}</p> : (
                <ul className="divide-y divide-line">
                  {prepared.tidied.map((t) => (
                    <li key={t.key} className="py-2">
                      <p><span className="font-medium">{t.label}</span>: {t.count} {t.count === 1 ? "value" : "values"}</p>
                      <p className="text-sm text-ink-2 break-words">{t.examples.map((e, i) => <span key={i}>{i ? " · " : ""}{e.from} → <span className="text-ink">{e.to}</span></span>)}</p>
                    </li>
                  ))}
                </ul>
              )}
              {Object.entries(prepared.dateOrders).some(([, o]) => o === "MDY") && <p className="mt-3 text-sm text-ink-2">Some dates are written month first (like 03/14/2016), so they are read that way.</p>}
            </CardBody>
          </Card>
          {(["class", "designation", "department"] as const).map((column) => {
            const groups = prepared.unmatched.filter((u) => u.column === column);
            if (!groups.length) return null;
            const all = column === "class" ? lookups.sections.map((s) => ({ value: s.id, label: sectionLabel(s) })) : (column === "designation" ? lookups.designations : lookups.departments).map((o) => ({ value: o, label: o }));
            const title = column === "class" ? "Classes and sections to match" : column === "designation" ? "Designations to match" : "Departments to match";
            return (
              <Card key={column}>
                <CardHeader title={title} description={column === "class" ? "These are not this year's classes as written. Choose the class each one means, or add the missing ones." : `These are not in HR Settings as written. Choose the one each means, or add them.`} />
                <CardBody>
                  {mayEdit ? (
                    <ValuesForm place={place.key} id={file.id} column={column} rows={groups.map((g) => ({
                      word: g.value, label: g.label, count: g.count, lines: g.lines,
                      chosen: g.chosen === "" ? "" : g.suggestions[0]?.value ?? "__keep",
                      options: [
                        { value: "__keep", label: "Choose…" },
                        ...g.suggestions.map((s) => ({ value: s.value, label: `${s.label} (suggested)` })),
                        ...all.filter((a) => !g.suggestions.some((s) => s.value === a.value)),
                        { value: "", label: "Leave it: these rows will show a problem" },
                      ],
                    }))}>
                      {column === "class" && can(current.permissions, "academic-management", "create") && (
                        <AddClassesButton place={place.key} id={file.id} words={groups.map((g) => g.value)} labels={groups.map((g) => g.label)} />
                      )}
                      {column !== "class" && can(current.permissions, "staff-hr-management", "edit") && <AddOptionsButton place={place.key} id={file.id} column={column} words={groups.map((g) => g.value)} />}
                    </ValuesForm>
                  ) : <p className="text-ink-2">{groups.length} words need matching. Your role cannot change this file.</p>}
                </CardBody>
              </Card>
            );
          })}
          {prepared.unmatched.length === 0 && <Alert tone="success" title="Every class and name in the file matches School OS." />}
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`${here}?step=check`} variant="primary">Continue to check</ButtonLink>
            <ButtonLink href={`${here}?step=columns`}>Back to columns</ButtonLink>
          </div>
        </div>
      )}

      {step === "check" && checked && (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Num label="Ready to bring in" value={checked.ready.length} tone="success" />
            <Num label="With problems" value={checked.problems.length} tone={checked.problems.length ? "danger" : undefined} />
            <Num label="Left out by you" value={prepared.passed.leftOut} />
            <Num label="Passed over" value={prepared.passed.empty + prepared.passed.headings + prepared.passed.totals + checked.left.reduce((a, l) => a + l.count, 0)} hint={[prepared.passed.empty && `${prepared.passed.empty} empty`, prepared.passed.headings && `${prepared.passed.headings} repeated headings`, prepared.passed.totals && `${prepared.passed.totals} total ${prepared.passed.totals === 1 ? "row" : "rows"}`, ...checked.left.map((l) => `${l.count} ${l.reason.toLowerCase()}`)].filter(Boolean).join(", ") || undefined} />
          </dl>
          {missingRequired.length > 0 && <Alert tone="warning" title={`Choose the column for ${missingRequired.map((c) => c.label).join(", ")}.`} action={<Link className="font-medium underline" href={`${here}?step=columns`}>Match columns</Link>}>Every row shows a problem until it is matched.</Alert>}
          {prepared.unmatched.length > 0 && <Alert tone="warning" title={`${prepared.unmatched.length} ${prepared.unmatched.length === 1 ? "word needs" : "words need"} matching.`} action={<Link className="font-medium underline" href={`${here}?step=values`}>Match words</Link>}>Rows with an unmatched class or designation show a problem until it is matched.</Alert>}

          {checked.problems.length > 0 && (
            <Card>
              <CardHeader title="Rows with problems" description="Fix a row here, or leave it out. Fixes are kept with this file, never written into your file."
                action={<a href={problemsHref(place, file.id)} download className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-brand-text hover:bg-surface-2">Download these rows</a>} />
              <ul className="divide-y divide-line">
                {checked.problems.slice(0, 100).map((p) => {
                  const fixed = prepared.rows.find((r) => r.line === p.line)?.fixed;
                  return (
                    <li key={p.line} className="px-5 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p><strong>Row {p.line}</strong>{p.values.fullName || p.values.name ? ` · ${p.values.fullName || p.values.name}` : ""}{fixed && <Badge tone="brand" className="ml-2">Fixed by you</Badge>}</p>
                          <p className="text-danger">{p.problems.join(" ")}</p>
                          {p.chosen && <p className="text-sm text-ink-2">Your choice: {p.chosenWords ?? p.chosen}</p>}
                        </div>
                        {mayEdit && <div className="flex gap-1">{p.chosen && <ClearChoiceButton place={place.key} id={file.id} line={p.line} />}{fixed && <UndoFixButton place={place.key} id={file.id} line={p.line} />}<LeaveOutButton place={place.key} id={file.id} lines={[p.line]} out /></div>}
                      </div>
                      {mayEdit && p.choices.length > 0 && <RowChoices place={place.key} id={file.id} line={p.line} choices={p.choices.filter((c) => c.value !== p.chosen)} />}
                      {mayEdit && (
                        <details className="mt-1">
                          <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-brand-text">Fix this row</summary>
                          <FixRowForm place={place.key} id={file.id} line={p.line} fields={kind.columns.map((c) => ({
                            key: c.key, label: c.label, value: p.values[c.key] ?? "", required: c.required,
                            options: c.key === "gender" ? [{ value: "", label: "Choose" }, { value: "Male", label: "Male" }, { value: "Female", label: "Female" }, { value: "Other", label: "Other" }]
                              : c.key === "designation" && lookups.designations.length ? [{ value: "", label: "Choose" }, ...lookups.designations.map((d) => ({ value: d, label: d }))] : undefined,
                          }))} />
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
              {checked.problems.length > 100 && <p className="px-5 pb-4 text-sm text-ink-2">The first 100 are shown. Download all {checked.problems.length}, fix them in Excel and bring that file in, or leave them all out.</p>}
              {mayEdit && checked.problems.length > 1 && <div className="border-t border-line px-5 py-3"><LeaveOutButton place={place.key} id={file.id} lines={checked.problems.map((p) => p.line)} out label={`Leave out all ${checked.problems.length} rows with problems`} /></div>}
            </Card>
          )}

          {checked.decided.length > 0 && (
            <Card>
              <CardHeader title="Your choices" description="Rows that may already be on record, with what you chose for each. Nothing is merged unless you chose it." />
              <ul className="divide-y divide-line">
                {checked.decided.slice(0, 100).map((d) => (
                  <li key={d.line} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3">
                    <p className="min-w-0"><strong>Row {d.line}</strong>{d.values.fullName ? ` · ${d.values.fullName}` : ""}<span className="block text-sm text-ink-2">{d.words}</span></p>
                    {mayEdit && <ClearChoiceButton place={place.key} id={file.id} line={d.line} />}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {prepared.passed.leftOut > 0 && mayEdit && (
            <p className="text-sm text-ink-2">{prepared.passed.leftOut} {prepared.passed.leftOut === 1 ? "row is" : "rows are"} left out. <LeaveOutButton place={place.key} id={file.id} lines={(w.choices.leftOut)} out={false} label="Bring them all back" /></p>
          )}

          <Card>
            <CardHeader title="Ready to bring in" description={checked.ready.length ? `The first ${Math.min(10, checked.ready.length)} of ${checked.ready.length}, as they will be saved.` : "No row is ready yet."} />
            {checked.ready.length > 0 && (
              <div className="max-h-[28rem] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-surface-2"><tr><th scope="col" className="px-3 py-2 text-left font-medium">Row</th>{kind.columns.filter((c) => checked.ready.some((r) => r.values[c.key])).map((c) => <th key={c.key} scope="col" className="whitespace-nowrap px-3 py-2 text-left font-medium">{c.label}</th>)}</tr></thead>
                  <tbody className="divide-y divide-line">
                    {checked.ready.slice(0, 10).map((r) => (
                      <tr key={r.line}><td className="px-3 py-2 text-ink-2">{r.line}</td>{kind.columns.filter((c) => checked.ready.some((x) => x.values[c.key])).map((c) => <td key={c.key} className="whitespace-nowrap px-3 py-2">{r.values[c.key]}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <CardBody className="flex flex-wrap items-center gap-3 border-t border-line">
              {mayEdit && checked.ready.length > 0 ? <ImportButton place={place.key} id={file.id} ready={checked.ready.length} problems={checked.problems.length} one={words.one} many={words.many} />
                : <p className="text-ink-2">{checked.ready.length ? bringRefused ?? "Your role cannot bring these in." : "Fix the problems above, or match the columns and words, to make rows ready."}</p>}
              {kind.key === "students" && <p className="text-sm text-ink-2">A parent already on record with the same phone is linked only when the name matches (a close spelling is fine), so brothers and sisters share their parents. Any other match waits for your choice above.</p>}
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}

function Num({ label, value, tone, hint }: { label: string; value: number; tone?: "success" | "danger" | "warning"; hint?: string }) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : tone === "warning" ? "text-warn-text" : "text-ink";
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className={`text-2xl font-semibold ${color}`}>{value}</dd>
      {hint && <dd className="text-xs text-ink-2">{hint}</dd>}
    </div>
  );
}
