"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ApprovalIcon, BellIcon, HomeIcon, SearchIcon, UserIcon } from "@/components/icons";
import { OPEN_SEARCH_EVENT } from "./search-box";

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="absolute -right-1.5 -top-1 min-w-5 rounded-full bg-danger px-1 text-center text-[11px] font-semibold leading-5 text-white">{count > 99 ? "99+" : count}</span>;
}

/** Phones: Home, Search, Approvals, Notifications, Me (00-global.md §6). */
export function BottomBar({ approvals, unread, showApprovals }: { approvals: number; unread: number; showApprovals: boolean }) {
  const pathname = usePathname();
  const item = (href: string, label: string, icon: React.ReactNode, count = 0) => {
    const active = pathname === href;
    return (
      <Link href={href} aria-current={active ? "page" : undefined}
        className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${active ? "text-brand-text" : "text-ink-2"}`}>
        <span className="relative">{icon}<Badge count={count} /></span>
        {label}
      </Link>
    );
  };
  return (
    <nav aria-label="Quick menu" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden">
      {item("/dashboard", "Home", <HomeIcon />)}
      <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}
        className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-ink-2">
        <SearchIcon />Search
      </button>
      {showApprovals && item("/approvals", "Approvals", <ApprovalIcon />, approvals)}
      {item("/notifications", "Notifications", <BellIcon />, unread)}
      {item("/profile", "Me", <UserIcon />)}
    </nav>
  );
}

export { Badge };
