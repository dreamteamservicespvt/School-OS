"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CloseIcon, ModuleIcon } from "@/components/icons";
import type { MenuItem } from "./nav-data";

export const OPEN_MENU_EVENT = "sos:open-menu";

function MenuList({ items, onPick }: { items: MenuItem[]; onPick?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.key}>
            <Link
              href={item.href}
              onClick={onPick}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] ${
                active ? "bg-brand-soft font-medium text-brand-text" : "text-ink hover:bg-surface-2"
              }`}
            >
              <ModuleIcon module={item.key} className="size-5 shrink-0" />
              <span>{item.name}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Full side menu on computers; a slide-out drawer on phones and tablets (00-global.md §6). */
type SideMenuProps = { items: MenuItem[]; schoolName: string; footer?: React.ReactNode };

export function SideMenu(props: SideMenuProps) {
  // A new page starts with the drawer closed.
  return <SideMenuInner key={usePathname()} {...props} />;
}

function SideMenuInner({ items, schoolName, footer }: SideMenuProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_MENU_EVENT, show);
    return () => window.removeEventListener(OPEN_MENU_EVENT, show);
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  return (
    <>
      <nav aria-label="Main menu" className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-line px-4">
          <Image src="/icon.svg" alt="" width={32} height={32} />
          <span className="truncate font-semibold">{schoolName}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <MenuList items={items} />
        </div>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Main menu">
          <button type="button" className="absolute inset-0 bg-overlay" aria-label="Close menu" onClick={() => setOpen(false)} />
          <nav className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col bg-surface shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-line px-4">
              <span className="truncate font-semibold">{schoolName}</span>
              <button type="button" onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-lg hover:bg-surface-2" aria-label="Close menu">
                <CloseIcon />
              </button>
            </div>
            {footer && <div className="border-b border-line p-3">{footer}</div>}
            <div className="flex-1 overflow-y-auto p-3">
              <MenuList items={items} onPick={() => setOpen(false)} />
            </div>
          </nav>
        </div>
      )}
    </>
  );
}

export function MenuButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_MENU_EVENT))}
      className="grid size-11 place-items-center rounded-lg hover:bg-surface-2 lg:hidden"
      aria-label="Open menu"
    >
      <MenuIconInline />
    </button>
  );
}

function MenuIconInline() {
  return (
    <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
