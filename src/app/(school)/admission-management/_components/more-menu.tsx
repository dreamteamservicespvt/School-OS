"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";

export type MenuItem = { icon: LucideIcon; label: string; onClick?: () => void; href?: string; tone?: "bad" };

/** The "…" menu on a record (design/ui-prototype/src/kit.jsx MoreMenu). */
export function MoreMenu({ items, label = "More actions", size = "md" }: { items: MenuItem[]; label?: string; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const click = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", click);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", click); };
  }, [open]);
  if (!items.length) return null;
  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" size={size} icon={Ellipsis} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className="!px-3" />
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-40 w-60 bg-surface border border-line rounded-2xl shadow-pop p-1.5 animate-rise">
          {items.map((it) => {
            const Ic = it.icon;
            const cls = cx("w-full flex items-center gap-2.5 h-10 px-3 rounded-xl hover:bg-sunken text-[14px] text-left", it.tone === "bad" && "text-bad");
            const inner = <><Ic size={17} className={it.tone === "bad" ? "" : "text-ink3"} aria-hidden="true" />{it.label}</>;
            return it.href
              ? <Link key={it.label} role="menuitem" href={it.href} className={cls} onClick={() => setOpen(false)}>{inner}</Link>
              : <button key={it.label} role="menuitem" type="button" className={cls} onClick={() => { setOpen(false); it.onClick?.(); }}>{inner}</button>;
          })}
        </div>
      )}
    </div>
  );
}
