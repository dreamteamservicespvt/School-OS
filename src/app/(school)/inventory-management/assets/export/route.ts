// The asset register for the search, filters and purchase dates on screen,
// with each asset's value after depreciation today.
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { formatDate, formatRupees } from "@/lib/format";
import { bookValue, rateOf } from "@/lib/inventory/assets";
import { inventorySettings } from "@/lib/inventory/settings";
import { ASSET_STATUS } from "@/lib/inventory/words";
import { invRoute, rangeWords } from "../../_lib/route";
import { assetsList, readAssetsFilter } from "../../_lib/lists";

export const dynamic = "force-dynamic";
const day = (d: Date | null) => (d ? formatDate(d, "UTC") : "");

export async function GET(req: Request) {
  const x = await invRoute(req, "assets");
  if (x instanceof Response) return x;
  const range = await x.range(null);
  const f = readAssetsFilter(x.get, range);
  const out = await withSchool(x.current.ctx, async (tx) => {
    const s = await inventorySettings(tx, x.current.ctx);
    const list = await assetsList(tx, f, x.today, s.warrantyReminderDays);
    const vendors = new Map((await tx.vendor.findMany({ select: { id: true, name: true } })).map((v) => [v.id, v.name]));
    const room = f.room ? (await tx.room.findFirst({ where: { id: f.room }, select: { name: true } }))?.name : "";
    const filters = [range ? `Bought: ${rangeWords(range)}` : "", f.type ? `Type: ${f.type}` : "", f.status ? `Status: ${ASSET_STATUS[f.status as "IN_USE"].label}` : "", room ? `Room: ${room}` : "", f.cover ? `Warranty or AMC ending within ${s.warrantyReminderDays} days` : "", f.q ? `Search: ${f.q}` : ""].filter(Boolean).join(" · ");
    await logExport(tx, x.current.ctx, { title: "Asset register", format: x.format, filters, rows: list.rows.length });
    return { ...list, s, vendors, filters };
  }, { timeout: 60_000 });
  type A = (typeof out.rows)[number];
  const columns: ExportColumn<A>[] = [
    { label: "Tag", value: (a) => a.tag },
    { label: "Asset", value: (a) => a.name },
    { label: "Type", value: (a) => a.type },
    { label: "Serial number", value: (a) => a.serialNo ?? "" },
    { label: "Where", value: (a) => out.places(a) },
    { label: "Purchase date", value: (a) => day(a.purchaseDate) },
    { label: "Cost", value: (a) => (a.costPaise !== null ? formatRupees(a.costPaise) : "") },
    { label: "Value today", value: (a) => (a.costPaise !== null ? formatRupees(bookValue(a, out.s.depreciationMethod, rateOf(a, out.s), x.today)) : "") },
    { label: "Vendor", value: (a) => (a.vendorId ? out.vendors.get(a.vendorId) ?? "" : "") },
    { label: "Warranty ends", value: (a) => day(a.warrantyEnd) },
    { label: "AMC ends", value: (a) => day(a.amcEnd) },
    { label: "Condition", value: (a) => a.condition },
    { label: "Status", value: (a) => ASSET_STATUS[a.status].label },
  ];
  return exportResponse(await buildExport(x.format, columns, out.rows, { title: "Asset register", schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters: out.filters }));
}
