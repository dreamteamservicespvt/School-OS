// A15 "Something about to expire or run out", the inventory part: warranty
// and AMC ending within the reminder days in Inventory Settings (default 30)
// tell the store keeper once per end date. Low stock is told at the moment
// stock falls (src/lib/inventory/stock.ts lowStockCheck); this daily pass
// also catches items whose reorder level was raised above their stock.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { notify } from "../notifications";
import { formatDate } from "../format";
import { inventorySettings } from "./settings";
import { lowStockCheck, storeKeepers } from "./stock";
import { BASE } from "./words";

const DAY = 86_400_000;

/** Tells the store keeper about warranties and AMCs ending soon; each end date once. Returns how many were told. */
export async function warrantyReminders(tx: Tx, ctx: SchoolContext, today: Date) {
  const s = await inventorySettings(tx, ctx);
  const until = new Date(today.getTime() + s.warrantyReminderDays * DAY);
  const assets = await tx.asset.findMany({
    where: { status: { not: "DISPOSED" }, archivedAt: null, OR: [{ warrantyEnd: { gte: today, lte: until } }, { amcEnd: { gte: today, lte: until } }] },
    orderBy: { tag: "asc" },
  });
  const keepers = await storeKeepers(tx, ctx);
  // An automation: it reaches the store keeper even for assets they added themselves.
  const system = { schoolId: ctx.schoolId, userId: null };
  let told = 0;
  for (const a of assets) {
    const ends = ([["Warranty", a.warrantyEnd], ["AMC", a.amcEnd]] as const)
      .filter((e): e is readonly ["Warranty" | "AMC", Date] => Boolean(e[1] && e[1] >= today && e[1] <= until))
      .filter(([, d]) => !a.remindedFor || a.remindedFor < d)
      .sort((x, y) => x[1].getTime() - y[1].getTime());
    if (!ends.length) continue;
    const [what, end] = ends[0];
    const days = Math.round((end.getTime() - today.getTime()) / DAY);
    const text = `${what} of ${a.name} ${a.tag} ends on ${formatDate(end, "UTC")} (${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}). Renew it or plan the repair cover.`;
    for (const to of keepers) await notify(tx, system, { to, type: "warranty", text, link: `${BASE}/assets/${a.id}`, groupKey: "inventory-warranty", mergedText: (n) => `${n} warranties or AMCs end soon` });
    await tx.asset.update({ where: { id: a.id }, data: { remindedFor: end } });
    told++;
  }
  return told;
}

/** Items at or below their reorder level that were never told (for example after a reorder level was raised). */
export async function lowStockSweep(tx: Tx, ctx: SchoolContext) {
  const items = await tx.item.findMany({ where: { archivedAt: null, lowAlertAt: null }, select: { id: true } });
  let told = 0;
  for (const i of items) if (await lowStockCheck(tx, ctx, i.id)) told++;
  return told;
}
