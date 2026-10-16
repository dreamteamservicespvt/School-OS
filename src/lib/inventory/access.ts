// Who may see and do what in Inventory Management (05-roles.md: Principal,
// School Admin and Store Keeper Full; Accountant and Vice Principal View;
// everyone else none) and the owner's rules of 13 and 14 Oct 2026
// (src/lib/duty.ts and the approved design's VIEW_BY_ROLE):
//   - The Store Keeper does the work on every page, records vendor bills but
//     does not pay them and never sees vendor bank details.
//   - The Principal reads Items & Stock, Issue Stock, Assets, Rooms, Labs &
//     Maintenance, the reports and the settings, and works Purchases &
//     Vendors (approves, orders); Remind the store keeper instead of desk work.
//   - The School Admin reads every page and keeps Inventory Settings.
//   - View roles read Items & Stock, Purchases & Vendors, Assets and the
//     reports; the Accountant only Purchases & Vendors and the reports (to
//     see the purchases and bills that reach Finance) and pays the bills
//     there, because paying is Finance work.
// What is hidden here is also refused on the server.
import { pageMode, type DutyPerson, type PageMode } from "../duty";
import type { PermissionMap, Reach } from "../permissions";
import { MODULE } from "./words";

export const INV_PAGES = ["items", "issue", "purchases", "assets", "rooms", "reports", "settings"] as const;
export type InvPage = (typeof INV_PAGES)[number];

/** Pages View roles read (the approved design's VIEW list for inventory). */
const VIEW_PAGES: readonly InvPage[] = ["items", "purchases", "assets", "reports"];
/** A few roles read a narrower slice (config.js VIEW_BY_ROLE). */
const VIEW_BY_ROLE: Record<string, readonly InvPage[]> = { accountant: ["purchases", "reports"] };

export type InvViewer = {
  userId: string;
  see: Reach;
  change: Reach;
  roleKeys: string[];
  pages: Record<InvPage, PageMode>;
  /** Pays vendor bills (Finance Management work) and sees vendor bank details. */
  pays: boolean;
};

type Source = { permissions: Record<string, { see: Reach; change: Reach }>; roles?: DutyPerson["roles"]; user: { id: string } };

export function invViewer(current: Source): InvViewer {
  const a = current.permissions[MODULE] ?? { see: "none", change: "none" };
  const roles = current.roles ?? [];
  const roleKeys = roles.map((r) => r.key).filter((k): k is string => Boolean(k));
  const pages = {} as Record<InvPage, PageMode>;
  const viewSlice = new Set<InvPage>();
  for (const k of roleKeys) for (const p of VIEW_BY_ROLE[k] ?? []) viewSlice.add(p);
  // Someone with View from a role not listed above reads the usual View pages.
  const usual = roleKeys.length === 0 || roleKeys.some((k) => !VIEW_BY_ROLE[k]);
  if (usual || viewSlice.size === 0) for (const p of VIEW_PAGES) viewSlice.add(p);
  for (const p of INV_PAGES) {
    if (a.see === "none") pages[p] = "hidden";
    else if (a.change !== "all") pages[p] = viewSlice.has(p) ? "view" : "hidden";
    else pages[p] = pageMode({ roles }, MODULE, p);
  }
  const fin = (current.permissions as Partial<PermissionMap>)["finance-management"];
  const pays = Boolean(fin && fin.change === "all") && pageMode({ roles }, "finance-management", "expenses") === "full" && pages.purchases !== "hidden";
  return { userId: current.user.id, see: a.see, change: a.change, roleKeys, pages, pays };
}

export const pageOpen = (v: Pick<InvViewer, "pages">, p: InvPage) => v.pages[p] !== "hidden";

/** What each person may do, so buttons a role cannot use are hidden (and the server refuses them). */
export function invCan(v: InvViewer) {
  const full = (p: InvPage) => v.change === "all" && v.pages[p] === "full";
  return {
    /** Add and change items, stock in and out, transfers, write-offs, book sets, stock audits, item import. */
    stock: full("items"),
    /** Issue to staff, departments, classes and students; returns. */
    issue: full("issue"),
    /** Purchase requests, orders, goods received, bills and vendors. */
    purchase: full("purchases"),
    /** Pay a vendor bill (Finance work: the Accountant, the Principal). */
    pay: v.pays,
    /** See and change vendor bank details (those who pay). */
    bank: v.pays,
    /** Assets: add, assign, repairs, dispose, tags, asset audits, import. */
    assets: full("assets"),
    /** Facilities, maintenance requests and labs. */
    rooms: full("rooms"),
    /** Change Inventory Settings. */
    settings: full("settings"),
    /** Leaders who read the store's work remind the store keeper (low stock, open repairs). */
    remind: v.change === "all" && v.pages.items === "view",
    /** Exports for everyone who reads the inventory. */
    export: v.see === "all",
  };
}

export type InvCan = ReturnType<typeof invCan>;

/** The page a person lands on: Issue Stock for those who use it, else the first page they read. */
export function landingPage(v: Pick<InvViewer, "pages">): InvPage | null {
  if (v.pages.issue !== "hidden") return "issue";
  return INV_PAGES.find((p) => v.pages[p] !== "hidden") ?? null;
}
