// The import page for items (with opening stock) or assets (P10): the five
// steps, and the earlier imports with their skipped rows.
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { importKind } from "@/lib/importer";
import { ASSETS_IMPORT, ITEMS_IMPORT } from "@/lib/inventory/import";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { InvHead } from "./head";
import { ImportSteps } from "./import-steps";
import { BASE, type InvPageData } from "../_lib/page";
import { checkInventoryFile, importInventoryFile, undoInventoryImport, uploadInventoryFile } from "../import/actions";

const WORDS = {
  items: {
    one: "item", many: "items", listHref: `${BASE}/items`, listLabel: "Open Items & Stock", undone: "archived and their opening stock taken out.",
    templateHelp: "One row per item. Columns with * are needed. Leave the code empty to give codes in sequence; a code or item already in use is flagged, not added twice. Opening stock can name several stores in one cell: Main store: 100; Lab store: 20.",
    doneHelp: "Their opening stock is in the stores. Undo is possible until the items are used.",
  },
  assets: {
    one: "asset", many: "assets", listHref: `${BASE}/assets`, listLabel: "Open Assets", undone: "archived.",
    templateHelp: "One row per asset. Columns with * are needed. Leave the tag empty to give tags in sequence; a tag already in use is flagged. The location is a room, a department, or a staff member's code or name.",
    doneHelp: "Print their tags from Assets.",
  },
} as const;

export async function ImportPage({ p, kind }: { p: InvPageData & { mode: string }; kind: "items" | "assets" }) {
  const def = importKind(kind === "items" ? ITEMS_IMPORT : ASSETS_IMPORT)!;
  const history = await withSchool(p.current.ctx, (tx) => tx.importBatch.findMany({ where: { kind: def.key }, orderBy: { createdAt: "desc" }, take: 10 }));
  const page = kind === "items" ? { name: "Import items", list: "Items & Stock" } : { name: "Import assets", list: "Assets" };
  return (
    <>
      <InvHead pageName={page.name} href={`${BASE}/${kind}/import`} mode={p.v.pages[kind === "items" ? "items" : "assets"]} sub={<Link href={WORDS[kind].listHref} className="hover:underline">{page.list}</Link>} />
      <p className="mb-4 max-w-3xl text-[14px] text-ink2">
        {kind === "items" ? "Bring in the items and their stock from your old software or a spreadsheet. Each row is checked as if typed on Add item." : "Bring in the asset register from your old software or a spreadsheet. Each row is checked as if typed on Add asset."}
      </p>
      <ImportSteps kind={kind} words={WORDS[kind]} columns={def.columns.map((c) => ({ key: c.key, label: c.label, required: c.required, help: c.help }))}
        upload={uploadInventoryFile} check={checkInventoryFile} run={importInventoryFile} undo={undoInventoryImport} />
      {history.length > 0 && (
        <Card className="mt-5">
          <CardHeader title="Earlier imports" divided />
          <ul className="divide-y divide-line/70">
            {history.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[14px]">
                <span className="min-w-0 break-all">{b.fileName} <span className="text-[13px] text-ink3">· {formatDateTime(b.createdAt, p.tz)} · {b.added} added{b.skipped ? `, ${b.skipped} skipped` : ""}</span></span>
                <span className="flex items-center gap-2">
                  {b.undoneAt && <Pill>Undone</Pill>}
                  {b.skipped > 0 && <a href={`${BASE}/import/errors/${b.id}?kind=${kind}`} className="text-brand font-semibold hover:underline" download>Skipped rows</a>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
