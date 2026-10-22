// Workflow 15, "fix the file, undo and import again" (gap list G13): an
// import that typed its own numbers (accession numbers, item codes, asset
// tags, room numbers) is undone, and the same file comes in again. Numbers
// of records used since, or taken by anything but an import undo, stay taken.
import { describe, expect, it } from "vitest";
import { withSchool, type Tx } from "@/lib/db";
import { importKind, previewImport, runImport, undoImport } from "@/lib/importer";
import { byHeadings } from "../helpers";
import { CATALOGUE_IMPORT } from "@/lib/library/import";
import { copyByCode } from "@/lib/library/catalogue";
import { ITEMS_IMPORT, ASSETS_IMPORT } from "@/lib/inventory/import";
import { ROOMS_IMPORT } from "@/lib/hostel/import";
import "@/lib/import-registry";
import { desk, makeLibrarySchool } from "../library/fixture";
import { keeper, makeInventorySchool } from "../inventory/fixture";
import { as, makeHostelSchool } from "../hostel/fixture";

async function importTwice(ctx: { schoolId: string; userId: string | null }, key: string, headers: string[], rows: string[][]) {
  const kind = importKind(key)!;
  const run = <T,>(fn: (tx: Tx) => Promise<T>) => withSchool(ctx, fn, { timeout: 60_000 });
  const once = await run(async (tx) => runImport(tx, ctx, kind, "old.csv", await previewImport(tx, ctx, kind, rows, byHeadings(kind, headers))));
  await run((tx) => undoImport(tx, ctx, once.id));
  const preview = await run((tx) => previewImport(tx, ctx, kind, rows, byHeadings(kind, headers)));
  const twice = await run((tx) => runImport(tx, ctx, kind, "old.csv", preview));
  return { once, preview, twice, run };
}

describe("the same file comes in again after Undo", () => {
  it("library books with typed accession numbers; the scanner finds the new copy", async () => {
    const f = await makeLibrarySchool();
    const { once, preview, twice, run } = await importTwice(desk(f), CATALOGUE_IMPORT, ["Title", "Author", "Copies", "Accession numbers"], [["Malgudi Days", "R. K. Narayan", "2", "ACC-901, ACC-902"]]);
    expect(once.added).toBe(1);
    expect(preview.bad).toEqual([]);
    expect(twice).toMatchObject({ added: 1, skipped: 0 });
    const copy = await run((tx) => copyByCode(tx, "ACC-901"));
    expect(copy?.bookId).toBe((twice.createdIds as string[])[0]);
  }, 120_000);

  it("inventory items with codes and assets with tags", async () => {
    const f = await makeInventorySchool();
    const items = await importTwice(keeper(f), ITEMS_IMPORT, ["Item code", "Item name", "Category", "Opening stock"], [["ST-9001", "Chart paper", "Stationery", "40"]]);
    expect(items.preview.bad).toEqual([]);
    expect(items.twice.added).toBe(1);
    const assets = await importTwice(keeper(f), ASSETS_IMPORT, ["Asset tag", "Asset name", "Type", "Location or person"], [["AT-9001", "Smart board", "IT", "Room 12"]]);
    expect(assets.preview.bad).toEqual([]);
    expect(assets.twice.added).toBe(1);
  }, 120_000);

  it("hostel rooms with their numbers", async () => {
    const f = await makeHostelSchool();
    const { preview, twice } = await importTwice(as(f, f.admin.id), ROOMS_IMPORT, ["Hostel", "Floor", "Room number", "Beds"], [["Boys' Hostel", "First", "B-90", "2"]]);
    expect(preview.bad).toEqual([]);
    expect(twice.added).toBe(1);
  }, 120_000);
});
