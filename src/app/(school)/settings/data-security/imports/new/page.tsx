// Steps 3 and 4 of the shared importer (P10): match the file's columns to
// School OS's fields, then see every row's problems before importing.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { autoMatch, importKind, leftCounts, previewImport } from "@/lib/importer";
import { matchFromParams, readUploaded } from "@/lib/data-security/imports";
import { mayImport } from "@/lib/move-in/service";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { StartImport } from "../forms";

export const metadata: Metadata = { title: "New import · Data Backup & Security" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewImportPage({ searchParams }: Search) {
  const { current } = await requireSettingsPage("data-security", "create");
  const sp = await searchParams;
  const kind = importKind(one(sp.kind));
  const fileId = one(sp.file);
  if (!kind || !UUID.test(fileId) || !mayImport(current.permissions, kind.key, "create", current.modulesOn)) notFound();
  const step = one(sp.step) === "preview" ? "preview" : "match";

  const result = await withSchool(current.ctx, async (tx) => {
    const uploaded = await readUploaded(tx, fileId);
    if (!uploaded) return null;
    const { headers, rows } = uploaded.sheet;
    const match = step === "preview" ? matchFromParams(sp, kind.columns.map((c) => c.key), headers.length) : autoMatch(kind.columns, headers);
    const preview = step === "preview" ? await previewImport(tx, current.ctx, kind, rows, match) : null;
    return { fileName: uploaded.file.fileName, headers, rows: rows.length, sample: rows.slice(0, 3), match, preview };
  }, { timeout: 60_000 });

  if (!result) {
    return (
      <>
        <h2 className="mb-4 text-xl font-semibold">Import {kind.label.toLowerCase()}</h2>
        <Alert tone="danger" title="The uploaded file was not found">Upload it again from <Link href="/settings/data-security/imports" className="underline">Imports</Link>.</Alert>
      </>
    );
  }
  const missing = kind.columns.filter((c) => c.required && result.match[c.key] === undefined);
  const matchQuery = new URLSearchParams({ kind: kind.key, file: fileId, ...Object.fromEntries(Object.entries(result.match).map(([k, v]) => [`col_${k}`, String(v)])) });

  return (
    <>
      <h2 className="mb-4 text-xl font-semibold">Import {kind.label.toLowerCase()}</h2>
      <ol className="mb-5 flex flex-wrap gap-2 text-sm" aria-label="Steps">
        <li><Badge>1. Upload ✓</Badge></li>
        <li><Badge tone={step === "match" ? "brand" : "neutral"}>2. Match columns{step === "preview" ? " ✓" : ""}</Badge></li>
        <li><Badge tone={step === "preview" ? "brand" : "neutral"}>3. Check and import</Badge></li>
      </ol>
      <p className="mb-4 text-ink-2">File: <span className="font-medium text-ink">{result.fileName}</span> · {result.rows} row{result.rows === 1 ? "" : "s"}</p>

      {result.rows === 0 && <Alert tone="warning" className="mb-4" title="This file has no rows under the headings">Check that the first row is the column headings and the data starts on row 2.</Alert>}

      {step === "match" ? (
        <Card>
          <CardHeader title="Match your columns" description="We matched the columns we could by their headings. Check each one; choose “Not in my file” for anything the file does not have." />
          <CardBody>
            <form method="get" action="/settings/data-security/imports/new" className="space-y-4">
              <input type="hidden" name="kind" value={kind.key} />
              <input type="hidden" name="file" value={fileId} />
              <input type="hidden" name="step" value="preview" />
              <div className="grid gap-4 md:grid-cols-2">
                {kind.columns.map((c) => (
                  <div key={c.key}>
                    <label htmlFor={`col_${c.key}`} className="mb-1 block text-sm font-medium">{c.label}{c.required && <span className="text-danger" aria-hidden="true"> *</span>}</label>
                    <select id={`col_${c.key}`} name={`col_${c.key}`} defaultValue={result.match[c.key] !== undefined ? String(result.match[c.key]) : ""}
                      className="min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-base text-ink">
                      <option value="">{c.required ? "Choose a column" : "Not in my file"}</option>
                      {result.headers.map((h, i) => (
                        <option key={i} value={i}>{h || `Column ${i + 1}`}{result.sample[0]?.[i] ? ` (e.g. ${result.sample[0][i].slice(0, 30)})` : ""}</option>
                      ))}
                    </select>
                    {c.help && <p className="mt-1 text-sm text-ink-2">{c.help}</p>}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 font-medium text-brand-ink hover:bg-brand-hover">Check the rows</button>
                <ButtonLink href="/settings/data-security/imports">Cancel</ButtonLink>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : missing.length ? (
        <Alert tone="danger" title="Some required columns are not matched">
          Match a column for {missing.map((c) => c.label).join(", ")}. <Link href={`/settings/data-security/imports/new?${new URLSearchParams({ kind: kind.key, file: fileId })}`} className="underline">Back to matching</Link>
        </Alert>
      ) : result.preview && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="success">{result.preview.good.length} ready to import</Badge>
            <Badge tone={result.preview.bad.length ? "danger" : "neutral"}>{result.preview.bad.length} with problems</Badge>
            {leftCounts(result.preview.left).map((l) => <Badge key={l.reason}>{l.count} {l.reason.toLowerCase()}: left out, nothing to fix</Badge>)}
          </div>
          {result.preview.bad.length > 0 && (
            <Card>
              <CardHeader title="Rows with problems" description="These rows will be left out. Download them, fix the problems and import that file again." />
              <CardBody>
                <a href={`/settings/data-security/imports/preview-errors?${matchQuery}`} className="mb-3 inline-flex min-h-11 items-center font-medium text-brand-text hover:underline">Download rows with problems (CSV)</a>
                <ul className="divide-y divide-line">
                  {result.preview.bad.slice(0, 50).map((b) => (
                    <li key={b.line} className="py-2">
                      <p className="font-medium">Row {b.line}{kind.columns[0] ? `: ${b.row[kind.columns[0].key] || "(empty)"}` : ""}</p>
                      <ul className="list-disc pl-5 text-sm text-danger">{b.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
                    </li>
                  ))}
                </ul>
                {result.preview.bad.length > 50 && <p className="mt-2 text-sm text-ink-2">And {result.preview.bad.length - 50} more in the download.</p>}
                {result.preview.bad.some((b) => b.choices?.length) && <p className="mt-2 text-sm text-ink-2">Some rows may already be on record. Bring this file in from <Link href="/settings/data-security/switching" className="font-medium underline">Switching to School OS</Link> (or Student Management, Import) to choose for each row: the same student, the same family, or a new student.</p>}
              </CardBody>
            </Card>
          )}
          {result.preview.good.length > 0 && (
            <Card>
              <CardHeader title="Rows ready to import" description={result.preview.good.length > 10 ? `The first 10 of ${result.preview.good.length}.` : undefined} />
              <CardBody>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-ink-2"><tr><th scope="col" className="py-2 pr-3 font-medium">Row</th>{kind.columns.map((c) => <th key={c.key} scope="col" className="py-2 pr-3 font-medium">{c.label}</th>)}</tr></thead>
                    <tbody className="divide-y divide-line">
                      {result.preview.good.slice(0, 10).map((g) => (
                        <tr key={g.line}><td className="py-2 pr-3">{g.line}</td>{kind.columns.map((c) => <td key={c.key} className="py-2 pr-3">{g.row[c.key]}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          )}
          <div className="flex flex-wrap items-start gap-2">
            <StartImport kind={kind.key} fileId={fileId} match={result.match} good={result.preview.good.length} />
            <ButtonLink href={`/settings/data-security/imports/new?${new URLSearchParams({ kind: kind.key, file: fileId })}`}>Change matching</ButtonLink>
          </div>
          <p className="text-sm text-ink-2">The import runs in the background; you will get a notification when it is done. You can undo the whole import later from Import history.</p>
        </div>
      )}
    </>
  );
}
