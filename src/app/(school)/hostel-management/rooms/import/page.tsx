import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { importKind } from "@/lib/importer";
import { ROOMS_IMPORT } from "@/lib/hostel/import";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { HostelHead } from "../../_components/head";
import { BASE, hostelGuard } from "../../_lib/page";
import { ImportSteps } from "./import-steps";
import { checkRoomsFile, importRoomsFile, undoRoomsImport, uploadRoomsFile } from "./actions";

export const metadata: Metadata = { title: "Import rooms · Hostel Management" };

export default async function ImportRoomsPage() {
  const p = await hostelGuard("rooms");
  if (!p.can.rooms) redirect(`${BASE}/rooms`);
  const kind = importKind(ROOMS_IMPORT)!;
  const history = await withSchool(p.current.ctx, (tx) => tx.importBatch.findMany({ where: { kind: kind.key }, orderBy: { createdAt: "desc" }, take: 10 }));
  return (
    <>
      <HostelHead pageName="Import rooms" href={`${BASE}/rooms/import`} mode={p.mode} sub={<Link href={`${BASE}/rooms`} className="hover:underline">Rooms & Beds</Link>} />
      <p className="mb-4 max-w-3xl text-[14px] text-ink2">Bring in many rooms at once from a spreadsheet. Each room is checked as if typed on Add room: the hostel must exist, and a room number is used once in a hostel.{p.mine !== null ? " You can import into your own hostel only." : ""}</p>
      <ImportSteps columns={kind.columns.map((c) => ({ key: c.key, label: c.label, required: c.required, help: c.help }))} upload={uploadRoomsFile} check={checkRoomsFile} run={importRoomsFile} undo={undoRoomsImport} />
      {history.length > 0 && (
        <Card className="mt-5">
          <CardHeader title="Earlier imports" divided />
          <ul className="divide-y divide-line/70">
            {history.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[14px]">
                <span className="min-w-0 break-all">{b.fileName} <span className="text-[13px] text-ink3">· {formatDateTime(b.createdAt, p.tz)} · {b.added} added{b.skipped ? `, ${b.skipped} skipped` : ""}</span></span>
                <span className="flex items-center gap-2">
                  {b.undoneAt && <Pill>Undone</Pill>}
                  {b.skipped > 0 && <a href={`${BASE}/rooms/import/errors/${b.id}`} className="text-brand font-semibold hover:underline" download>Skipped rows</a>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
