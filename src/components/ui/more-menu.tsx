"use client";

// The "..." menu on a record (design/ui-prototype/src/kit.jsx MoreMenu). Each item is a link.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Ellipsis } from "lucide-react";
import { Button } from "./button";
import { cx } from "./cx";

export type MenuItem = { icon: LucideIcon; label: string; href: string; tone?: "bad"; download?: boolean };

export function MoreMenu({ items, label = "More actions", size = "md" }: { items: MenuItem[]; label?: string; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const click = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", key);
    window.addEventListener("mousedown", click);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("mousedown", click); };
  }, [open]);
  if (!items.length) return null;
  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" size={size} icon={Ellipsis} aria-label={label} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)} className="!px-3" />
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-40 w-64 bg-surface border border-line rounded-2xl shadow-pop p-1.5 animate-rise">
          {items.map(({ icon: Ic, label: l, href, tone, download }) => {
            const cls = cx("w-full flex items-center gap-2.5 h-10 px-3 rounded-xl hover:bg-sunken text-[14px] text-left", tone === "bad" && "text-bad");
            const inner = <><Ic size={17} className={tone === "bad" ? "" : "text-ink3"} aria-hidden="true" />{l}</>;
            return download
              ? <a key={l} role="menuitem" href={href} className={cls} onClick={() => setOpen(false)}>{inner}</a>
              : <Link key={l} role="menuitem" href={href} scroll={false} className={cls} onClick={() => setOpen(false)}>{inner}</Link>;
          })}
        </div>
      )}
    </div>
  );
}
