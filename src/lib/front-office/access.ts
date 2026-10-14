// Who may see and do what in Front Office (05-roles.md, and the approved
// design's role audit): Full (Receptionist, Principal, School Admin) runs the
// desk; View (Vice Principal) sees the desk, visitors, pickups and
// appointments; Office Staff (View) sees only Visitors and Pickup; Gate
// Security (Own) registers visitors, keeps the gate log and checks passes at
// the gate. Phone numbers are masked for roles without the permission.
import type { Prisma } from "@prisma/client";
import type { Reach } from "../permissions";

export type FoLevel = "full" | "view" | "office" | "gate";

export type FoViewer = {
  userId: string;
  see: Reach;
  change: Reach;
  roleKeys: string[];
  level: FoLevel | null;
};

type Source = { permissions: Record<string, { see: Reach; change: Reach }>; roles?: { key: string | null }[]; user: { id: string } };

/** Roles that see parents' phone numbers in full (16 §6: "see parent phone numbers", on by default for these). */
export const PARENT_PHONE_ROLES = ["principal", "school-admin", "receptionist"];
/** Roles that may change Front Office settings and lists. */
export const MANAGER_ROLES = ["principal", "school-admin"];

export function foViewer(current: Source): FoViewer {
  const a = current.permissions["front-office"] ?? { see: "none", change: "none" };
  const roleKeys = (current.roles ?? []).map((r) => r.key).filter((k): k is string => Boolean(k));
  let level: FoLevel | null = null;
  if (a.change === "all") level = "full";
  else if (a.see === "all") level = roleKeys.includes("office-staff") && !roleKeys.includes("vice-principal") && !roleKeys.some((k) => MANAGER_ROLES.includes(k)) ? "office" : "view";
  else if (a.see === "own") level = "gate";
  return { userId: current.user.id, see: a.see, change: a.change, roleKeys, level };
}

export const FO_PAGES = {
  desk: ["full", "view"],
  visitors: ["full", "view", "office", "gate"],
  pickup: ["full", "view", "office", "gate"],
  enquiries: ["full"],
  appointments: ["full", "view"],
  postal: ["full"],
} as const satisfies Record<string, readonly FoLevel[]>;
export type FoPageKey = keyof typeof FO_PAGES;

export function foPageAllowed(v: Pick<FoViewer, "level">, page: FoPageKey) {
  return v.level !== null && (FO_PAGES[page] as readonly FoLevel[]).includes(v.level);
}

/** What each level may do, so buttons a role cannot use are hidden (and the server refuses them). */
export function foCan(v: FoViewer) {
  const full = v.level === "full";
  const gate = v.level === "gate";
  return {
    /** Register a visitor and make a pass. */
    register: full || gate,
    /** Check a visitor out, close an expired pass. */
    checkOut: full || gate,
    /** Gate entries, checking passes, letting a child out at the gate. */
    gateWork: full || gate,
    /** Release a student and make a pickup gate pass: the desk only. */
    release: full,
    /** Desk work: enquiries, calls, walk-in requests, notes, appointments, postal. */
    desk: full,
    export: v.see !== "none",
    /** Gate Security cannot export the gate log. */
    exportGate: v.see === "all",
    /** Change the lists and policy (Front Office manager). */
    manage: full && v.roleKeys.some((k) => MANAGER_ROLES.includes(k)),
    /** Visitors' phone numbers in full (Office Staff and Gate Security see them masked). */
    visitorPhones: v.level === "full" || v.level === "view",
    /** Parents' phone numbers in the call log and the enquiry register. */
    parentPhones: v.roleKeys.some((k) => PARENT_PHONE_ROLES.includes(k)),
    /** Phones on the approved pickup list (Gate Security sees none). */
    pickupPhones: v.level !== "gate" && v.level !== null,
  };
}

export type FoCan = ReturnType<typeof foCan>;

/** "Own" reach (Gate Security): today's visitors at the gate and the ones they recorded. */
export function visitorScope(v: Pick<FoViewer, "see" | "userId">, today: Date): Prisma.VisitorEntryWhereInput {
  if (v.see === "all") return {};
  return { OR: [{ visitDate: today }, { createdById: v.userId }] };
}

export function gateScope(v: Pick<FoViewer, "see" | "userId">, dayStart: Date): Prisma.GateEntryWhereInput {
  if (v.see === "all") return {};
  return { OR: [{ at: { gte: dayStart } }, { recordedById: v.userId }] };
}
