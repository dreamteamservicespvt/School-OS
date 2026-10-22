// What the top bar and menu show for the signed-in person.
import "server-only";

import { withSchool } from "./db";
import { BUILT_MODULES, MODULES } from "./modules";
import { shortcutsFor } from "./shortcuts";
import { approvalsFor } from "./approvals";
import { UNREAD } from "./notifications";
import type { Current } from "./current";
import { BOTTOM_BY_ROLE, QUICK_BY_ROLE, type BarItem, type Quick } from "@/components/shell/nav-config";
import { FEE_PAGES, feePageAllowedFor, type FeePageKey } from "./fees/access";
import { FINANCE_PAGES, financePageAllowed, type FinancePageKey } from "./finance/access";
import { pageHidden } from "./duty";
import { answersSupport, waitingSupportCount } from "./console/support";
import type { ModuleKey } from "./modules";
import { foLanding, foViewer } from "./front-office/access";
import { offeredQuestions, readyMadeFor } from "./ask/answer";

/** The page a module's own address opens, when the link names no page. */
const FRONT_PAGE: Partial<Record<string, string>> = { "attendance-management": "take", "fee-management": "dashboard" };

/**
 * Desk work the person's roles never do (src/lib/duty.ts, owner's changes of 13 Oct 2026) is left off the
 * phone bar, "New" and shortcuts: the Principal, School Admin and Vice Principal get no Collect fee or Take attendance.
 */
export function dutyOpen(current: Pick<Current, "roles">, href: string) {
  const [, mod, page] = href.split("?")[0].split("/");
  const key = page || FRONT_PAGE[mod];
  if (!key || !MODULES.some((m) => m.key === mod)) return true;
  return !pageHidden(current, mod as ModuleKey, key);
}

/** A Fee or Finance page the person's role cannot use is hidden, not shown and refused (new-rules: hide what a role cannot do). */
export function moneyPageOpen(current: Pick<Current, "roles" | "permissions">, href: string) {
  const [, mod, page] = href.split("?")[0].split("/");
  const key = page || (mod === "fee-management" ? "dashboard" : "day-book");
  if (mod === "fee-management" && key in FEE_PAGES) return feePageAllowedFor(current, key as FeePageKey);
  if (mod === "finance-management" && key in FINANCE_PAGES) return financePageAllowed(current.permissions, key as FinancePageKey);
  return true;
}

/**
 * Whether Approvals shows "Waiting for me" (00-global.md §1): anyone allowed to approve
 * something (full access to a module, class teachers for student leave, by default),
 * or anyone with a request already waiting for them.
 */
export function mayApprove(current: Current, waiting: number) {
  return waiting > 0 || current.roles.some((r) => r.key === "class-teacher") || MODULES.some((m) => current.permissions[m.key].change === "all");
}

/** "New" and the Dashboard's Quick actions: the person's roles' actions they may open and do, at most 6. Approvals only for people who may approve. */
export function quickActionsFor(current: Pick<Current, "roles" | "menu" | "permissions">, canApprove = true): Quick[] {
  const visible = new Set<string>(current.menu.map((m) => m.key));
  const seen = new Set<string>();
  return current.roles
    .flatMap((r) => QUICK_BY_ROLE[r.key ?? ""] ?? [])
    .filter((i) => (i.href === "/approvals" ? canApprove : visible.has(i.module) && current.permissions[i.module].change !== "none")
      && moneyPageOpen(current, i.href) && dutyOpen(current, i.href) && !seen.has(i.label) && seen.add(i.label))
    .slice(0, 6);
}

/**
 * Where a module's menu link opens for this person when its own address would
 * only send them on (QA PERF-01): the Principal and others without the
 * Reception Desk land on Visitors straight away, with its loading shape,
 * instead of waiting for a redirect.
 */
export function landingFor(current: Pick<Current, "permissions" | "roles" | "user">): Record<string, string> {
  const out: Record<string, string> = {};
  const fo = foLanding(foViewer(current));
  if (fo && fo !== "/front-office") out["front-office"] = fo;
  return out;
}

export async function shellData(current: Current) {
  const [{ unread, approvals: requests, campus }, supportWaiting] = await Promise.all([withSchool(current.ctx, async (tx) => ({
    unread: await tx.notification.count({ where: { userLoginId: current.user.id, ...UNREAD } }),
    campus: await tx.campus.findFirst({ where: { archivedAt: null }, orderBy: [{ isMain: "desc" }, { createdAt: "asc" }], select: { name: true, address: true } }),
    // Only requests this person may decide: named to them, or to one of their roles (00-global.md §3.2).
    approvals: await tx.approval.count({ where: await approvalsFor(tx, current.ctx, current.roles.map((r) => r.key)) }),
  })),
  // DREAM TEAM support access waiting for the School Admin or Principal (07-super-admin.md §3.4).
  answersSupport(current) ? waitingSupportCount(current.school.id).catch(() => 0) : Promise.resolve(0)]);
  const approvals = requests + supportWaiting;

  const landing = landingFor(current);
  const menu = current.menu.map((m) => ({ key: m.key, name: m.name, href: landing[m.key] ?? `/${m.key}` }));
  const visible = new Set<string>(current.menu.map((m) => m.key));
  const pages = [
    ...current.menu.map((m) => ({ label: m.name, href: `/${m.key}`, hint: BUILT_MODULES.has(m.key) ? undefined : `Stage ${m.stage}` })),
    { label: "Approvals", href: "/approvals" },
    { label: "Notifications", href: "/notifications" },
    { label: "Messages", href: "/messages" },
    { label: "My profile", href: "/profile" },
    { label: "Change password", href: "/profile#password" },
    { label: "Signed-in devices", href: "/profile#devices" },
  ];
  // Approvals shows for anyone allowed to approve something (00-global.md §1):
  // full access to a module, class teachers (student leave, by default), or
  // anyone with a request already waiting for them.
  const canApprove = mayApprove(current, approvals);

  // The phone bar and "New" follow the person's first role that has them, and only show what they may open or do.
  const roleKeys = current.roles.map((r) => r.key ?? "");
  const bottomFor = roleKeys.map((k) => BOTTOM_BY_ROLE[k]).find(Boolean) ?? BOTTOM_BY_ROLE.principal;
  const bottom: BarItem[] = bottomFor.filter((i) => (i.href === "/approvals" ? canApprove : visible.has(i.module)) && moneyPageOpen(current, i.href) && dutyOpen(current, i.href));
  const quick = quickActionsFor(current, canApprove);
  // Where the school is, for the menu: the town from the main campus address.
  const parts = campus?.address?.split(",").map((x) => x.trim()).filter(Boolean) ?? [];
  const place = parts.length >= 3 ? parts.slice(-3, -1).join(", ") : parts[0] ?? campus?.name ?? "";

  // Ask, rule-based (gap list G27): only questions about lists the person's role already opens.
  const askKeys = offeredQuestions(current);
  const questions = readyMadeFor(current, askKeys).map((q) => ({ label: q.title, href: q.href }));

  return {
    menu,
    landing,
    askKeys,
    questions,
    bottom,
    quick,
    place,
    pages,
    shortcuts: shortcutsFor(current.roles.map((r) => r.key), current.permissions, visible).filter((s) => moneyPageOpen(current, s.href) && dutyOpen(current, s.href)).map((s) => ({ label: s.label, href: s.href })),
    unread,
    approvals,
    canApprove,
    roleNames: current.roles.map((r) => r.name).join(", "),
  };
}
