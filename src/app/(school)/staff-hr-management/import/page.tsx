import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { importKind } from "@/lib/importer";
import { hrPage, BASE } from "@/lib/staff/page";
import { BackLink } from "@/components/ui/module-head";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImportSteps } from "./import-steps";
import { checkStaffFile, importStaffFile, undoStaffImport, uploadStaffFile } from "./actions";
import "@/lib/staff/import";

export const metadata: Metadata = { title: "Import staff" };

export default async function ImportStaffPage() {
  const { current, viewer, tz } = await hrPage("create");
  if (viewer.change !== "all") redirect("/no-access?m=staff-hr-management");
  const kind = importKind("staff")!;
  const history = await withSchool(current.ctx, (tx) => tx.importBatch.findMany({ where: { kind: "staff" }, orderBy: { createdAt: "desc" }, take: 10 }));
  return (
    <>
      <BackLink href={BASE} label="Staff List" />
      <PageHeader title="Import staff" href={`${BASE}/import`} userId={current.user.id} />
      <ImportSteps columns={kind.columns.map((c) => ({ key: c.key, label: c.label, required: c.required, help: c.help }))} upload={uploadStaffFile} check={checkStaffFile} run={importStaffFile} undo={undoStaffImport} />
      {history.length > 0 && (
        <Card className="mt-5">
          <CardHeader title="Earlier imports" />
          <CardBody>
            <ul className="divide-y divide-line">
              {history.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0 break-all">{b.fileName} <span className="text-sm text-ink-2">· {formatDateTime(b.createdAt, tz)} · {b.added} added{b.skipped ? `, ${b.skipped} skipped` : ""}</span></span>
                  <span className="flex items-center gap-2">
                    {b.undoneAt && <Badge>Undone</Badge>}
                    {b.skipped > 0 && <a href={`${BASE}/import/errors/${b.id}`} className="text-brand-text underline" download>Skipped rows</a>}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </>
  );
}
