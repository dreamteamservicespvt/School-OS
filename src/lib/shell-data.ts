// What the top bar and menu show for the signed-in person.
import "server-only";

import { withSchool } from "./db";
import { BUILT_MODULES, MODULES } from "./modules";
import { shortcutsFor } from "./shortcuts";
import { approvalsFor } from "./approvals";
import type { Current } from "./current";
import { BOTTOM_BY_ROLE, QUICK_BY_ROLE, type BarItem, type Quick } from "@/components/shell/nav-config";

/**
 * Whether Approvals shows "Waiting for me" (00-global.md §1): anyone allowed to approve
 * something (full access to a module, class teachers for student leave, by default),
 * or anyone with a request already waiting for them.
 */
export function mayApprove(current: Current, waiting: number) {
  return waiting > 0 || current.roles.some((r) => r.key === "class-teacher") || MODULES.some((m) => current.permissions[m.key].change === "all");
}

export async function shellData(current: Current) {
  const { unread, approvals, campus } = await withSchool(current.ctx, async (tx) => ({
    unread: await tx.notification.count({ where: { userLoginId: current.user.id, readAt: null } }),
    campus: await tx.campus.findFirst({ where: { archivedAt: null }, orderBy: [{ isMain: "desc" }, { createdAt: "asc" }], select: { name: true, address: true } }),
    // Only requests this person may decide: named to them, or to one of their roles (00-global.md §3.2).
    approvals: await tx.approval.count({ where: await approvalsFor(tx, current.ctx, current.roles.map((r) => r.key)) }),
  }));

  const menu = current.menu.map((m) => ({ key: m.key, name: m.name, href: `/${m.key}` }));
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
  const bottom: BarItem[] = bottomFor.filter((i) => visible.has(i.module));
  const seenQuick = new Set<string>();
  const quick: Quick[] = roleKeys
    .flatMap((k) => QUICK_BY_ROLE[k] ?? [])
    .filter((i) => visible.has(i.module) && current.permissions[i.module].change !== "none" && !seenQuick.has(i.label) && seenQuick.add(i.label))
    .slice(0, 6);
  // Where the school is, for the menu: the town from the main campus address.
  const parts = campus?.address?.split(",").map((x) => x.trim()).filter(Boolean) ?? [];
  const place = parts.length >= 3 ? parts.slice(-3, -1).join(", ") : parts[0] ?? campus?.name ?? "";

  return {
    menu,
    bottom,
    quick,
    place,
    pages,
    shortcuts: shortcutsFor(current.roles.map((r) => r.key), current.permissions, visible).map((s) => ({ label: s.label, href: s.href })),
    unread,
    approvals,
    canApprove,
    roleNames: current.roles.map((r) => r.name).join(", "),
  };
}
