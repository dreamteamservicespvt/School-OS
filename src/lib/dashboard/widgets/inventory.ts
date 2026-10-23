// Inventory Management on the Dashboard (14 §4: "Operations panel: low
// stock, assets, maintenance"). The numbers are the store's own: low stock is
// lowStockItems(), the same list as Items & Stock and the low-stock report.
// Widgets show only when the module is built, switched on and open to the
// person (the registry checks the module); each also checks the page.
import "server-only";

import { invCan, invViewer } from "../../inventory/access";
import { lowStockItems } from "../../inventory/stock";
import { inventorySettings } from "../../inventory/settings";
import { billDueSoon, billsWithState } from "../../inventory/purchases";
import { BASE, PRIORITY, qtyWords } from "../../inventory/words";
import { formatRupees } from "../../format";
import { iso, n, plural, shortDate } from "../common";
import type { ListRow, Viewer, Widget } from "../types";

const viewerOf = (v: Viewer) => invViewer(v as unknown as Parameters<typeof invViewer>[0]);
const sees = (page: "items" | "issue" | "purchases" | "assets" | "rooms") => (v: Viewer) => viewerOf(v).pages[page] !== "hidden";
const keeps = (v: Viewer) => invCan(viewerOf(v)).stock;

/** Items at or below their reorder level: the store keeper's and the leaders' (same list as Items & Stock). */
const lowBand: Widget<"band"> = {
  id: "inventory.low-stock",
  module: "inventory-management",
  kind: "band",
  homes: ["store", "leader"],
  allowed: sees("items"),
  async load(c) {
    const low = await c.memo("inv-low", () => lowStockItems(c.tx, 5000));
    const out = low.filter((x) => x.total <= 0).length;
    return { id: "inventory.low-stock", label: "Low stock items", big: n(low.length), foot: low.length ? (out ? `${plural(out, "item")} out of stock` : "At or below the reorder level") : "Everything above its level", href: `${BASE}/items?state=low` };
  },
};

/** Orders still waiting for goods. */
const openOrders: Widget<"band"> = {
  id: "inventory.open-orders",
  module: "inventory-management",
  kind: "band",
  homes: ["store"],
  allowed: sees("purchases"),
  async load(c) {
    const [open, late, oldest] = await Promise.all([
      c.tx.purchaseOrder.count({ where: { status: { in: ["SENT", "PART_RECEIVED"] } } }),
      c.tx.purchaseOrder.count({ where: { status: { in: ["SENT", "PART_RECEIVED"] }, expectedOn: { lt: c.today } } }),
      c.tx.purchaseOrder.findFirst({ where: { status: { in: ["SENT", "PART_RECEIVED"] } }, orderBy: { date: "asc" }, select: { date: true } }),
    ]);
    // From the oldest open order's date: the orders list keeps to this financial year unless dates are given.
    const dates = oldest ? `&from=${iso(oldest.date)}&to=${iso(c.today > oldest.date ? c.today : oldest.date)}` : "";
    return { id: "inventory.open-orders", label: "Orders to receive", big: n(open), foot: late ? `${plural(late, "order")} late` : open ? "None late" : "Nothing on order", href: `${BASE}/purchases?tab=orders&status=open${dates}` };
  },
};

/** What went out of the store today. */
const issuedToday: Widget<"band"> = {
  id: "inventory.issued-today",
  module: "inventory-management",
  kind: "band",
  homes: ["store"],
  allowed: sees("issue"),
  async load(c) {
    const [issues, sets] = await Promise.all([
      c.tx.stockIssue.count({ where: { date: c.today } }),
      c.tx.stockIssue.count({ where: { date: c.today, bookSetId: { not: null } } }),
    ]);
    return { id: "inventory.issued-today", label: "Issued today", big: n(issues), foot: sets ? `${plural(sets, "book set")}` : "From the store", href: `${BASE}?period=today` };
  },
};

/** Open maintenance requests: on the store keeper's and the leaders' homes. */
const maintenanceBand: Widget<"band"> = {
  id: "inventory.maintenance",
  module: "inventory-management",
  kind: "band",
  homes: ["store"],
  allowed: sees("rooms"),
  async load(c) {
    const [open, urgent] = await Promise.all([
      c.tx.maintenanceRequest.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      c.tx.maintenanceRequest.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, priority: { in: ["HIGH", "URGENT"] } } }),
    ]);
    return { id: "inventory.maintenance", label: "Maintenance open", big: n(open), foot: urgent ? `${plural(urgent, "urgent or high request")}` : open ? "None urgent" : "Nothing open", href: `${BASE}/rooms?tab=maintenance&status=open` };
  },
};

/** Items out of stock: the store keeper raises a request; leaders ask the store keeper. */
const outOfStock: Widget<"attention"> = {
  id: "inventory.out-of-stock",
  module: "inventory-management",
  kind: "attention",
  homes: ["store", "leader"],
  allowed: sees("items"),
  async load(c) {
    const low = await c.memo("inv-low", () => lowStockItems(c.tx, 5000));
    const out = low.filter((x) => x.total <= 0);
    if (!out.length) return null;
    const desk = keeps(c.viewer);
    return {
      id: "inventory.out-of-stock", tone: "bad", icon: "TriangleAlert",
      title: `${plural(out.length, "store item")} out of stock`,
      detail: `${out.slice(0, 3).map((x) => x.item.name).join(", ")}${out.length > 3 ? ` and ${out.length - 3} more` : ""}. ${desk ? "Raise a purchase request." : "Ask the store keeper to order them."}`,
      action: desk ? "Raise request" : "Review", href: desk ? `${BASE}/purchases?tab=requests&new=1&low=1` : `${BASE}/items?state=out`, value: String(out.length),
    };
  },
};

/** Urgent maintenance not done: the store keeper assigns it; leaders follow up. */
const urgentMaintenance: Widget<"attention"> = {
  id: "inventory.urgent-maintenance",
  module: "inventory-management",
  kind: "attention",
  homes: ["store", "leader"],
  allowed: sees("rooms"),
  async load(c) {
    const where = { status: { in: ["OPEN" as const, "IN_PROGRESS" as const] }, priority: "URGENT" as const };
    const [rows, count, unassigned] = await Promise.all([
      c.tx.maintenanceRequest.findMany({ where, orderBy: { raisedAt: "asc" }, take: 3 }),
      c.tx.maintenanceRequest.count({ where }),
      c.tx.maintenanceRequest.count({ where: { ...where, status: "OPEN" } }),
    ]);
    if (!rows.length) return null;
    return {
      id: "inventory.urgent-maintenance", tone: "warn", icon: "TriangleAlert",
      title: `${plural(count, "urgent maintenance request")} open`,
      detail: unassigned ? `${plural(unassigned, "request")} with no technician yet. Oldest: ${rows[0].problem.slice(0, 60)}.` : `Oldest: ${rows[0].problem.slice(0, 60)}.`,
      action: "Review", href: `${BASE}/rooms?tab=maintenance&priority=URGENT&status=open`, value: `${count}:${rows.map((r) => r.number).join(",")}`,
    };
  },
};

/** Vendor bills due within a week or overdue: those who pay see them. */
const billsDue: Widget<"attention"> = {
  id: "inventory.bills-due",
  module: "inventory-management",
  kind: "attention",
  homes: ["accountant", "store"],
  allowed: sees("purchases"),
  async load(c) {
    // The Bills tab's "Due within 7 days" (billDueSoon, gap list G36).
    const bills = (await billsWithState(c.tx)).filter((b) => billDueSoon(b, c.today));
    if (!bills.length) return null;
    const left = bills.reduce((a, b) => a + (b.expense!.amountPaise - b.expense!.paidPaise), BigInt(0));
    const late = bills.filter((b) => b.bill.dueDate! < c.today).length;
    const pays = invCan(viewerOf(c.viewer)).pay;
    return {
      id: "inventory.bills-due", tone: late ? "bad" : "warn", icon: "CreditCard",
      title: `${plural(bills.length, "vendor bill")} due: ${formatRupees(left)}`,
      detail: late ? `${plural(late, "bill")} past the due date.` : "Due within a week.",
      action: pays ? "Pay" : "Review", href: `${BASE}/purchases?tab=bills&status=due7`, value: `${bills.length}:${left}`,
    };
  },
};

/** Warranties and AMCs ending within the reminder days. */
const warranty: Widget<"attention"> = {
  id: "inventory.warranty",
  module: "inventory-management",
  kind: "attention",
  homes: ["store"],
  allowed: sees("assets"),
  async load(c) {
    const s = await inventorySettings(c.tx, c.viewer.ctx);
    const until = new Date(c.today.getTime() + s.warrantyReminderDays * 86_400_000);
    const count = await c.tx.asset.count({ where: { status: { not: "DISPOSED" }, archivedAt: null, OR: [{ warrantyEnd: { gte: c.today, lte: until } }, { amcEnd: { gte: c.today, lte: until } }] } });
    if (!count) return null;
    return {
      id: "inventory.warranty", tone: "info", icon: "Clock",
      title: `${plural(count, "warranty or AMC", "warranties or AMCs")} ending in ${s.warrantyReminderDays} days`,
      detail: "Renew the cover, or plan the repairs.", action: "Review", href: `${BASE}/assets?cover=ending`, value: String(count),
    };
  },
};

/** The low-stock list, with stock left: the store keeper's side panel. */
const lowPanel: Widget<"panel"> = {
  id: "inventory.low-panel",
  module: "inventory-management",
  kind: "panel",
  homes: ["store"],
  allowed: sees("items"),
  async load(c) {
    const low = (await c.memo("inv-low", () => lowStockItems(c.tx, 5000))).slice(0, 6);
    const rows: ListRow[] = low.map((x) => ({
      id: x.item.id, title: x.item.name, sub: `${x.item.code} · reorder at ${x.reorder}`, right: x.total <= 0 ? "Out of stock" : `${qtyWords(x.total, x.item.unit)} left`, rightTone: x.total <= 0 ? "bad" : "warn", href: `${BASE}/items/${x.item.id}`,
    }));
    return { slot: "side", panel: { kind: "list", title: "Low stock", sub: "At or below the reorder level, lowest first", icon: "TriangleAlert", rows, href: `${BASE}/items?state=low`, linkLabel: "All low stock", empty: "Every item is above its reorder level." } };
  },
};

/** Open maintenance requests by priority: the store keeper's main panel. */
const maintenancePanel: Widget<"panel"> = {
  id: "inventory.maintenance-panel",
  module: "inventory-management",
  kind: "panel",
  homes: ["store"],
  allowed: sees("rooms"),
  async load(c) {
    const reqs = await c.tx.maintenanceRequest.findMany({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, take: 40 });
    if (!reqs.length) return null;
    const rank = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as const;
    reqs.sort((a, b) => rank[a.priority] - rank[b.priority] || a.raisedAt.getTime() - b.raisedAt.getTime());
    const rooms = new Map((await c.tx.room.findMany({ where: { id: { in: reqs.map((r) => r.roomId) } }, select: { id: true, name: true } })).map((r) => [r.id, r.name]));
    const rows: ListRow[] = reqs.slice(0, 6).map((r) => ({
      id: r.id, title: r.problem.slice(0, 70), sub: `${r.number} · ${rooms.get(r.roomId) ?? ""} · ${shortDate(r.raisedAt)}${r.status === "OPEN" ? " · no technician" : ""}`,
      right: PRIORITY[r.priority].label, rightTone: r.priority === "URGENT" ? "bad" : r.priority === "HIGH" ? "warn" : "info", href: `${BASE}/rooms?tab=maintenance&request=${r.id}`,
    }));
    return { slot: "main", panel: { kind: "list", title: "Maintenance requests", sub: "Open, most urgent first", icon: "ListChecks", rows, href: `${BASE}/rooms?tab=maintenance&status=open`, linkLabel: "All open requests", empty: "No maintenance requests are open." } };
  },
};

export const INVENTORY_WIDGETS: Widget[] = [lowBand, openOrders, issuedToday, maintenanceBand, outOfStock, urgentMaintenance, billsDue, warranty, lowPanel, maintenancePanel];
