import {
  BadgeCheck, BedDouble, BookOpen, Boxes, Bus, CalendarCheck2, CalendarDays, ChartColumn, ChartLine, CircleCheck, ClipboardCheck, Clock, DoorOpen, FileText,
  GraduationCap, IdCard, Inbox, IndianRupee, Landmark, Library, ListTodo, MessagesSquare, NotebookPen, RefreshCw, Scale, TriangleAlert, UserPlus, Users,
  Wallet, type LucideIcon,
} from "lucide-react";
import { ModuleHead } from "@/components/shell/module-head";
import type { Category } from "@/lib/reports/types";
import { repPage } from "../_lib/page";

/** The header and page tabs on every Reports & Analytics page. */
export async function RepHead({ pageName, href, sub, actions, title = "Reports & Analytics", tabs = true }: { pageName: string; href: string; sub?: React.ReactNode; actions?: React.ReactNode; title?: string; tabs?: boolean }) {
  const p = await repPage();
  const reach = p.a.full ? "all" : p.a.own ? "own" : "view";
  return <ModuleHead title={title} pageName={pageName} href={href} userId={p.current.user.id} sub={sub} actions={actions} tabs={tabs ? p.tabs : null} tabsLabel="Reports & Analytics pages" reach={reach} />;
}

/** Each category's icon (prototype CAT_ICON). */
export const CAT_ICON: Record<Category, LucideIcon> = {
  Students: GraduationCap, Admissions: UserPlus, Attendance: CalendarCheck2, Fees: IndianRupee, Finance: Landmark, Exams: ClipboardCheck,
  "Staff and HR": Users, Salary: Wallet, Communication: MessagesSquare, Transport: Bus, Library, Inventory: Boxes, Hostel: BedDouble,
  "Front Office": DoorOpen, Homework: NotebookPen, Events: CalendarDays, Tasks: ListTodo,
};

/** Icons named by the Reports & Analytics data (analytics numbers and charts, government returns). */
export const ICON: Record<string, LucideIcon> = {
  Landmark, IdCard, Scale, BadgeCheck, ClipboardCheck, GraduationCap, UserPlus, CalendarCheck2, Users, ChartColumn, CircleCheck, ChartLine,
  TriangleAlert, CalendarDays, IndianRupee, Wallet, Clock, RefreshCw, BookOpen, Inbox,
};
export const GOV_ICON = ICON;
export const iconOr = (m: Record<string, LucideIcon>, k: string) => m[k] ?? FileText;
