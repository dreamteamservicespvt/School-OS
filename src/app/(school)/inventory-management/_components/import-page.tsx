// The import page for items (with opening stock) or assets (P10), on the
// same engine as Switching to School OS: the ready sheet, the upload, the
// files being checked and the earlier imports with Undo.
import Link from "next/link";
import { PLACES } from "@/lib/imports/places";
import { ImportHome } from "@/components/import/import-home";
import { FileReview } from "@/components/import/file-review";
import { InvHead } from "./head";
import { BASE, type InvPageData } from "../_lib/page";

const ABOUT = {
  "inventory-items": "One row per item, checked as if typed on Add item. Leave the code empty to give codes in sequence; a code or item already in use is flagged, not added twice. Opening stock can name several stores in one cell: Main store: 100; Lab store: 20. Undo is possible until the items are used.",
  "inventory-assets": "One row per asset, checked as if typed on Add asset. Leave the tag empty to give tags in sequence; a tag already in use is flagged. The location is a room, a department, or a staff member's code or name. Print their tags from Assets.",
};

const PAGE = {
  items: { name: "Import items", list: "Items & Stock", place: PLACES["inventory-items"] },
  assets: { name: "Import assets", list: "Assets", place: PLACES["inventory-assets"] },
} as const;

export async function ImportPage({ p, kind, file }: { p: InvPageData & { mode: string }; kind: "items" | "assets"; file?: { id: string; sp: Record<string, string | string[] | undefined> } }) {
  const page = PAGE[kind];
  return (
    <>
      <InvHead pageName={page.name} href={`${BASE}/${kind}/import`} mode={p.v.pages[kind]} sub={<Link href={`${BASE}/${kind}`} className="hover:underline">{page.list}</Link>} />
      {file ? <FileReview current={p.current} place={page.place} id={file.id} sp={file.sp} /> : <ImportHome current={p.current} place={page.place} about={ABOUT} />}
    </>
  );
}
