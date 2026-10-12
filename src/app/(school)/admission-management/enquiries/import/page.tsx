import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { importKind } from "@/lib/importer";
import { admissionPage, BASE } from "@/lib/admission/page";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImportSteps } from "./import-steps";
import { checkEnquiryFile, importEnquiryFile, undoEnquiryImport, uploadEnquiryFile } from "./actions";
import "@/lib/admission/import";

export const metadata: Metadata = { title: "Import enquiries" };

export default async function ImportEnquiriesPage() {
  const { current, viewer, tz } = await admissionPage("create");
  if (viewer.change !== "all") redirect(`${BASE}/enquiries`);
  const kind = importKind("admission-enquiries")!;
  const history = await withSchool(current.ctx, (tx) => tx.importBatch.findMany({ where: { kind: kind.key }, orderBy: { createdAt: "desc" }, take: 10 }));
  return (
    <>
      <PageHeader title="Import enquiries" href={`${BASE}/enquiries/import`} userId={current.user.id} />
      <p className="mb-4 max-w-3xl text-ink-2">Bring in open enquiries from your old software or a spreadsheet. Each one gets an owner and a follow-up. Rows whose phone already belongs to an enquiry, application or parent are flagged and skipped.</p>
      <ImportSteps columns={kind.columns.map((c) => ({ key: c.key, label: c.label, required: c.required, help: c.help }))} upload={uploadEnquiryFile} check={checkEnquiryFile} run={importEnquiryFile} undo={undoEnquiryImport} />
      {history.length > 0 && (
        <Card className="mt-5">
          <CardHeader title="Earlier imports" />
          <CardBody>
            <ul className="divide-y divide-line">
              {history.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{b.fileName} <span className="text-sm text-ink-2">· {formatDateTime(b.createdAt, tz)} · {b.added} added{b.skipped ? `, ${b.skipped} skipped` : ""}</span></span>
                  <span className="flex items-center gap-2">
                    {b.undoneAt && <Badge>Undone</Badge>}
                    {b.skipped > 0 && <a href={`${BASE}/enquiries/import/errors/${b.id}`} className="text-brand-text underline" download>Skipped rows</a>}
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
