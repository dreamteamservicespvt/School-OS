import type { Metadata } from "next";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { readListParams, skipTake } from "@/lib/list";
import { can } from "@/lib/permissions";
import { importKind, importKinds } from "@/lib/importer";
import { shownFileName } from "@/lib/data-security/imports";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/list/data-table";
import { EmptyState } from "@/components/empty-state";
import { UploadForm } from "./forms";
import { UndoImportButton, AutoRefresh } from "../parts";

export const metadata: Metadata = { title: "Imports · Data Backup & Security" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ImportsPage({ searchParams }: Search) {
  const current = await requirePage("settings");
  const params = readListParams(await searchParams);
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
  const canImport = can(current.permissions, "settings", "create");
  const canUndo = can(current.permissions, "settings", "archive");
  const kinds = importKinds();

  return (
    <>
      <h2 className="sr-only">Imports</h2>
      {running > 0 && <AutoRefresh seconds={6} />}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Import from a spreadsheet" description="Upload, match your columns, check the preview, then import the good rows. Rows with problems are left out and you can download them to fix." />
          <CardBody>
            {canImport ? <UploadForm kinds={kinds.map((k) => ({ value: k.key, label: k.label }))} /> : <p className="text-ink-2">Your role can see import history but not import. Ask your School Admin.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Templates" description="Start from the template so the columns match. Columns with a star must be filled." />
          <CardBody>
            {kinds.length === 0 ? <p className="text-ink-2">No imports are available yet.</p> : (
              <ul className="divide-y divide-line">
                {kinds.map((k) => (
                  <li key={k.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="font-medium">{k.label}</span>
                    <a href={`/settings/data-security/imports/template/${k.key}`} className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-brand-text hover:bg-surface-2">Download template (CSV)</a>
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
            {canUndo && !r.undoneAt && r.added > 0 && importKind(r.kind) && <UndoImportButton batchId={r.id} label={importKind(r.kind)!.label} added={r.added} />}
          </div>
        )}
        empty={<EmptyState title="Nothing has been imported yet">When a school moves to School OS, its students, staff and fee dues usually come in from spreadsheets. Each import is listed here and can be undone.</EmptyState>}
      />
    </>
  );
}
