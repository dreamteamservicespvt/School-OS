import type { Metadata } from "next";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { readListParams, skipTake } from "@/lib/list";
import { importKind } from "@/lib/importer";
import { shownFileName } from "@/lib/data-security/imports";
import { canBring, mayImport, moveInKinds } from "@/lib/move-in/service";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/list/data-table";
import { EmptyState } from "@/components/empty-state";
import { UploadForm } from "@/components/import/file-forms";
import { UndoImportButton, AutoRefresh } from "../parts";

export const metadata: Metadata = { title: "Imports · Data Backup & Security" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ImportsPage({ searchParams }: Search) {
  const { current, may } = await requireSettingsPage("data-security");
  const sp = await searchParams;
  const params = readListParams(sp);
  const tz = current.school.timeZone;
  const { rows, total, running, names } = await withSchool(current.ctx, async (tx) => {
    const [rows, total, running] = await Promise.all([
      tx.importBatch.findMany({ orderBy: { createdAt: "desc" }, ...skipTake(params) }),
      tx.importBatch.count(),
      tx.backgroundJob.count({ where: { kind: "import-run", status: { in: ["queued", "running"] } } }),
    ]);
    const ids = [...new Set(rows.map((r) => r.importedById).filter((x): x is string => Boolean(x)))];
    const people = ids.length ? await tx.schoolAccess.findMany({ where: { userLoginId: { in: ids } }, select: { userLogin: { select: { id: true, displayName: true } } } }) : [];
    return { rows, total, running, names: new Map(people.map((p) => [p.userLogin.id, p.userLogin.displayName])) };
  });
  // Each kind of record is imported, and undone, only by people who may add it in its own module.
  // Every file goes through the one import engine (Switching to School OS): headings matched, rows tidied and checked.
  const kinds = moveInKinds(current.modulesOn).filter((k) => canBring(current.permissions, k.key, current.modulesOn));
  const canImport = may.create && kinds.length > 0;
  const canUndo = (kind: string) => may.archive && mayImport(current.permissions, kind, "archive", current.modulesOn);
  const wanted = typeof sp.kind === "string" && kinds.some((k) => k.key === sp.kind) ? sp.kind : undefined;

  return (
    <>
      <h2 className="sr-only">Imports</h2>
      {running > 0 && <AutoRefresh seconds={6} />}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Import from a spreadsheet" description="Upload, check the matched columns and every row, fix or leave out the rows with problems, then bring in the rest. Nothing is saved before that." />
          <CardBody>
            {canImport ? <UploadForm place="settings" kinds={kinds.map((k) => ({ value: k.key, label: k.label }))} kind={wanted} /> : <p className="text-ink-2">Your role can see import history but not import. Ask your School Admin.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Ready sheets" description="Excel sheets made for your school, with drop-down lists of your own classes, designations and fee heads. Columns with a star must be filled." />
          <CardBody>
            {kinds.length === 0 ? <p className="text-ink-2">No imports are available yet.</p> : (
              <ul className="divide-y divide-line">
                {kinds.map((k) => (
                  <li key={k.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="font-medium">{k.label}</span>
                    <a href={`/settings/data-security/switching/template/${k.key}`} className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-brand-text hover:bg-surface-2" download>Download the ready Excel sheet</a>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-sm text-ink-2">Students, staff, fee dues and other records are imported from their own pages too; every import appears in the history below.</p>
          </CardBody>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Import history</h2>
      {running > 0 && <p className="mb-3 text-ink-2" role="status">{running} import{running === 1 ? " is" : "s are"} running now. This page updates by itself.</p>}
      <DataTable
        caption="Import history"
        rows={rows}
        total={total}
        params={params}
        path="/settings/data-security/imports"
        rowKey={(r) => r.id}
        columns={[
          { key: "when", label: "When", phone: "title", cell: (r) => formatDateTime(r.createdAt, tz) },
          { key: "kind", label: "What", phone: "meta", cell: (r) => importKind(r.kind)?.label ?? r.kind },
          { key: "file", label: "File", phone: "meta", cell: (r) => <span className="break-all">{shownFileName(r.fileName)}</span> },
          { key: "who", label: "By", cell: (r) => (r.importedById ? names.get(r.importedById) ?? "Someone" : "School OS") },
          { key: "result", label: "Result", phone: "meta", cell: (r) => `${r.added} added · ${r.updated} updated · ${r.skipped} with problems` },
          { key: "status", label: "Status", phone: "badge", cell: (r) => (r.undoneAt ? <Badge>Undone {formatDateTime(r.undoneAt, tz)}</Badge> : <Badge tone="success">Imported</Badge>) },
        ]}
        actions={(r) => (
          <div className="flex flex-wrap justify-end gap-1">
            {r.skipped > 0 && <a href={`/settings/data-security/imports/${r.id}/errors`} className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-brand-text hover:bg-surface-2">Rows with problems</a>}
            {canUndo(r.kind) && !r.undoneAt && (r.added > 0 || r.updated > 0) && importKind(r.kind) && <UndoImportButton batchId={r.id} label={importKind(r.kind)!.label} added={r.added} />}
          </div>
        )}
        empty={<EmptyState title="Nothing has been imported yet">When a school moves to School OS, its students, staff and fee dues usually come in from spreadsheets. Each import is listed here and can be undone.</EmptyState>}
      />
    </>
  );
}
