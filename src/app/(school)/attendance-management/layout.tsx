import { Tabs, type Tab } from "@/components/ui/tabs";
import { attendancePage } from "@/lib/attendance/page";
import { BASE } from "@/lib/attendance/access";

/** The pages of Attendance Management as tabs (05 §2). Each person sees only the pages their role reaches. */
export default async function AttendanceLayout({ children }: { children: React.ReactNode }) {
  const { access, features } = await attendancePage();
  const optional = features.has("attendance-devices") || features.has("attendance-qr") || features.has("attendance-mobile");
  const students = access.students !== "none";
  const tabs: Tab[] = [
    ...(students && access.change !== "none" ? [{ href: BASE, label: "Take Attendance", exact: true }] : []),
    ...(students ? [{ href: `${BASE}/register`, label: "Attendance Register" }] : []),
    ...(access.studentLeave !== "none" ? [{ href: `${BASE}/student-leave`, label: "Student Leave" }] : []),
    ...(access.staff !== "none" ? [{ href: `${BASE}/staff`, label: "Staff Attendance" }] : []),
    ...(students || access.staff === "all" ? [{ href: `${BASE}/reports`, label: "Attendance Reports" }] : []),
    ...(access.admin && optional ? [{ href: `${BASE}/devices`, label: "Devices & QR" }] : []),
    ...(access.admin ? [{ href: `${BASE}/settings`, label: "Attendance Settings" }] : []),
  ];
  return (
    <>
      <Tabs label="Attendance Management pages" tabs={tabs} />
      {children}
    </>
  );
}
