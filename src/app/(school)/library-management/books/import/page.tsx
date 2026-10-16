import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { importKind } from "@/lib/importer";
import { CATALOGUE_IMPORT } from "@/lib/library/import";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { LibHead } from "../../_components/head";
import { BASE, libGuard } from "../../_lib/page";
import { ImportSteps } from "./import-steps";
import { checkCatalogueFile, importCatalogueFile, undoCatalogueImport, uploadCatalogueFile } from "./actions";

export const metadata: Metadata = { title: "Import books · Library Management" };

export default async function ImportBooksPage() {
  const p = await libGuard("books");
  if (!p.can.catalogue) redirect(`${BASE}/books`);
  const kind = importKind(CATALOGUE_IMPORT)!;
  const history = await withSchool(p.current.ctx, (tx) => tx.importBatch.findMany({ where: { kind: kind.key }, orderBy: { createdAt: "desc" }, take: 10 }));
  return (
    <>
      <LibHead pageName="Import books" href={`${BASE}/books/import`} mode={p.mode} sub={<Link href={`${BASE}/books`} className="hover:underline">Books</Link>} />
      <p className="mb-4 max-w-3xl text-[14px] text-ink2">Bring in the catalogue from your old software or a spreadsheet. Each book is checked as if typed on Add book: the ISBN, the authors, and the accession numbers.</p>
      <ImportSteps columns={kind.columns.map((c) => ({ key: c.key, label: c.label, required: c.required, help: c.help }))} upload={uploadCatalogueFile} check={checkCatalogueFile} run={importCatalogueFile} undo={undoCatalogueImport} />
      {history.length > 0 && (
        <Card className="mt-5">
          <CardHeader title="Earlier imports" divided />
          <ul className="divide-y divide-line/70">
            {history.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[14px]">
                <span className="min-w-0">{b.fileName} <span className="text-[13px] text-ink3">· {formatDateTime(b.createdAt, p.tz)} · {b.added} added{b.skipped ? `, ${b.skipped} skipped` : ""}</span></span>
                <span className="flex items-center gap-2">
                  {b.undoneAt && <Pill>Undone</Pill>}
                  {b.skipped > 0 && <a href={`${BASE}/books/import/errors/${b.id}`} className="text-brand font-semibold hover:underline" download>Skipped rows</a>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
