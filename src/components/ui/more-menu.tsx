"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Ellipsis } from "lucide-react";
import { Button, type ButtonSize } from "./button";
import { cx } from "./cx";

// The "…" menu on a record (design/ui-prototype/src/kit.jsx MoreMenu).

export type MenuItem = { icon: LucideIcon; label: string; onClick?: () => void; href?: string; tone?: "bad" };

export function MoreMenu({ items, label = "More actions", size = "md" }: { items: MenuItem[]; label?: string; size?: ButtonSize }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", key);
    ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  if (items.length === 0) return null;
  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <Button variant="secondary" size={size} icon={Ellipsis} aria-label={label} aria-haspopup="menu" aria-expanded={open} title={label} onClick={() => setOpen(!open)} className="!px-3" />
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="menu" aria-label={label} className="absolute right-0 top-11 z-40 w-60 bg-surface border border-line rounded-2xl shadow-pop p-1.5 animate-rise">
            {items.map((it) => {
              const Ic = it.icon;
              const cls = cx("w-full flex items-center gap-2.5 h-10 px-3 rounded-xl hover:bg-sunken focus:bg-sunken outline-none text-[14px] text-left", it.tone === "bad" && "text-bad");
              const inner = <><Ic size={17} className={it.tone === "bad" ? "" : "text-ink3"} aria-hidden="true" />{it.label}</>;
              return it.href
                ? <Link key={it.label} role="menuitem" href={it.href} className={cls} onClick={() => setOpen(false)}>{inner}</Link>
                : <button key={it.label} type="button" role="menuitem" className={cls} onClick={() => { setOpen(false); it.onClick?.(); }}>{inner}</button>;
            })}
          </div>
        </>
      )}
    </div>
  );
}
