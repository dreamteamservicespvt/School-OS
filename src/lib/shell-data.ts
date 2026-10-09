// What the top bar and menu show for the signed-in person.
import "server-only";

import { withSchool } from "./db";
import { BUILT_MODULES, MODULES } from "./modules";
import { shortcutsFor } from "./shortcuts";
import { approvalsFor } from "./approvals";
import type { Current } from "./current";

export async function shellData(current: Current) {
  const { unread, approvals } = await withSchool(current.ctx, async (tx) => ({
    unread: await tx.notification.count({ where: { userLoginId: current.user.id, readAt: null } }),
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
  const canApprove =
    approvals > 0 ||
    current.roles.some((r) => r.key === "class-teacher") ||
    MODULES.some((m) => current.permissions[m.key].change === "all");

  return {
    menu,
    pages,
    shortcuts: shortcutsFor(current.roles.map((r) => r.key), current.permissions, visible).map((s) => ({ label: s.label, href: s.href })),
    unread,
    approvals,
    canApprove,
    roleNames: current.roles.map((r) => r.name).join(", "),
  };
}
