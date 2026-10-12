import { Eye, User } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Tabs, type Tab } from "@/components/ui/tabs";
import { Pill } from "@/components/ui/badge";
import { BASE, type AttendanceAccess } from "@/lib/attendance/access";
import type { AttendanceFeature } from "@/lib/attendance/settings";

/** The module's pages as tabs (05 §2). Each person sees only the pages their role reaches. */
export function attendanceTabs(access: AttendanceAccess, features: Set<AttendanceFeature>): Tab[] {
  const optional = features.has("attendance-devices") || features.has("attendance-qr") || features.has("attendance-mobile");
  const students = access.students !== "none";
  return [
    ...(students && access.change !== "none" ? [{ href: BASE, label: "Take Attendance", exact: true }] : []),
    ...(students ? [{ href: `${BASE}/register`, label: "Attendance Register" }] : []),
    ...(access.studentLeave !== "none" ? [{ href: `${BASE}/student-leave`, label: "Student Leave" }] : []),
    ...(access.staff !== "none" ? [{ href: `${BASE}/staff`, label: "Staff Attendance" }] : []),
    ...(students || access.staff === "all" ? [{ href: `${BASE}/reports`, label: "Attendance Reports" }] : []),
    ...(access.admin && optional ? [{ href: `${BASE}/devices`, label: "Devices & QR" }] : []),
    ...(access.admin ? [{ href: `${BASE}/settings`, label: "Attendance Settings" }] : []),
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
  const scope = access.change === "none"
    ? <Pill tone="neutral" className="!h-6 mr-2 align-middle"><Eye size={13} aria-hidden="true" />View only</Pill>
    : access.see === "own" ? <Pill tone="brand" className="!h-6 mr-2 align-middle"><User size={13} aria-hidden="true" />Only yours</Pill> : null;
  return (
    <>
      <PageHeader title="Attendance" href={href} userId={userId} sub={scope || sub ? <>{scope}{sub}</> : undefined}>{actions}</PageHeader>
      {tabs.length > 1 && <Tabs label="Attendance pages" tabs={tabs} />}
    </>
  );
}
