// Inventory Settings (14 §6): item categories (with their reorder level and
// Finance expense head), store locations, units, item code and asset tag
// formats, the purchase approval amount, transfer approval, alerts, book
// sets, asset types and the depreciation method and rates. The store keeper
// and School Admin change them; the Principal can too; others read them.
import Link from "next/link";
import type { Metadata } from "next";
import { FolderTree, Plus, Warehouse } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Stack } from "@/components/money/kit";
import { nextCodePreview } from "@/lib/inventory/items";
import { nextTagPreview } from "@/lib/inventory/assets";
import { paiseToField, plural } from "@/lib/inventory/words";
import { InvHead } from "../_components/head";
import { ArchiveCategorySheet, ArchiveLocationSheet, CategorySheet, LocationSheet } from "../_components/sheets";
import { BASE, invGuard, one, UUID, type SearchParams } from "../_lib/page";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Inventory Settings · Inventory Management" };

export default async function InventorySettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const p = await invGuard("settings");
  const { current, settings: s, can, tz } = p;
  const d = await withSchool(current.ctx, async (tx) => {
    const [cats, stores, itemCounts, stock, heads, nextItem, nextTag, who] = await Promise.all([
      tx.itemCategory.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      tx.storeLocation.findMany({ where: { archivedAt: null }, orderBy: [{ isMain: "desc" }, { sortOrder: "asc" }, { name: "asc" }] }),
      tx.item.groupBy({ by: ["categoryId"], where: { archivedAt: null }, _count: { _all: true } }),
      tx.stockBalance.groupBy({ by: ["locationId"], where: { qty: { gt: 0 } }, _count: { _all: true } }),
      tx.accountHead.findMany({ where: { kind: "EXPENSE", archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      nextCodePreview(tx, current.ctx),
      nextTagPreview(tx, current.ctx),
      s.updatedById ? tx.userLogin.findFirst({ where: { id: s.updatedById }, select: { displayName: true } }) : Promise.resolve(null),
    ]);
    return { cats, stores, itemCounts, stock, heads: heads.map((h) => ({ value: h.id, label: h.name })), nextItem, nextTag, who };
  });
  const base = `${BASE}/settings`;
  const headName = new Map(d.heads.map((h) => [h.value, h.label]));
  const items = (id: string) => d.itemCounts.find((x) => x.categoryId === id)?._count._all ?? 0;
  const held = (id: string) => d.stock.find((x) => x.locationId === id)?._count._all ?? 0;
  const catParam = can.settings ? one(sp.cat) : "";
  const storeParam = can.settings ? one(sp.store) : "";
  const archCat = can.settings && UUID.test(one(sp.archcat)) ? d.cats.find((c) => c.id === one(sp.archcat)) : null;
  const archStore = can.settings && UUID.test(one(sp.archstore)) ? d.stores.find((c) => c.id === one(sp.archstore)) : null;
  const cat = catParam === "new" ? "new" : UUID.test(catParam) ? d.cats.find((c) => c.id === catParam) ?? null : null;
  const store = storeParam === "new" ? "new" : UUID.test(storeParam) ? d.stores.find((c) => c.id === storeParam) ?? null : null;

  return (
    <>
      <InvHead pageName="Inventory Settings" href={base} mode={p.mode} sub={d.who ? `Last changed by ${d.who.displayName} on ${formatDateTime(s.updatedAt, tz)}` : undefined} />
      <Stack>
        <div className="grid gap-5 lg:grid-cols-2 items-start">
          <Card>
            <CardHeader title="Item categories" icon={FolderTree} description="Each with its reorder level and the Finance head its bills go to." divided
              action={can.settings ? <ButtonLink href={`${base}?cat=new`} size="sm" icon={Plus} scroll={false}>Add category</ButtonLink> : undefined} />
            <ul className="divide-y divide-line/70">
              {d.cats.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-5 py-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[14px]">{c.name}</p>
                    <p className="text-[12.5px] text-ink3">{plural(items(c.id), "item")} · {c.defaultReorderLevel ? `reorder at ${c.defaultReorderLevel}` : "no reorder level"}{c.expenseHeadId ? ` · ${headName.get(c.expenseHeadId) ?? ""}` : ""}</p>
                  </div>
                  {c.isLab && <Pill tone="info">Lab</Pill>}
                  {can.settings && (
                    <span className="flex items-center gap-3 text-[13px] font-semibold">
                      <Link href={`${base}?cat=${c.id}`} scroll={false} className="text-brand hover:underline">Change</Link>
                      {items(c.id) === 0 && <Link href={`${base}?archcat=${c.id}`} scroll={false} className="text-ink3 hover:underline" aria-label={`Archive ${c.name}`}>Archive</Link>}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Stores" icon={Warehouse} description="Where stock is kept. New stock and issues start from the main store." divided
              action={can.settings ? <ButtonLink href={`${base}?store=new`} size="sm" icon={Plus} scroll={false}>Add store</ButtonLink> : undefined} />
            <ul className="divide-y divide-line/70">
              {d.stores.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-5 py-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[14px]">{l.name}</p>
                    <p className="text-[12.5px] text-ink3">{held(l.id) ? `Stock of ${plural(held(l.id), "item")}` : "No stock"}</p>
                  </div>
                  {l.isMain && <Pill tone="brand">Main store</Pill>}
                  {can.settings && (
                    <span className="flex items-center gap-3 text-[13px] font-semibold">
                      <Link href={`${base}?store=${l.id}`} scroll={false} className="text-brand hover:underline">Change</Link>
                      {!l.isMain && held(l.id) === 0 && <Link href={`${base}?archstore=${l.id}`} scroll={false} className="text-ink3 hover:underline" aria-label={`Archive ${l.name}`}>Archive</Link>}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <SettingsForm readOnly={!can.settings} heads={d.heads} start={{
          itemCodePrefix: s.itemCodePrefix, itemCodeWidth: s.itemCodeWidth, nextItem: d.nextItem,
          assetTagPrefix: s.assetTagPrefix, assetTagWidth: s.assetTagWidth, nextTag: d.nextTag,
          poPrefix: s.poPrefix, approveUpTo: paiseToField(s.approveUpToPaise), transfersNeedApproval: s.transfersNeedApproval, defaultExpenseHeadId: s.defaultExpenseHeadId ?? "",
          units: s.units.join(", "), lowStockAlerts: s.lowStockAlerts, bookSetsOn: s.bookSetsOn, setsWithMissing: s.setsWithMissing,
          assetTypes: s.assetTypes, rates: s.rates, depreciationMethod: s.depreciationMethod, warrantyReminderDays: s.warrantyReminderDays,
        }} />
        <p className="text-[13px] text-ink3">The purchase order and asset tag designs are in <Link className="font-semibold text-brand hover:underline" href="/settings/document-designs">Settings, Document Designs</Link>. Who approves purchases, transfers and disposals is in <Link className="font-semibold text-brand hover:underline" href="/settings/forms-approvals">Forms & Approvals</Link>.</p>
      </Stack>
      {cat && <CategorySheet closeHref={base} heads={d.heads} start={cat === "new" ? null : { id: cat.id, name: cat.name, isLab: cat.isLab, reorder: String(cat.defaultReorderLevel), headId: cat.expenseHeadId ?? "" }} />}
      {store && <LocationSheet closeHref={base} start={store === "new" ? null : { id: store.id, name: store.name, isMain: store.isMain }} />}
      {archCat && <ArchiveCategorySheet closeHref={base} id={archCat.id} name={archCat.name} />}
      {archStore && <ArchiveLocationSheet closeHref={base} id={archStore.id} name={archStore.name} />}
    </>
  );
}
