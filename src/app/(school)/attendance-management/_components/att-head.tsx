import { Eye, User } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Tabs, type Tab } from "@/components/ui/tabs";
import { Pill } from "@/components/ui/badge";
import { BASE, type AttendanceAccess } from "@/lib/attendance/access";
import type { AttendanceFeature } from "@/lib/attendance/settings";
import { Words } from "@/lib/i18n/client";

/** The module's pages as tabs (05 §2). Each person sees only the pages their role reaches. */
export function attendanceTabs(access: AttendanceAccess, features: Set<AttendanceFeature>): Tab[] {
  const optional = features.has("attendance-devices") || features.has("attendance-qr") || features.has("attendance-mobile");
  const students = access.students !== "none";
  const shown = (mode: AttendanceAccess["pages"]["take"]) => mode !== "hidden";
  return [
    ...(students && access.change !== "none" && shown(access.pages.take) ? [{ href: BASE, label: "Take Attendance", exact: true }] : []),
    ...(students && shown(access.pages.register) ? [{ href: `${BASE}/register`, label: "Attendance Register" }] : []),
    ...(access.studentLeave !== "none" && shown(access.pages.studentLeave) ? [{ href: `${BASE}/student-leave`, label: "Student Leave" }] : []),
    ...(access.staff !== "none" && shown(access.pages.staff) ? [{ href: `${BASE}/staff`, label: "Staff Attendance" }] : []),
    ...(students || access.staff === "all" ? [{ href: `${BASE}/reports`, label: "Attendance Reports" }] : []),
    ...(access.admin && optional && shown(access.pages.devices) ? [{ href: `${BASE}/devices`, label: "Devices & QR" }] : []),
    ...(access.admin && shown(access.pages.settings) ? [{ href: `${BASE}/settings`, label: "Attendance Settings" }] : []),
  ];
}

/**
 * Every Attendance page's head (design/ui-prototype/src/kit.jsx ModuleHead):
 * "Attendance", one line of context, the page's actions, then the page tabs.
 */
export function AttHead({ access, features, userId, href, sub, actions }: {
  access: AttendanceAccess; features: Set<AttendanceFeature>; userId: string; href: string; sub?: React.ReactNode; actions?: React.ReactNode;
}) {
  const tabs = attendanceTabs(access, features);
  // Pages the person reads but does not fill in carry "View only", like a View module.
  const path = href.split("?")[0];
  const key = path === `${BASE}/register` ? "register" : path === `${BASE}/staff` ? "staff" : path.startsWith(`${BASE}/devices`) ? "devices" : path === `${BASE}/settings` ? "settings" : null;
  const readOnly = key !== null && access.pages[key] === "view";
  const scope = access.change === "none" || readOnly
    ? <Pill tone="neutral" className="!h-6 mr-2 align-middle"><Eye size={13} aria-hidden="true" /><Words k="View only" /></Pill>
    : access.see === "own" ? <Pill tone="brand" className="!h-6 mr-2 align-middle"><User size={13} aria-hidden="true" /><Words k="Only yours" /></Pill> : null;
  return (
    <>
      <PageHeader title="Attendance" href={href} userId={userId} sub={scope || sub ? <>{scope}{sub}</> : undefined}>{actions}</PageHeader>
      {tabs.length > 1 && <Tabs label="Attendance pages" tabs={tabs} />}
    </>
  );
}
