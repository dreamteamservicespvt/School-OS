import Link from "next/link";
import { requireCurrent } from "@/lib/current";
import { shellData } from "@/lib/shell-data";
import { ApprovalIcon, BellIcon, CalendarIcon, MessageIcon } from "@/components/icons";
import { SideMenu, MenuButton } from "@/components/shell/side-menu";
import { SearchBox } from "@/components/shell/search-box";
import { ProfileMenu } from "@/components/shell/profile-menu";
import { SchoolSwitcher } from "@/components/shell/school-switcher";
import { BottomBar, Badge } from "@/components/shell/bottom-bar";
import { Toast } from "@/components/ui/toast";
import { readFlash } from "@/lib/flash";
import { undoChange } from "./undo-action";
import { activeSystemNotices } from "@/lib/errors";
import { withSchool } from "@/lib/db";
import { currentYear } from "@/lib/academic/years";

export const dynamic = "force-dynamic";

function YearChip({ year }: { year: { name: string; status: string } | null }) {
  // The academic year every screen works in (03-school-year-and-day.md).
  return (
    <Link href="/academic-management/settings" className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-ink-2 hover:bg-surface-2"
      title={year ? `Academic year ${year.name}` : "Open an academic year in Academic Settings"}>
      <CalendarIcon className="size-5" />
      <span>{year ? `Year ${year.name}` : "No academic year yet"}</span>
    </Link>
  );
}

function TopIcon({ href, label, count, children }: { href: string; label: string; count?: number; children: React.ReactNode }) {
  const text = count ? `${label}, ${count} new` : label;
  return (
    <Link href={href} aria-label={text} title={label} className="relative grid size-11 place-items-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink">
      <span className="relative">{children}<Badge count={count ?? 0} /></span>
    </Link>
  );
}

export default async function SchoolLayout({ children }: { children: React.ReactNode }) {
  const current = await requireCurrent();
  const [shell, flashed, notices, year] = await Promise.all([
    shellData(current),
    readFlash(),
    activeSystemNotices(),
    withSchool(current.ctx, (tx) => currentYear(tx, current.ctx)),
  ]);
  const school = { id: current.school.id, name: current.school.name };

  return (
    <div className="min-h-dvh lg:pl-64">
      <a href="#main" className="skip-link">Skip to the page</a>
      <SideMenu items={shell.menu} schoolName={current.school.name} footer={<YearChip year={year} />} />

      <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line bg-surface/95 px-2 backdrop-blur sm:px-4">
        <MenuButton />
        {current.schools.length > 1 ? (
          <SchoolSwitcher current={school} schools={current.schools.map((s) => ({ id: s.id, name: s.name }))} />
        ) : (
          <span className="max-w-[14rem] truncate px-2 font-medium lg:hidden">{current.school.name}</span>
        )}
        <div className="flex flex-1 justify-center px-2">
          <SearchBox userId={current.user.id} pages={shell.pages} shortcuts={shell.shortcuts} />
        </div>
        <div className="hidden md:block"><YearChip year={year} /></div>
        <nav aria-label="Your work" className="hidden items-center sm:flex">
          {shell.canApprove && <TopIcon href="/approvals" label="Approvals" count={shell.approvals}><ApprovalIcon /></TopIcon>}
          <TopIcon href="/notifications" label="Notifications" count={shell.unread}><BellIcon /></TopIcon>
          <TopIcon href="/messages" label="Messages"><MessageIcon /></TopIcon>
        </nav>
        <ProfileMenu name={current.user.displayName} roles={shell.roleNames} />
      </header>

      {notices.map((n) => (
        <div key={n.id} role="status" className={`border-b border-line px-4 py-2 text-center text-sm ${n.level === "problem" ? "bg-danger-soft" : n.level === "info" ? "bg-info-soft" : "bg-warn-bg text-warn-text"}`}>
          {n.message}
        </div>
      ))}
      <main id="main" className="mx-auto max-w-6xl p-4 pb-24 sm:p-6">{children}</main>
      <Toast key={flashed ? JSON.stringify(flashed) : "none"} flash={flashed} undoAction={undoChange} />
      <BottomBar approvals={shell.approvals} unread={shell.unread} showApprovals={shell.canApprove} />
    </div>
  );
}
