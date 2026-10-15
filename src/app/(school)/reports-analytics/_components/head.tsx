import {
  BadgeCheck, BedDouble, Boxes, Bus, CalendarCheck2, CalendarDays, ClipboardCheck, DoorOpen, FileText, GraduationCap, IdCard, IndianRupee, Landmark,
  Library, ListTodo, MessagesSquare, NotebookPen, Scale, UserPlus, Users, Wallet, type LucideIcon,
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

/** Government return icons (prototype GOV). */
export const GOV_ICON: Record<string, LucideIcon> = { Landmark, IdCard, Scale, BadgeCheck, ClipboardCheck };
export const iconOr = (m: Record<string, LucideIcon>, k: string) => m[k] ?? FileText;
