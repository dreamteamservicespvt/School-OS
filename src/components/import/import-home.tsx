// The body of a module's own Import page (00-global.md P10), on the one
// Switching to School OS engine: the ready sheet, the upload, the files
// still being checked (from here or from Settings) and the earlier imports,
// each with its rows with problems and, while it can be taken back, Undo.
// The page itself checks who may open it; every action checks again on the server.
import Link from "next/link";
import type { Current } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { importKind, leftWords } from "@/lib/importer";
import { kindInfo, settleImports } from "@/lib/move-in/service";
import { shownFileName } from "@/lib/data-security/imports";
import { errorsHref, fileHref, templateHref, wordsFor, type ImportPlace } from "@/lib/imports/places";
import { placeRefusal } from "@/lib/imports/place-access";
import { fileBatchIds } from "@/lib/move-in/batches";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { AutoRefresh } from "@/app/(school)/settings/data-security/parts";
import { PhotoUploadForm, UploadForm, type StudentChoices } from "./file-forms";
import { photoRefusal } from "@/lib/move-in/photos";
import { UndoBatchButton } from "./file-buttons";
import { Words } from "@/lib/i18n/client";

export async function ImportHome({ current, place, initial, about, students }: {
  current: Current;
  place: ImportPlace;
  /** The kind to offer first (?kind= on the page). */
  initial?: string;
  /** One line per kind: what a row is and what it becomes. */
  about: Record<string, string>;
  /** Student Management's own choices with the upload. */
  students?: StudentChoices;
}) {
  const tz = current.school.timeZone;
  const keys = place.kinds ?? [];
  const { files, history } = await withSchool(current.ctx, async (tx) => {
    await settleImports(tx);
    const [files, history] = await Promise.all([
      tx.moveInFile.findMany({ where: { kind: { in: [...keys] }, status: { in: ["open", "importing"] }, archivedAt: null }, orderBy: { createdAt: "desc" }, take: 20 }),
      tx.importBatch.findMany({ where: { kind: { in: [...keys] } }, orderBy: { createdAt: "desc" }, take: 15 }),
    ]);
    return { files, history };
  });
  const kinds = [];
  for (const key of keys) {
    const k = importKind(key);
    if (!k) continue;
    const label = kindInfo(key)?.label ?? k.label;
    const [bring, undo] = await Promise.all([placeRefusal(current, place, key, "create"), placeRefusal(current, place, key, "archive")]);
    kinds.push({ key, label, about: about[key] ?? "", may: bring === null, mayUndo: undo === null, ...wordsFor(key, label) });
  }
  const mine = kinds.filter((k) => k.may);
  const byKey = new Map(kinds.map((k) => [k.key, k]));
  const importing = files.some((f) => f.status === "importing");
  const box = "rounded-2xl border border-line bg-surface p-5";

  return (
    <div className="flex flex-col gap-5">
      {importing && <AutoRefresh seconds={5} />}
      <section aria-labelledby="ih-step1" className={box}>
        <h2 id="ih-step1" className="text-[16px] font-semibold"><Words k="1. Get the ready sheet" /></h2>
        <ul className="mt-2 flex flex-col gap-3">
          {kinds.map((k) => (
            <li key={k.key}>
              {kinds.length > 1 && <p className="font-medium">{k.label}</p>}
              <p className="text-[14px] text-ink2">{k.about} <Words k="Columns with * are needed." /></p>
              {k.may && <a href={templateHref(place, k.key)} className={cx(buttonClass("secondary", "sm"), "mt-2")} download><Words k="Download the ready Excel sheet" />{kinds.length > 1 ? `: ${k.label.toLowerCase()}` : ""}</a>}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ih-step2" className={box}>
        <h2 id="ih-step2" className="text-[16px] font-semibold"><Words k="2. Upload the file" /></h2>
        <p className="mt-1 text-[14px] text-ink2"><Words k="School OS finds the headings, matches the columns (also when they are written another way) and tidies dates, phones and names. Then you check every row, fix or leave out the ones with problems, and bring in the rest. Nothing is saved before that." /></p>
        <div className="mt-3">
          {mine.length ? (
            <UploadForm place={place.key} kinds={mine.map((k) => ({ value: k.key, label: k.label }))} kind={initial && mine.some((k) => k.key === initial) ? initial : undefined} guess={false} students={students}
              help="Excel (.xlsx) or CSV, up to 10 MB: the ready sheet, your own sheet or an export from your old software." />
          ) : <p className="text-ink2"><Words k="Your role can see these imports but not bring records in." /></p>}
          {mine.length > 0 && (
            <details className="mt-4 rounded-xl border border-line px-4">
              <summary className="flex min-h-11 cursor-pointer items-center font-medium"><Words k="Records on paper? Upload photos of the register" /></summary>
              <div className="pb-4 pt-1">
                <PhotoUploadForm place={place.key} kinds={mine.map((k) => ({ value: k.key, label: k.label }))} kind={initial && mine.some((k) => k.key === initial) ? initial : undefined} guess={false} students={students}
                  refusal={photoRefusal(current)} sheetHref={templateHref(place, (mine.find((k) => k.key === initial) ?? mine[0]).key)} />
              </div>
            </details>
          )}
        </div>
      </section>

      {files.length > 0 && (
        <Card>
          <CardHeader title="Files being checked" description="Open a file to match its columns, fix its rows and bring them in." divided />
          <ul className="divide-y divide-line/70">
            {files.map((f) => {
              const k = byKey.get(f.kind);
              const sheet = (f.sheets as { name: string; rows: number }[])[f.sheetIndex];
              return (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[14px]">
                  <span className="min-w-0 break-all">
                    <Link href={fileHref(place, f.id)} className="font-medium text-brand hover:underline">{f.fileName}{(f.sheets as unknown[]).length > 1 && sheet ? ` · ${sheet.name}` : ""}</Link>
                    <span className="block text-[13px] text-ink3">{k?.label ?? f.kind} <Words k="· uploaded" /> {formatDateTime(f.createdAt, tz)}{fileBatchIds(f).length ? ` · part brought in${f.waiting ? `, ${f.waiting} ${f.waiting === 1 ? "row" : "rows"} not brought in yet` : ""}` : ""}</span>
                  </span>
                  {f.status === "importing" ? <Pill tone="brand"><Words k="Importing" /></Pill> : k?.may && <ButtonLink href={fileHref(place, f.id)} size="sm" variant="primary"><Words k="Continue" /></ButtonLink>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {history.length > 0 && (
        <Card>
          <CardHeader title="Earlier imports" divided />
          <ul className="divide-y divide-line/70">
            {history.map((b) => {
              const k = byKey.get(b.kind);
              // Rows left out on purpose (for example "300 no old dues"): counted, never problems.
              const left = leftWords((b.leftOut ?? []) as { reason: string; count: number }[]);
              return (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[14px]">
                  <span className="min-w-0 break-all">
                    <span className="font-medium">{k?.label ?? b.kind}</span> · {shownFileName(b.fileName)}
                    <span className="block text-[13px] text-ink3">{formatDateTime(b.createdAt, tz)} · {b.added} <Words k="added" />{b.updated ? `, ${b.updated} updated` : ""}{left ? `, ${left}` : ""}{b.skipped ? `, ${b.skipped} with problems` : ""}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {b.undoneAt && <Pill><Words k="Undone" /></Pill>}
                    {b.skipped > 0 && k?.may && <a href={errorsHref(place, b.id, b.kind)} className="font-semibold text-brand hover:underline" download><Words k="Rows with problems" /></a>}
                    {!b.undoneAt && (b.added > 0 || b.updated > 0) && k?.mayUndo && <UndoBatchButton place={place.key} batchId={b.id} label={k.label} added={b.added || b.updated} one={k.one} many={k.many} />}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {history.length === 0 && files.length === 0 && (
        <Card><CardBody><p className="text-[14px] text-ink2"><Words k={"Nothing has been brought in here yet. Every import is also listed in Settings, Data Backup & Security, Imports."} /></p></CardBody></Card>
      )}
    </div>
  );
}
