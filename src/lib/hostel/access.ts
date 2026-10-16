// Who may see and do what in Hostel Management (05-roles.md: Principal,
// School Admin and Hostel Warden Full; Vice Principal View; everyone else
// none) and the owner's rules of 13 and 14 Oct 2026 (src/lib/duty.ts and the
// approved design's config.js): the Warden does the hostel's daily work for
// their own hostel only; the Principal reads every page, including Hostel
// Settings, and reminds the warden instead of taking roll call; the School
// Admin reads every page and keeps Hostel Settings (hostels, wardens, fee
// plans); the Vice Principal (View) reads Rooms & Beds, Allocation, Roll
// Call, Outings, Mess and Hostel Reports. Adding a hostel and choosing its
// wardens are never the warden's. Hostel fee amounts show only to people who
// have Fee Management. What is hidden here is also refused on the server.
import { pageMode, type DutyPerson, type PageMode } from "../duty";
import { ALL_ROLE_TEMPLATES, type AccessLevel } from "../roles";
import type { Reach } from "../permissions";
import { MODULE } from "./words";

export const HOSTEL_PAGES = ["rooms", "allocation", "rollcall", "outings", "mess", "reports", "settings"] as const;
export type HostelPage = (typeof HOSTEL_PAGES)[number];

/** View roles read these pages only (the approved design's VIEW list for the hostel). */
const VIEW_PAGES: readonly HostelPage[] = ["rooms", "allocation", "rollcall", "outings", "mess", "reports"];

export const WARDEN_ROLE = "hostel-warden";

export type HostelViewer = {
  userId: string;
  see: Reach;
  change: Reach;
  roleKeys: string[];
  pages: Record<HostelPage, PageMode>;
  /** A Hostel Warden with no other role that opens the hostel: works in their own hostel(s) only. */
  wardenOnly: boolean;
  /** Has Fee Management (sees hostel fee amounts and dues). */
  seesFees: boolean;
  /** Has Fee Management in full (sets hostel fee plans). */
  managesFees: boolean;
};

type Access = { see: Reach; change: Reach };
type Source = { permissions: Record<string, Access>; roles?: DutyPerson["roles"]; user: { id: string } };

function levelOf(role: DutyPerson["roles"][number]): AccessLevel {
  const own = role.permissions?.[MODULE];
  if (own) return own;
  const t = ALL_ROLE_TEMPLATES.find((r) => r.key === role.key);
  return t ? t.permissions[MODULE] : "none";
}

export function hostelViewer(current: Source): HostelViewer {
  const a = current.permissions[MODULE] ?? { see: "none", change: "none" };
  const fees = current.permissions["fee-management"] ?? { see: "none", change: "none" };
  const roles = current.roles ?? [];
  const roleKeys = roles.map((r) => r.key).filter((k): k is string => Boolean(k));
  const pages = {} as Record<HostelPage, PageMode>;
  for (const p of HOSTEL_PAGES) {
    if (a.see === "none") pages[p] = "hidden";
    else if (a.change !== "all") pages[p] = VIEW_PAGES.includes(p) ? "view" : "hidden";
    else pages[p] = pageMode({ roles }, MODULE, p);
  }
  const wardenOnly = roleKeys.includes(WARDEN_ROLE) && !roles.some((r) => r.key !== WARDEN_ROLE && levelOf(r) !== "none");
  return { userId: current.user.id, see: a.see, change: a.change, roleKeys, pages, wardenOnly, seesFees: fees.see === "all", managesFees: fees.change === "all" };
}

export const pageOpen = (v: Pick<HostelViewer, "pages">, p: HostelPage) => v.pages[p] !== "hidden";

/** What each person may do, so buttons a role cannot use are hidden (and the server refuses them). */
export function hostelCan(v: HostelViewer) {
  const full = (p: HostelPage) => v.change === "all" && v.pages[p] === "full";
  return {
    /** Add rooms and floors, block and unblock beds (a warden: in their own hostel). */
    rooms: full("rooms"),
    /** Add, change and close hostels and choose their wardens: never the warden. */
    hostels: !v.wardenOnly && (full("rooms") || full("settings")),
    /** Give beds, check in, move and check out. */
    allocate: full("allocation"),
    /** Take morning and night roll call, and record incidents. */
    rollcall: full("rollcall"),
    /** Request outing passes, mark out and returned, record visitors. */
    outings: full("outings"),
    /** Set the menu, record head counts and mess expenses. */
    mess: full("mess"),
    /** Change Hostel Settings. */
    settings: full("settings"),
    /** Set hostel fee plans: Hostel Settings in full and Fee Management in full. */
    feePlans: full("settings") && v.managesFees,
    /** Hostel fee amounts and dues (Fee Management). */
    seeFees: v.seesFees,
    /** Leaders who read the hostel's daily work remind the warden. */
    remind: v.change === "all" && v.pages.rollcall === "view",
    /** Exports for everyone who reads the hostel (a warden's exports hold their own hostel). */
    export: v.see === "all",
  };
}

export type HostelCan = ReturnType<typeof hostelCan>;

/** The page a person lands on: roll call for those who see it, else the first page they read. */
export function landingPage(v: Pick<HostelViewer, "pages">): HostelPage | null {
  if (v.pages.rollcall !== "hidden") return "rollcall";
  return HOSTEL_PAGES.find((p) => v.pages[p] !== "hidden") ?? null;
}
